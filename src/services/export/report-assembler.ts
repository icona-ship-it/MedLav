import type { DocumentWithPages } from './load-case-data';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import { anomalyTypeLabels, NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import {
  getDocumentTypeLabel,
  EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA,
} from '@/lib/document-type-labels';
import { formatDate } from '@/lib/format';

export interface PeriziaMetadataExport {
  tribunale?: string;
  sezione?: string;
  rgNumber?: string;
  judgeName?: string;
  ctuName?: string;
  ctuTitle?: string;
  collaboratoreName?: string;
  collaboratoreTitle?: string;
  ctpRicorrente?: string;
  ctpResistente?: string;
  parteRicorrente?: string;
  parteResistente?: string;
  dataIncarico?: string;
  dataOperazioni?: string;
  dataDeposito?: string;
  quesiti?: string[];
  fondoSpese?: string;
  esameObiettivo?: string;
  speseMediche?: string;
  [key: string]: unknown;
}

export interface ReportSection {
  id: string;
  number: string;
  title: string;
  content: string;
  isMarkdown: boolean;
}

export interface AssembledReport {
  sections: ReportSection[];
  tableOfContents: Array<{ number: string; title: string; id: string }>;
}

/**
 * Export composition mode (QA 2026-06-11): the gold deposited perizie open
 * with the intestazione and close with the signature — no TOC, no working
 * papers. 'depositabile' produces that document; 'lavoro' keeps everything
 * (calcoli, anomalie, doc mancante, indice) as the perito's working file.
 */
export type ExportMode = 'depositabile' | 'lavoro';

interface ExportAnomaly {
  anomaly_type: string;
  severity: string;
  description: string;
  suggestion: string | null;
}

interface ExportMissingDoc {
  document_name: string;
  reason: string;
  related_event: string | null;
}

/**
 * Build the DOCUMENTAZIONE SANITARIA section from OCR pages.
 * Each document gets a heading, then full OCR text page by page.
 */
function buildDocumentazioneSanitaria(docs: DocumentWithPages[]): string {
  // Allineato al renderer sicuro (formatDocumentazioneSanitaria): esclude i
  // documenti non clinici e MAI droppa una pagina — quelle illeggibili sono
  // marcate, così il perito sa che esistevano. Percorso di fallback (usato solo
  // quando non c'è ancora alcuna sintesi), ma comunque "mai perdere un fatto".
  const clinicalDocs = docs.filter(
    (doc) => !EXCLUDED_FROM_DOCUMENTAZIONE_SANITARIA.has(doc.documentType),
  );
  if (clinicalDocs.length === 0) return 'Nessun documento disponibile.';

  const parts: string[] = [];
  for (const doc of clinicalDocs) {
    const typeLabel = getDocumentTypeLabel(doc.documentType);
    parts.push(`### ${doc.fileName} (${typeLabel})`);

    if (doc.pages.length === 0) {
      parts.push('*Testo non disponibile per questo documento.*');
    } else {
      doc.pages.forEach((page, index) => {
        if (page.ocrText.trim()) {
          parts.push(page.ocrText.trim());
        } else {
          parts.push(
            `*[Pagina ${index + 1} — testo non disponibile o illeggibile; verificare sul documento originale.]*`,
          );
        }
        parts.push('\n---\n');
      });
    }
    parts.push('');
  }

  return parts.join('\n');
}

/**
 * True quando la sintesi contiene già la propria intestazione veronese
 * ("## Intestazione"): in tal caso gli export NON devono aggiungere una seconda
 * intestazione/cover dai metadati (evita il doppione). Pura.
 */
export function synthesisHasOwnHeader(synthesis: string | null | undefined): boolean {
  return !!synthesis && /^##\s+Intestazione\s*$/m.test(synthesis);
}

/**
 * Assemble a full professional report combining programmatic and LLM sections.
 * Produces a structured report suitable for court-quality HTML/DOCX export.
 */
interface ExportEvent {
  event_date: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  source_text: string | null;
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
}

export function assembleFullReport(params: {
  periziaMetadata: PeriziaMetadataExport;
  caseRole: string;
  documentsWithPages: DocumentWithPages[];
  synthesis: string | null;
  anomalies: ExportAnomaly[];
  missingDocs: ExportMissingDoc[];
  calculations?: MedicoLegalCalculation[];
  events?: ExportEvent[];
  /** Default 'lavoro' (backward compatible) — the export routes pass 'depositabile' by default. */
  exportMode?: ExportMode;
}): AssembledReport {
  const { periziaMetadata: pm, caseRole, documentsWithPages, synthesis, anomalies, missingDocs, calculations, events } = params;
  const exportMode: ExportMode = params.exportMode ?? 'lavoro';
  const isDepositabile = exportMode === 'depositabile';
  const sections: ReportSection[] = [];
  let sectionNum = 0;

  const addSection = (id: string, title: string, content: string, isMarkdown = false) => {
    sectionNum++;
    const number = String(sectionNum);
    sections.push({ id, number, title, content, isMarkdown });
  };

  // 1. PREMESSE
  const premesseLines: string[] = [];
  const roleTitle = caseRole === 'ctu' ? 'Consulente Tecnico d\'Ufficio'
    : caseRole === 'ctp' ? 'Consulente Tecnico di Parte'
    : 'Perito Stragiudiziale';

  if (pm.tribunale) premesseLines.push(`Il sottoscritto ${pm.ctuName ?? '[CTU]'}${pm.ctuTitle ? `, ${pm.ctuTitle}` : ''}, nominato ${roleTitle} dal ${pm.tribunale}${pm.sezione ? ` — ${pm.sezione}` : ''} nel procedimento n. R.G. ${pm.rgNumber ?? '[N/D]'}, Giudice ${pm.judgeName ?? '[N/D]'}.`);
  if (pm.parteRicorrente) premesseLines.push(`**Parte ricorrente:** ${pm.parteRicorrente}`);
  if (pm.parteResistente) premesseLines.push(`**Parte resistente:** ${pm.parteResistente}`);
  if (pm.ctpRicorrente) premesseLines.push(`**CTP parte ricorrente:** ${pm.ctpRicorrente}`);
  if (pm.ctpResistente) premesseLines.push(`**CTP parte resistente:** ${pm.ctpResistente}`);
  if (pm.dataIncarico) premesseLines.push(`**Data conferimento incarico:** ${pm.dataIncarico}`);
  if (pm.dataOperazioni) premesseLines.push(`**Data inizio operazioni peritali:** ${pm.dataOperazioni}`);
  if (pm.dataDeposito) premesseLines.push(`**Termine deposito relazione:** ${pm.dataDeposito}`);
  if (pm.fondoSpese) premesseLines.push(`**Fondo spese assegnato:** ${pm.fondoSpese}`);

  if (pm.quesiti && pm.quesiti.length > 0) {
    premesseLines.push('');
    premesseLines.push('**Quesiti formulati:**');
    pm.quesiti.forEach((q, i) => premesseLines.push(`${i + 1}. ${q}`));
  }

  // Salta PREMESSE se la sintesi ha già la sua intestazione veronese (no doppione).
  if (!synthesisHasOwnHeader(synthesis)) {
    addSection('premesse', 'PREMESSE', premesseLines.join('\n'));
  }

  const synthText = synthesis ?? '';

  // 2. PROFILO METODOLOGICO (legacy hardcoded) — SOLO se la sintesi non ha già
  // la propria sezione dal catalogo (QA 2026-06-11: nel DOCX comparivano
  // ENTRAMBE, "PROFILO METODOLOGICO" voce 1 e "Profilo Metodologico" voce 4).
  const synthHasProfilo = /^##\s+.*profilo\s+metodologico/im.test(synthText);
  if (!synthHasProfilo) {
    const metodologico = `La presente relazione è stata redatta sulla base dell'esame della documentazione sanitaria acquisita agli atti, secondo i criteri della medicina legale e nel rispetto delle linee guida scientifiche vigenti.\n\nIl metodo adottato ha previsto:\n- Esame sistematico di tutta la documentazione clinica in atti\n- Ricostruzione cronologica degli eventi\n- Analisi critica dei profili di responsabilità\n- Valutazione del nesso causale secondo il criterio del "più probabile che non"\n- Quantificazione del danno biologico secondo i criteri tabellari`;
    addSection('metodologico', 'PROFILO METODOLOGICO', metodologico);
  }

  // 3. DOCUMENTAZIONE ESAMINATA (lista filename) — è una carta di LAVORO: nei
  // gold depositati i filename non compaiono mai (l'elenco analitico vive già
  // dentro la doc-sanitaria verbatim, in formato perizia). Solo modo 'lavoro'.
  if (!isDepositabile || !synthText) {
    const docList = documentsWithPages.map((doc) => {
      const typeLabel = getDocumentTypeLabel(doc.documentType);
      const pageInfo = doc.pageCount ? ` (${doc.pageCount} pagg.)` : '';
      return `- ${doc.fileName} — *${typeLabel}*${pageInfo}`;
    }).join('\n');
    addSection('doc-esaminata', 'DOCUMENTAZIONE ESAMINATA', docList.length > 0 ? docList : 'Nessun documento allegato.');
  }

  // 4. DATI DOCUMENTAZIONE SANITARIA (OCR text) — only if NO synthesis
  // When synthesis exists, it already contains the elaborated documentation.
  // Adding raw OCR would duplicate content.
  if (!synthText) {
    const ocrContent = buildDocumentazioneSanitaria(documentsWithPages);
    addSection('doc-sanitaria', 'DATI DOCUMENTAZIONE SANITARIA', ocrContent, true);
  }

  // 5. SYNTHESIS (LLM-generated report) — use as-is in markdown format.
  // This matches exactly what the user sees in the preview.
  // Each ## heading in the synthesis becomes a separate section.
  // QA 2026-06-11: l'esame obiettivo del form si INIETTA nella sezione Visita
  // della sintesi (il suo posto naturale in perizia), non come sezione autonoma.
  let esameObiettivoInjected = false;
  if (synthText) {
    // Parse synthesis into sections by ## headings
    const synthSections = synthText.split(/^(?=## )/m).filter((s) => s.trim().length > 0);
    for (const sectionText of synthSections) {
      const headingMatch = sectionText.match(/^## (.+)/);
      if (headingMatch) {
        const title = headingMatch[1].trim();
        let content = sectionText.replace(/^## .+\n+/, '').trim();
        if (pm.esameObiettivo && !esameObiettivoInjected && /visita|esame\s+obiettivo/i.test(title)) {
          content = `${content}\n\n**Esame obiettivo (rilevato dal perito):**\n\n${pm.esameObiettivo}`;
          esameObiettivoInjected = true;
        }
        if (content.length > 0) {
          const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
          addSection(id, title, content, true);
        }
      }
    }
  }

  // CALCOLI MEDICO-LEGALI (ITT/ITP) — carta di lavoro (la tabella ITT/ITP del
  // depositabile vive già DENTRO la sintesi via marker deterministico).
  const calcText = formatCalculationsText(calculations);
  if (calcText && !isDepositabile) {
    addSection('calcoli', 'PERIODI MEDICO-LEGALI CALCOLATI', calcText);
  }

  // ESAME OBIETTIVO standalone: SOLO se non è stato iniettato nella Visita
  // (mai perdere il testo del perito — fallback per sintesi senza sezione visita).
  if (pm.esameObiettivo && !esameObiettivoInjected) {
    addSection('esame-obiettivo', 'ESAME OBIETTIVO', pm.esameObiettivo);
  }

  // EVIDENZE CLINICHE — only if NO synthesis (fallback for cases without report)
  if (events && events.length > 0 && !synthText) {
    const evidenzeContent = buildEvidenzeCliniche(events);
    addSection('evidenze-cliniche', 'EVIDENZE CLINICHE', evidenzeContent);
  }

  // 15. ANOMALIE RILEVATE — carta di lavoro (mai in un documento depositato:
  // QA 2026-06-11, falsi positivi inclusi finivano in coda alla perizia).
  if (anomalies.length > 0 && !isDepositabile) {
    const anomalyText = anomalies.map((a) => {
      const label = anomalyTypeLabels[a.anomaly_type] ?? a.anomaly_type;
      const suggestion = a.suggestion ? `\n  *Suggerimento:* ${a.suggestion}` : '';
      return `- **[${a.severity.toUpperCase()}] ${label}**: ${a.description}${suggestion}`;
    }).join('\n');
    addSection('anomalie', 'ANOMALIE RILEVATE', anomalyText);
  }

  // 16. DOCUMENTAZIONE MANCANTE — carta di lavoro.
  if (missingDocs.length > 0 && !isDepositabile) {
    const missingText = missingDocs.map((d) => {
      const related = d.related_event ? ` (evento correlato: ${d.related_event})` : '';
      return `- **${d.document_name}**: ${d.reason}${related}`;
    }).join('\n');
    addSection('doc-mancante', 'DOCUMENTAZIONE MANCANTE', missingText);
  }

  // Niente indice nel depositabile: i gold aprono con l'intestazione, mai con
  // un sommario (l'INDICE resta nel fascicolo di lavoro).
  const tableOfContents = isDepositabile ? [] : sections.map((s) => ({
    number: s.number,
    title: s.title,
    id: s.id,
  }));

  return { sections, tableOfContents };
}

/**
 * Build EVIDENZE CLINICHE section: chronological facts grouped by source type.
 *
 * A - CARTELLA CLINICA: diagnosi ingresso, peso/altezza, esami, anamnesi, terapie,
 *     descrizione chirurgica, cartella anestesiologica, diario medico/infermieristico,
 *     lettera di dimissione
 * B - REFERTI CONTROLLI MEDICI
 * C - REFERTI RADIOLOGICI ED ESAMI STRUMENTALI
 * D - ESAMI EMATOCHIMICI
 */
function buildEvidenzeCliniche(events: ExportEvent[]): string {
  // Filter out non-clinical events (SSN cost notices, ticket payments,
  // admin documents). Trigger: Passaniti regression — these distort the
  // "Evidenze cliniche" section by appearing alongside actual medical events.
  events = events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type));

  const SOURCE_CATEGORY_ORDER = [
    'cartella_clinica',
    'referto_controllo',
    'esame_strumentale',
    'esame_ematochimico',
    'altro',
  ];

  const CATEGORY_LABELS: Record<string, string> = {
    cartella_clinica: 'A — CARTELLA CLINICA',
    referto_controllo: 'B — REFERTI CONTROLLI MEDICI',
    esame_strumentale: 'C — REFERTI RADIOLOGICI ED ESAMI STRUMENTALI',
    esame_ematochimico: 'D — ESAMI EMATOCHIMICI',
    altro: 'ALTRI DOCUMENTI',
  };

  const CATEGORY_DESC: Record<string, string> = {
    cartella_clinica: 'Diagnosi di ingresso, parametri antropometrici, esami ematochimici, anamnesi, terapie effettuate, descrizione intervento chirurgico e tempi operatori, cartella anestesiologica, diario medico e infermieristico, lettera di dimissione.',
    referto_controllo: 'Visite specialistiche, follow-up, certificati medici.',
    esame_strumentale: 'Radiografie, TAC, risonanze magnetiche, ECG, ecografie e altri esami strumentali.',
    esame_ematochimico: 'Emocromo, biochimica clinica, coagulazione, markers tumorali e altri esami di laboratorio.',
    altro: 'Documentazione non classificata nelle categorie precedenti.',
  };

  // Group events by source_type
  const grouped = new Map<string, ExportEvent[]>();
  for (const cat of SOURCE_CATEGORY_ORDER) {
    grouped.set(cat, []);
  }
  for (const ev of events) {
    const cat = SOURCE_CATEGORY_ORDER.includes(ev.source_type) ? ev.source_type : 'altro';
    grouped.get(cat)!.push(ev);
  }

  const parts: string[] = [];

  for (const cat of SOURCE_CATEGORY_ORDER) {
    const catEvents = grouped.get(cat) ?? [];
    if (catEvents.length === 0) continue;

    // Sort by date within each category
    catEvents.sort((a, b) => a.event_date.localeCompare(b.event_date));

    const label = CATEGORY_LABELS[cat];
    const desc = CATEGORY_DESC[cat];
    parts.push(`### ${label}\n*${desc}*\n`);

    for (const ev of catEvents) {
      const date = formatDate(ev.event_date);
      const facility = ev.facility ? ` — ${ev.facility}` : '';
      const doctor = ev.doctor ? ` (${ev.doctor})` : '';
      const diagnosis = ev.diagnosis ? `\n**Diagnosi:** ${ev.diagnosis}` : '';

      // Prefer sourceText (verbatim from document), fallback to description
      const content = ev.source_text && ev.source_text.trim().length > 20
        ? ev.source_text.trim()
        : ev.description;

      parts.push(`**${date}${facility}${doctor}** — ${ev.title}${diagnosis}\n${content}\n`);
    }
  }

  if (parts.length === 0) {
    return 'Nessuna evidenza clinica disponibile.';
  }

  return parts.join('\n');
}

function formatCalculationsText(calculations?: MedicoLegalCalculation[]): string | null {
  if (!calculations || calculations.length === 0) return null;
  return calculations.map((c) => {
    const period = c.startDate && c.endDate ? ` (${formatDate(c.startDate)} — ${formatDate(c.endDate)})` : '';
    return `- **${c.label}:** ${c.value}${period}\n  ${c.notes}`;
  }).join('\n');
}
