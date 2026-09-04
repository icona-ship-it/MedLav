import { createAdminClient } from '@/lib/supabase/admin';
import type { SynthesisParams } from '@/services/synthesis/synthesis-service';
import { calculateMedicoLegalPeriods } from '@/services/calculations/medico-legal-calc';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import { DETERMINISTIC_MARKERS, expandDeterministicBlocks, type DeterministicDoc } from '@/services/calculations/deterministic-tables';
import { buildStimaDannoMarker } from '@/services/calculations/stima-danno-block';
import type { CaseType } from '@/types';
import type { ConsolidatedEvent } from '@/services/consolidation/event-consolidator';
import type { DetectedAnomaly } from '@/services/validation/anomaly-detector';
import type { MissingDocument } from '@/services/validation/missing-doc-detector';
import type { ImageAnalysisResult } from '@/services/image-analysis/diagnostic-image-analyzer';
import type { CaseMetadata, SynthesisStepResult, DocumentOcrContext } from './types';
import { MISTRAL_MODELS, DETERMINISTIC_SEED } from '@/lib/mistral/client';
import { logger } from '@/lib/logger';

/**
 * Fetch OCR text for all documents in a case.
 * Called INSIDE step functions to avoid serializing large text between steps.
 */
/**
 * Carica l'OCR dei documenti di un caso. `onlyDocIds` (opzionale) restringe il
 * caricamento ai soli documenti indicati: fondamentale per i casi voluminosi —
 * la doc-sanitaria a finestre chiamava questa con tutti i 47+ doc e poi filtrava,
 * pagando il picco RAM dell'OCR INTERO a ogni finestra (causa OOM su caso-195).
 * Con onlyDocIds il picco scende all'OCR della sola finestra. `onlyDocIds=[]`
 * (finestra senza documenti referenziati) → nessun OCR.
 */
export async function fetchDocumentsOcrContext(caseId: string, onlyDocIds?: string[]): Promise<DocumentOcrContext[]> {
  const supabase = createAdminClient();

  if (onlyDocIds !== undefined && onlyDocIds.length === 0) return [];

  let docsQuery = supabase
    .from('documents')
    .select('id, file_name, document_type')
    .eq('case_id', caseId);
  if (onlyDocIds !== undefined) {
    docsQuery = docsQuery.in('id', onlyDocIds);
  }
  const { data: docs } = await docsQuery;

  if (!docs || docs.length === 0) return [];

  const docIds = docs.map((d) => d.id as string);

  // Batch pages fetch to avoid PostgREST URL limit with 500+ documents
  const pages: Array<Record<string, unknown>> = [];
  const PAGE_BATCH = 200;
  for (let i = 0; i < docIds.length; i += PAGE_BATCH) {
    const { data } = await supabase
      .from('pages')
      .select('document_id, page_number, ocr_text')
      .in('document_id', docIds.slice(i, i + PAGE_BATCH))
      .order('page_number', { ascending: true });
    if (data) pages.push(...data);
  }

  if (pages.length === 0) return [];

  const pagesByDoc = new Map<string, Array<{ pageNumber: number; ocrText: string }>>();
  for (const page of pages) {
    const docId = page.document_id as string;
    if (!pagesByDoc.has(docId)) pagesByDoc.set(docId, []);
    if (page.ocr_text) {
      pagesByDoc.get(docId)!.push({
        pageNumber: page.page_number as number,
        ocrText: page.ocr_text as string,
      });
    }
  }

  const result = docs
    .map((doc) => {
      const docPages = pagesByDoc.get(doc.id) ?? [];
      const totalChars = docPages.reduce((sum, p) => sum + p.ocrText.length, 0);
      return {
        documentId: doc.id as string,
        fileName: doc.file_name as string,
        documentType: (doc.document_type ?? 'altro') as string,
        pages: docPages,
        totalChars,
      };
    })
    .filter((d) => d.pages.length > 0);

  const totalChars = result.reduce((sum, d) => sum + d.totalChars, 0);
  logger.info('pipeline', `Fetched OCR text: ${result.length} docs, ${totalChars} total chars`);
  return result;
}

/**
 * Step 7a: Calculate medico-legal periods (instant, no API call).
 */
export function calculatePeriodsStep(
  allEvents: ConsolidatedEvent[],
  caseType: CaseMetadata['caseType'],
  incidentDate?: string | null,
): MedicoLegalCalculation[] {
  const calcEvents = allEvents.map((e) => ({
    event_date: e.eventDate,
    event_type: e.eventType,
    title: e.title,
    description: e.description,
    date_precision: e.datePrecision, // F-P2: le date anno-only non ancorano ITT/ITP
    temporal_scope: e.temporalScope, // 0034: i 'programmato' non entrano nei computi
  }));
  return calculateMedicoLegalPeriods(calcEvents, caseType, incidentDate);
}

/**
 * Build shared SynthesisParams from pipeline state.
 */
export function buildSynthesisParams(
  metadata: CaseMetadata,
  allEvents: ConsolidatedEvent[],
  anomalies: DetectedAnomaly[],
  missingDocs: MissingDocument[],
  calculations: MedicoLegalCalculation[],
  imageAnalysisResults: ImageAnalysisResult[],
  documentSummaries?: import('@/services/synthesis/document-summarizer').DocumentSummary[],
): SynthesisParams {
  return {
    caseType: metadata.caseType,
    caseTypes: metadata.caseTypes.length > 1 ? metadata.caseTypes : undefined,
    caseRole: metadata.caseRole,
    patientInitials: metadata.patientInitials,
    events: allEvents,
    anomalies,
    missingDocuments: missingDocs,
    calculations,
    periziaMetadata: metadata.periziaMetadata,
    imageAnalysis: imageAnalysisResults.length > 0 ? imageAnalysisResults : undefined,
    documentSummaries,
  };
}

/**
 * Save report to DB with full generation metadata.
 */
async function insertReportWithMetadata(
  caseId: string,
  synthesisText: string,
  wordCount: number,
  generationMetadata?: Record<string, unknown>,
): Promise<SynthesisStepResult> {
  const supabase = createAdminClient();

  // Retry version insertion to handle concurrent race conditions
  let report: { id: string } | null = null;
  for (let versionAttempt = 0; versionAttempt < 3; versionAttempt++) {
    const { data: latestReport } = await supabase
      .from('reports')
      .select('version')
      .eq('case_id', caseId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newVersion = ((latestReport?.version as number | null) ?? 0) + 1 + versionAttempt;

    const { data: inserted, error } = await supabase
      .from('reports')
      .insert({
        case_id: caseId,
        version: newVersion,
        report_status: 'bozza',
        synthesis: synthesisText,
        ...(generationMetadata ? { generation_metadata: generationMetadata } : {}),
      })
      .select('id')
      .single();

    if (!error && inserted) {
      report = inserted;
      logger.info('pipeline', `Report saved: case=${caseId} version=${newVersion} words=${wordCount} id=${inserted.id}`);
      break;
    }

    // If unique constraint violation (23505), retry with higher version
    if (error?.code === '23505') {
      logger.warn('pipeline', `Report version ${newVersion} conflict for case ${caseId}, retrying...`);
      continue;
    }

    logger.error('pipeline', `Failed to insert report for case ${caseId}`, {
      error: error?.message ?? 'No data returned',
      code: error?.code,
      synthesisLength: synthesisText?.length ?? 0,
    });
    throw new Error(`Report insert failed: ${error?.message ?? 'no data returned'}`);
  }

  if (!report) {
    throw new Error(`Report insert failed after 3 version attempts for case ${caseId}`);
  }

  return { reportId: report.id, reportVersion: 0, wordCount };
}

// ── Sectional report generation ─────────────────────────────────────

import { resolveSectionPlan } from '@/services/synthesis/section-catalog';
import { generateSingleSection } from '@/services/synthesis/section-generator';
import { computeSectionalPromptVersion } from './prompt-version-sectional';
import { validateReport, getBlockingIssues, partitionBlockingIssues, formatIssuesForLog } from '@/services/synthesis/report-validator';
import type { ReportValidationContext } from '@/services/synthesis/report-validator';
import { computeHrs, getHrsLevel } from '@/services/synthesis/hallucination-risk-scorer';
import type { SectionSpec, GeneratedSection, SectionContext } from '@/services/synthesis/section-generation-types';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { createEmptyUsage, mergeUsage } from '@/services/cost-tracking/cost-calculator';

/**
 * Assembla il blocco markdown di una sezione del report. Le sezioni intestazione
 * portano già il proprio heading corretto dal template (## Intestazione per
 * CTU/CTP; ## VALUTAZIONE…/## PARERE… per stragiudiziale/parere) → usate as-is,
 * preservando il titolo benchmark senza doppione. Per le altre, strippa un
 * eventuale heading ## iniziale (che l'LLM non dovrebbe emettere) e antepone il
 * titolo canonico. Pura, esportata per i test.
 */
export function assembleSectionBlock(id: string, title: string, content: string): string {
  if (id.startsWith('intestazione')) return content.trim();
  const cleanContent = content.replace(/^##\s+[^\n]+\n+/, '').trim();
  return `## ${title}\n\n${cleanContent}`;
}

/**
 * Plan which sections to generate based on case metadata.
 * Returns serializable SectionSpec array for Inngest step output.
 * @param documentTypes - actual document types from classification (NOT event sourceTypes)
 */
export function planReportSections(
  metadata: CaseMetadata,
  allEvents: ConsolidatedEvent[],
  documentTypes: string[],
): SectionSpec[] {

  const plan = resolveSectionPlan({
    caseType: metadata.caseType,
    caseTypes: metadata.caseTypes.length > 1 ? metadata.caseTypes : undefined,
    caseRole: metadata.caseRole,
    periziaMetadata: metadata.periziaMetadata,
    events: allEvents,
    documentTypes,
    moduleId: metadata.moduleId,
  });

  logger.info('pipeline', `Section plan: ${plan.length} sections [${plan.map((s) => s.id).join(', ')}]`);
  return plan;
}

/**
 * Generate a single section inside an Inngest step.
 * Fetches OCR text from DB if needed (avoids serialization between steps).
 */
/** Section ids whose perito-filled placeholder should be pre-populated with the
 * computed graduated ITT/ITP table. For CTU/CTP the danno biologico temporaneo
 * lives in `considerazioni_ml` (a placeholder), so without this the A2 table
 * would never reach the report body — only the events-tab UI. */
const ITT_ITP_PLACEHOLDER_SECTIONS = new Set(['considerazioni_ml']);

/** Options for buildPlaceholderContent — suppression flags + case type. */
export interface PlaceholderContentOptions {
  /** Case type — embedded in the STIMA_DANNO sentinel (Sprint 4.3). */
  caseType?: CaseType;
}

/**
 * A2 + B3 + Sprint 4.3: build placeholder content, embedding the DETERMINISTIC
 * SENTINELS for sections where the perito assesses the damage: the graduated
 * ITT/ITP table AND — for civil cases with a living periziando — the tabular
 * biological-damage estimate (TUN/Milano lookup on the midpoint of the
 * indicative range for the case type). Both sentinels are expanded at read time
 * (UI + export) from the CURRENT events, so the figures are ALWAYS in sync —
 * if the perito later corrects an event, the tables update by themselves, no
 * regeneration. The arithmetic is a proposal to verify; the medico-legal
 * judgment stays the perito's.
 */
export function buildPlaceholderContent(spec: SectionSpec, opts?: PlaceholderContentOptions): string {
  const base = spec.placeholderText ?? '';
  if (!ITT_ITP_PLACEHOLDER_SECTIONS.has(spec.id)) {
    return base;
  }
  // Guida di conversione (benchmark gold 2026-06-10): nei depositati i periodi
  // ITT/ITP compaiono come elenco in prosa motivato, non come tabella — la
  // tabella resta la fonte dei fatti, la formula guida la stesura del perito.
  const ittBlock = `${base}\n\n**Periodi di invalidità temporanea (proposta automatica — il perito verifica e corregge):**\n\n${DETERMINISTIC_MARKERS.ITT_ITP}\n\n*[Il perito trasforma la proposta in elenco motivato secondo la formula: "va ragionevolmente riconosciuto un periodo di: invalidità temporanea totale pari a NN (lettere) giorni, corrispondenti a [motivazione clinica, es. periodo di ricovero in ambiente nosocomiale], ovvero dal DD.MM.YYYY al DD.MM.YYYY, come da documentazione sanitaria; invalidità temporanea parziale al NN% pari a NN (lettere) giorni, per [motivazione clinica del periodo]".]*`;
  // Sprint 4.3: stima tabellare deterministica del danno biologico permanente
  // (range indicativo per tipo caso + lookup TUN/Milano sul punto medio),
  // sotto la tabella ITT/ITP. Solo CTU/CTP civile con periziando vivente.
  if (!opts?.caseType) {
    return ittBlock;
  }
  return `${ittBlock}\n\n**Stima tabellare del danno biologico (proposta automatica — il perito verifica, corregge e motiva):**\n\n${buildStimaDannoMarker(opts.caseType)}`;
}

export async function generateSectionStep(
  caseId: string,
  spec: SectionSpec,
  synthesisParams: SynthesisParams,
  previousContext: SectionContext[],
  /** Inngest retry attempt (0-based) — varies the LLM seed so retries differ (2.4-A1). */
  attempt?: number,
): Promise<GeneratedSection> {
  // Placeholder sections emit static text — no LLM call needed.
  if (spec.isPlaceholder) {
    return {
      id: spec.id,
      title: spec.title,
      content: buildPlaceholderContent(spec, {
        caseType: synthesisParams.caseType,
      }),
      contextSummary: '',
      wordCount: 0,
    };
  }

  // Fetch OCR text inside the step if this section needs it
  let documentsOcrText: DocumentOcrContext[] | undefined;
  if (spec.needsOcr) {
    const hasSummaries = synthesisParams.documentSummaries && synthesisParams.documentSummaries.length > 0;
    if (!hasSummaries) {
      documentsOcrText = await fetchDocumentsOcrContext(caseId);
    }
  }

  return generateSingleSection({
    spec,
    synthesisParams,
    previousContext,
    documentsOcrText,
    attempt,
  });
}

/** Options for assembleSectionsAndSaveReport (Sprint 2.4-A2 manual unlock). */
export interface AssembleReportOptions {
  /**
   * When true, QUALITY blocking findings do not prevent saving: the report is
   * saved with `generation_metadata.validationOverridden=true` + the list of
   * ignored findings, and an audit log row is written. GDPR/fabrication leaks
   * (NON_OVERRIDABLE_ERROR_TYPES) remain blocking ALWAYS.
   */
  ignoreValidation?: boolean;
  /** User requesting the override — recorded in the audit log. */
  userId?: string;
}

/** Image-analysis subset persisted into generation_metadata: drop token usage,
 * keep the fields a regenerate needs to re-feed the LLM and re-embed images.
 * Pure & testable. */
export function imageAnalysisForMetadata(
  imageAnalysis: ImageAnalysisResult[] | undefined,
): Array<{ pageNumber: number; imageType: string; description: string; confidence: number; storagePath?: string; documentId?: string }> {
  return (imageAnalysis ?? []).map((img) => ({
    pageNumber: img.pageNumber,
    imageType: img.imageType,
    description: img.description,
    confidence: img.confidence,
    storagePath: img.storagePath,
    documentId: img.documentId,
  }));
}

/** Strip image refs whose ocr-image path is NOT a real (analyzed) image — the
 * LLM occasionally invents them. Real paths come from imageAnalysis; on
 * regenerate they are reloaded so genuine images are NOT stripped. Pure &
 * testable (logs each strip). */
export function stripHallucinatedImageRefs(report: string, realImagePaths: Set<string>): string {
  return report.replace(
    /!\[[^\]]*\]\(ocr-image:([^)]+)\)\n*/g,
    (match: string, path: string) => {
      if (realImagePaths.has(path)) return match; // Real image — keep
      logger.warn('pipeline', `Stripped hallucinated image ref: ocr-image:${path}`);
      return ''; // Hallucinated — remove
    },
  );
}

/** Metadati per la didascalia deterministica di un'immagine. */
export interface ImageCaptionMeta {
  storagePath: string;
  imageType: string;
  description: string;
  pageNumber: number;
  documentId?: string;
}

/**
 * Riscrive in modo DETERMINISTICO la didascalia (alt-text) di OGNI immagine reale
 * nel report: "Fig. N — Tipo (descrizione) — fonte: nomeFile, pag. P". Risponde
 * alla domanda del perito "da dove viene questa immagine e perché". Vantaggi:
 * (1) fonte TRACCIABILE (documento + pagina) che l'LLM non poteva garantire;
 * (2) numerazione progressiva PER ORDINE DI APPARIZIONE → niente più "Fig. 1"
 * duplicate quando il report è generato a finestre. Puro e testabile.
 */
export function applyDeterministicImageCaptions(
  report: string,
  images: ImageCaptionMeta[],
  docNameById: Map<string, string>,
): string {
  const byPath = new Map(images.map((img) => [img.storagePath, img]));
  let n = 0;
  return report.replace(
    /!\[[^\]]*\]\(ocr-image:([^)]+)\)/g,
    (match: string, path: string) => {
      const img = byPath.get(path);
      if (!img) return match; // sconosciuta (verrà comunque strippata a monte)
      n += 1;
      const firstSentence = (img.description || '').split(/(?<=[.!?])\s/)[0]?.trim() ?? '';
      const typeLabel = img.imageType && img.imageType !== 'altro' ? img.imageType : 'Immagine diagnostica';
      const docName = img.documentId ? docNameById.get(img.documentId) : undefined;
      const source = docName ? ` — fonte: ${docName}, pag. ${img.pageNumber}` : ` — pag. ${img.pageNumber}`;
      const desc = firstSentence ? ` (${firstSentence})` : '';
      // Sanitizza le parentesi quadre: un ']' nell'alt-text (es. da una
      // descrizione Pixtral che contiene "[...]") chiuderebbe in anticipo la
      // sintassi markdown dell'immagine e romperebbe il riferimento.
      const alt = `Fig. ${n} — ${typeLabel}${desc}${source}`.replace(/[[\]]/g, '');
      return `![${alt}](ocr-image:${path})`;
    },
  );
}

/**
 * Assemble all generated sections into a final report and save to DB.
 * No LLM call — pure assembly + validation + DB insert.
 *
 * @param sectionPlan - resolved SectionSpec[] used for generation: the REAL
 *   prompt material is hashed into promptVersion (Sprint 2.3, ADR-011).
 */
export async function assembleSectionsAndSaveReport(
  caseId: string,
  sectionsInput: GeneratedSection[],
  synthesisParams: SynthesisParams,
  sectionPlan: SectionSpec[],
  options?: AssembleReportOptions,
): Promise<SynthesisStepResult & { promptVersion?: string }> {
  // Affidabilità (2026-07-04): le sezioni voluminose (doc-sanitaria batched)
  // arrivano con contentPath (testo su Storage) e content vuoto — si risolvono
  // QUI, dentro lo step di assemble, così il testo non transita mai nello
  // stato del run Inngest (tetto body Vercel ~4,5MB).
  const { resolveSectionContents } = await import('./section-part-store');
  const sections = await resolveSectionContents(sectionsInput);

  // Assemble full report markdown.
  // Strip ANY leading ## heading the content may already carry (the LLM despite
  // instructions, o il template intestazione che emette il proprio titolo es.
  // "## VALUTAZIONE..."), poi anteponi il titolo canonico della sezione. Evita il
  // doppio heading "## Intestazione" + "## VALUTAZIONE..." nello stragiudiziale/parere.
  const reportParts = sections.map((s) => assembleSectionBlock(s.id, s.title, s.content));
  let fullReport = reportParts.join('\n\n');

  // HARD FILTER: Strip hallucinated image references — any ocr-image: path NOT
  // produced by the analysis is invented by the LLM. Real paths come from
  // imageAnalysis (persisted + reloaded on regenerate, so images survive).
  const realImagePaths = new Set(
    (synthesisParams.imageAnalysis ?? [])
      .filter((img) => img.storagePath)
      .map((img) => img.storagePath!),
  );
  fullReport = stripHallucinatedImageRefs(fullReport, realImagePaths);

  // Didascalie DETERMINISTICHE con FONTE (documento + pagina): risponde alla
  // domanda "da dove viene questa immagine" e rende la numerazione progressiva
  // (niente "Fig. 1" duplicate). La fonte-nome viene da documentsOcrText.
  const docNameById = new Map(
    (synthesisParams.documentsOcrText ?? []).map((d) => [d.documentId, d.fileName]),
  );
  const captionImages = (synthesisParams.imageAnalysis ?? [])
    .filter((img) => img.storagePath)
    .map((img) => ({
      storagePath: img.storagePath!,
      imageType: img.imageType,
      description: img.description,
      pageNumber: img.pageNumber,
      documentId: img.documentId,
    }));
  if (captionImages.length > 0) {
    fullReport = applyDeterministicImageCaptions(fullReport, captionImages, docNameById);
  }

  // Wave 3.3 — Source attribution appendix: append a "## Riferimenti
  // Documentali" section listing each unique document cited in the report.
  // This gives the perito a quick index of the source events without changing
  // the body of the report. Uses date-based matching against synthesisParams.events.
  // RC stragiudiziale (perizia "semplice", gold Lavini): NIENTE appendice "Riferimenti
  // Documentali" — fa trapelare ID interni (ev. #N), tassonomia macchina e i lab esclusi in
  // un atto depositabile. Gli altri ruoli (CTU/CTP) la tengono come indice di tracciabilità.
  if (synthesisParams.caseRole !== 'stragiudiziale') {
    const appendix = buildDocumentReferencesAppendix(fullReport, synthesisParams.events);
    if (appendix) {
      fullReport = `${fullReport}\n\n${appendix}`;
    }
  }

  const totalWordCount = sections.reduce((sum, s) => sum + s.wordCount, 0);

  // Compute prompt version from the REAL section prompts (Sprint 2.3): hash the
  // resolved plan specs of the sections actually generated, so any change to
  // section-catalog directives / placeholders / role-prompts / peritale
  // formulations changes generation_metadata.promptVersion.
  const generatedIds = new Set(sections.map((s) => s.id));
  const promptVersion = computeSectionalPromptVersion({
    caseType: synthesisParams.caseType,
    caseRole: synthesisParams.caseRole,
    caseTypes: synthesisParams.caseTypes,
    sections: sectionPlan.filter((spec) => generatedIds.has(spec.id)),
  });

  // Validate assembled report. A3: pass the assembled section titles as
  // role-mandatory sections so an empty/failed section blocks the save.
  const validationContext: ReportValidationContext = {
    events: synthesisParams.events.map((e) => ({ orderNumber: e.orderNumber, eventDate: e.eventDate })),
    calculations: synthesisParams.calculations?.map((c) => ({ label: c.label, value: c.value, days: c.days })),
    requiredSectionTitles: sections.map((s) => s.title),
  };

  // Valida il report ESPANSO: i marker deterministici (ITT/ITP, spese, cronologia)
  // si espandono in tabelle con contenuto reale solo at-read-time. Un report molto
  // ridotto (selettore sezioni) ha pochi "parole" in forma grezza ma supera la soglia
  // una volta espanso → evitiamo il falso "report troppo corto" (e il retry Inngest).
  // NB: salviamo comunque `fullReport` GREZZO (marker intatti) → l'espansione resta
  // dinamica a read-time (ITT/ITP/spese sempre in sync con gli eventi correnti).
  const validationEvents = synthesisParams.events.map((e) => ({
    event_date: e.eventDate,
    date_precision: e.datePrecision,
    temporal_scope: e.temporalScope, // 0034: il testo validato = quello reso a read-time
    event_type: e.eventType,
    title: e.title,
    description: e.description,
    // Allineamento con l'espansione a read-time (audit 2026-07-16): senza
    // source_text/facility il testo VALIDATO differiva da quello che il perito
    // vede (importi SSR riconoscibili solo dall'ancora OCR, strutture in tabella).
    facility: e.facility ?? null,
    source_text: e.sourceText ?? null,
  }));
  // documentazione_sanitaria is a DETERMINISTIC placeholder (verbatim OCR via the
  // DOC_SANITARIA sentinel). The raw report only carries the marker, so validate
  // against the EXPANDED report (with the OCR docs) — otherwise coverage/word-count
  // sees a near-empty body and falsely blocks the save as "too short".
  let docsForValidation: DeterministicDoc[] | undefined;
  if (fullReport.includes(DETERMINISTIC_MARKERS.DOC_SANITARIA)) {
    const ocrDocs = await fetchDocumentsOcrContext(caseId);
    docsForValidation = ocrDocs.map((d) => ({
      documentId: d.documentId,
      fileName: d.fileName,
      documentType: d.documentType,
      pages: d.pages.map((p) => ({ pageNumber: p.pageNumber, ocrText: p.ocrText })),
    }));
  }
  const reportForValidation = expandDeterministicBlocks(fullReport, validationEvents, docsForValidation, {
    incidentDate: synthesisParams.periziaMetadata?.dataSinistro,
    docSanitariaMode: synthesisParams.periziaMetadata?.docSanitariaMode ?? null,
  });
  let validation = validateReport(reportForValidation, synthesisParams.events.length, validationContext);
  // #5 (audit 2026-06-09): quando la doc-sanitaria verbatim viene espansa nel testo
  // validato, un documento-FONTE può legittimamente contenere "01/01/1900" o un
  // artefatto "[object Object]"/": null" — che fa scattare FALSAMENTE
  // sentinel_date_leak / broken_ocr_marker e BLOCCA il report in modo permanente
  // (throw → retry Inngest → caso bloccato in "errore", nessun report). Quei due
  // check devono vedere SOLO la prosa generata dall'LLM: li rivalutiamo sul report
  // GREZZO (DOC_SANITARIA non espanso); coverage/word-count/sezioni restano sull'espanso.
  if (docsForValidation) {
    const ocrSensitive = new Set(['sentinel_date_leak', 'broken_ocr_marker']);
    const rawSensitiveIssues = validateReport(fullReport, synthesisParams.events.length, validationContext)
      .issues.filter((i) => ocrSensitive.has(i.type));
    const mergedIssues = [
      ...validation.issues.filter((i) => !ocrSensitive.has(i.type)),
      ...rawSensitiveIssues,
    ];
    validation = { ...validation, issues: mergedIssues, valid: !mergedIssues.some((i) => i.severity === 'error') };
  }
  // Sprint 2.4-A2: quality findings consciously ignored via the manual unlock
  // (ignoreValidation). Recorded in generation_metadata + audit log below.
  let overriddenIssues: Array<{ type: string; message: string }> = [];
  if (validation.issues.length > 0) {
    const errors = validation.issues.filter((i) => i.severity === 'error');
    const warnings = validation.issues.filter((i) => i.severity === 'warning');
    // GDPR Art.9: solo tipo+conteggio nei log — i `message` degli issue possono
    // citare testo clinico del report (citazioni/blocchi/nomi). I messaggi completi
    // restano per il perito in UI/DB.
    if (errors.length > 0) {
      logger.warn('pipeline', `Sectional report validation errors: ${formatIssuesForLog(errors)}`);
    }
    if (warnings.length > 0) {
      logger.info('pipeline', `Sectional report validation warnings: ${formatIssuesForLog(warnings)}`);
    }

    // A3: block saving for all blocking-policy errors (centralized in
    // report-validator.ts). Includes required-section-missing, coverage floor,
    // sentinel dates, broken OCR markers, header mismatch/fabrication.
    const criticalErrors = getBlockingIssues(validation);
    if (criticalErrors.length > 0) {
      if (options?.ignoreValidation) {
        // Manual unlock: only QUALITY findings are ignorable. GDPR/fabrication
        // leaks (explicit whitelist in report-validator.ts) block ALWAYS.
        const { overridable, nonOverridable } = partitionBlockingIssues(validation);
        if (nonOverridable.length > 0) {
          // GDPR Art.9: l'Error si propaga a Inngest/Sentry → solo tipo+conteggio,
          // mai il message (può citare testo clinico). Dettaglio per il perito in UI.
          throw new Error(
            `Report bloccato (controllo NON ignorabile — possibile leak dati/fabbricazione): ` +
            `${formatIssuesForLog(nonOverridable)}.`,
          );
        }
        overriddenIssues = overridable.map((e) => ({ type: e.type, message: e.message }));
        logger.warn('pipeline',
          `Validation OVERRIDDEN for case ${caseId} (ignoreValidation): ` +
          `${overriddenIssues.map((i) => i.type).join(', ')}. Report salvato su richiesta esplicita dell'utente.`,
        );
      } else {
        // GDPR Art.9: tipo+conteggio nell'Error (→ Inngest/Sentry), non il message clinico.
        throw new Error(
          `Report non valido: ${formatIssuesForLog(criticalErrors)}. ` +
          `Inngest riprovera la generazione.`,
        );
      }
    }
  }

  // Merge all token usage
  let totalUsage: TokenUsage = createEmptyUsage();
  for (const section of sections) {
    if (section.usage) {
      totalUsage = mergeUsage(totalUsage, section.usage);
    }
  }

  // Compute Hallucination Risk Score (informational, doesn't block save)
  const hrs = computeHrs(validation);
  const hrsLevel = getHrsLevel(hrs);

  // Surface CoVe bypass failures so the perito can see "verifier did not run".
  const coveBypassed = sections
    .filter((s) => s.coveBypassedDueToLlmFailure === true)
    .map((s) => ({ id: s.id, reason: s.coveFailureReason ?? 'unknown' }));

  // Build generation metadata
  const { sha256Hex, stableEventsFingerprint } = await import('@/lib/edit-metrics');
  const generationMetadata: Record<string, unknown> = {
    promptVersion,
    // Fascicolo di generazione: la ri-generazione su API hosted non è
    // riproducibile (nemmeno a temperature 0) — lo snapshot con gli hash di
    // input/output è ciò che difende il perito se l'atto viene contestato.
    generationSnapshot: {
      generatedAt: new Date().toISOString(),
      reportSha256: sha256Hex(fullReport),
      eventsFingerprint: stableEventsFingerprint(synthesisParams.events),
      eventCount: synthesisParams.events.length,
      seed: DETERMINISTIC_SEED,
    },
    // Baseline del diff bozza→firmato: synthesis viene editata in place dal
    // perito, questa copia resta la bozza AI integrale.
    originalSynthesis: fullReport,
    // Audit trail (perizie depositabili): which model id was REQUESTED for the
    // LLM sections. Today this is the '-latest' alias — record it with the
    // date so a silent alias remap (already happened once: Pixtral → Large 3)
    // is at least reconstructable. Becomes exact once models are pinned.
    modelId: MISTRAL_MODELS.MISTRAL_LARGE,
    generationMode: 'sectional',
    sectionCount: sections.length,
    sectionIds: sections.map((s) => s.id),
    sectionWordCounts: Object.fromEntries(sections.map((s) => [s.id, s.wordCount])),
    eventCoverage: Math.round(validation.eventCoverage),
    hrs,
    hrsLevel,
    issueCount: validation.issues.length,
    issuesByType: Object.fromEntries(
      Array.from(
        validation.issues.reduce((acc, i) => {
          acc.set(i.type, (acc.get(i.type) ?? 0) + 1);
          return acc;
        }, new Map<string, number>()),
      ),
    ),
    ...(coveBypassed.length > 0 ? { coveBypassed } : {}),
    ...(overriddenIssues.length > 0
      ? { validationOverridden: true, validationOverriddenIssues: overriddenIssues }
      : {}),
    // Persist the diagnostic-image analyses (sans token usage) so a later
    // "Rigenera report"/"Rigenera sezione" can re-feed them to the LLM and keep
    // the images instead of stripping them as hallucinated (Pixtral is NOT
    // re-run on regenerate). See regenerate-report.ts / section-regenerator.ts.
    // SEMPRE presente (anche []): così la rigenerazione distingue "report pre-fix
    // senza la chiave" (→ fallback Pixtral) da "report post-fix senza immagini"
    // (→ nessun re-run inutile).
    imageAnalysis: imageAnalysisForMetadata(synthesisParams.imageAnalysis ?? []),
  };

  if (coveBypassed.length > 0) {
    logger.error(
      'pipeline',
      `CoVe bypassed for ${coveBypassed.length} section(s): ${coveBypassed.map((b) => `${b.id} (${b.reason})`).join(', ')}. Sections saved without verification.`,
    );
  }

  logger.info('pipeline',
    `Assembled report: ${sections.length} sections, ${totalWordCount} words, ` +
    `${fullReport.length} chars, coverage: ${Math.round(validation.eventCoverage)}%, hrs: ${hrs} (${hrsLevel})`,
  );

  const result = await insertReportWithMetadata(caseId, fullReport, totalWordCount, generationMetadata);

  // A2: the override is a sensitive action — leave an audit trail (GDPR Art. 32).
  // Metadata: only issue TYPES and counts (messages may quote report text).
  if (overriddenIssues.length > 0) {
    try {
      const supabase = createAdminClient();
      await supabase.from('audit_log').insert({
        user_id: options?.userId ?? null,
        action: 'report.validation_overridden',
        entity_type: 'report',
        entity_id: result.reportId,
        metadata: {
          caseId,
          issueTypes: overriddenIssues.map((i) => i.type),
          issueCount: overriddenIssues.length,
        },
      });
    } catch (auditErr) {
      logger.error('pipeline', `Failed to write validation-override audit log for case ${caseId}`, {
        error: auditErr instanceof Error ? auditErr.message : 'unknown',
      });
    }
  }

  return { ...result, promptVersion, usage: totalUsage };
}

// ── Wave 3.3 helpers — source-attribution appendix ────────────────────

/**
 * Build a "## Riferimenti Documentali" appendix listing each unique
 * (date, event title) pair cited in the report. Matches the same date
 * patterns used elsewhere (DD/MM/YYYY, DD.MM.YYYY) and dedupes results.
 *
 * Returns empty string if no events or no date citations are found.
 */
function buildDocumentReferencesAppendix(
  report: string,
  events: ConsolidatedEvent[],
): string {
  if (events.length === 0) return '';

  // Index events by ISO and DD/MM/YYYY date
  const eventsByDate = new Map<string, ConsolidatedEvent[]>();
  for (const e of events) {
    if (!e.eventDate || e.eventDate === '1900-01-01') continue;
    const iso = e.eventDate;
    const parts = iso.split('-');
    if (parts.length !== 3) continue;
    const dmy = `${parts[2]}/${parts[1]}/${parts[0]}`;
    const dmyDot = `${parts[2]}.${parts[1]}.${parts[0]}`;
    for (const key of [iso, dmy, dmyDot]) {
      if (!eventsByDate.has(key)) eventsByDate.set(key, []);
      eventsByDate.get(key)!.push(e);
    }
  }

  // Find date references in the report
  const dateRegex = /\b(\d{2})[./](\d{2})[./](\d{4})\b/g;
  const referencedOrderNumbers = new Set<number>();
  let match: RegExpExecArray | null;
  while ((match = dateRegex.exec(report)) !== null) {
    const slash = `${match[1]}/${match[2]}/${match[3]}`;
    const dot = `${match[1]}.${match[2]}.${match[3]}`;
    const matched = eventsByDate.get(slash) ?? eventsByDate.get(dot);
    if (matched) {
      for (const e of matched) referencedOrderNumbers.add(e.orderNumber);
    }
  }

  if (referencedOrderNumbers.size === 0) return '';

  // Render appendix
  const cited = events
    .filter((e) => referencedOrderNumbers.has(e.orderNumber))
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const lines: string[] = ['## Riferimenti Documentali', ''];
  lines.push(
    '_Indice degli eventi documentali citati nel report. Ogni riga riporta data, tipo di evento e titolo come risulta dal documento sorgente. Numero progressivo e ID interno tra parentesi per la tracciabilità._',
  );
  lines.push('');
  for (const e of cited) {
    const isoDate = e.eventDate;
    const parts = isoDate.split('-');
    const display = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : isoDate;
    lines.push(`- **${display}** — ${e.eventType}: ${e.title} _(ev. #${e.orderNumber})_`);
  }
  return lines.join('\n');
}
