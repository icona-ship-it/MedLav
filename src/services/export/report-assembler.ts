import type { DocumentWithPages } from './load-case-data';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import { anomalyTypeLabels } from '@/lib/constants';
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

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  cartella_clinica: 'Cartella Clinica',
  referto_specialistico: 'Referto Specialistico',
  esame_strumentale: 'Esame Strumentale',
  esame_laboratorio: 'Esame di Laboratorio',
  lettera_dimissione: 'Lettera di Dimissione',
  certificato: 'Certificato',
  perizia_precedente: 'Perizia Precedente',
  altro: 'Altro Documento',
};

/**
 * Parse synthesis text to extract a specific section by heading.
 * Returns content between the heading and the next heading of same or higher level.
 */
function extractSynthesisSection(synthesis: string, headingPattern: RegExp): string | null {
  const lines = synthesis.split('\n');
  let capturing = false;
  const captured: string[] = [];

  for (const line of lines) {
    if (headingPattern.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing && /^#{1,2}\s/.test(line)) {
      break;
    }
    if (capturing) {
      captured.push(line);
    }
  }

  const result = captured.join('\n').trim();
  return result.length > 0 ? result : null;
}

/**
 * Build the DOCUMENTAZIONE SANITARIA section from OCR pages.
 * Each document gets a heading, then full OCR text page by page.
 */
function buildDocumentazioneSanitaria(docs: DocumentWithPages[]): string {
  if (docs.length === 0) return 'Nessun documento disponibile.';

  const parts: string[] = [];
  for (const doc of docs) {
    const typeLabel = DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType;
    parts.push(`### ${doc.fileName} (${typeLabel})`);

    if (doc.pages.length === 0) {
      parts.push('*Testo OCR non disponibile per questo documento.*');
    } else {
      for (const page of doc.pages) {
        if (page.ocrText.trim()) {
          parts.push(page.ocrText.trim());
          parts.push('\n---\n');
        }
      }
    }
    parts.push('');
  }

  return parts.join('\n');
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
}): AssembledReport {
  const { periziaMetadata: pm, caseRole, documentsWithPages, synthesis, anomalies, missingDocs, calculations, events } = params;
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

  addSection('premesse', 'PREMESSE', premesseLines.join('\n'));

  // 2. PROFILO METODOLOGICO
  const metodologico = `La presente relazione è stata redatta sulla base dell'esame della documentazione sanitaria acquisita agli atti, secondo i criteri della medicina legale e nel rispetto delle linee guida scientifiche vigenti.\n\nIl metodo adottato ha previsto:\n- Esame sistematico di tutta la documentazione clinica in atti\n- Ricostruzione cronologica degli eventi\n- Analisi critica dei profili di responsabilità\n- Valutazione del nesso causale secondo il criterio del "più probabile che non"\n- Quantificazione del danno biologico secondo i criteri tabellari`;
  addSection('metodologico', 'PROFILO METODOLOGICO', metodologico);

  // 3. DOCUMENTAZIONE ESAMINATA
  const docList = documentsWithPages.map((doc) => {
    const typeLabel = DOCUMENT_TYPE_LABELS[doc.documentType] ?? doc.documentType;
    const pageInfo = doc.pageCount ? ` (${doc.pageCount} pagg.)` : '';
    return `- ${doc.fileName} — *${typeLabel}*${pageInfo}`;
  }).join('\n');
  addSection('doc-esaminata', 'DOCUMENTAZIONE ESAMINATA', docList.length > 0 ? docList : 'Nessun documento allegato.');

  // 4. DATI DOCUMENTAZIONE SANITARIA (OCR text)
  const ocrContent = buildDocumentazioneSanitaria(documentsWithPages);
  addSection('doc-sanitaria', 'DATI DOCUMENTAZIONE SANITARIA', ocrContent, true);

  // 5-7. LLM sections from synthesis
  const synthText = synthesis ?? '';

  const riassunto = extractSynthesisSection(synthText, /^##\s*RIASSUNTO/i);
  if (riassunto) addSection('riassunto', 'RIASSUNTO DEL CASO', riassunto);

  const cronologia = extractSynthesisSection(synthText, /^##\s*CRONOLOGIA/i);
  if (cronologia) addSection('cronologia', 'CRONOLOGIA MEDICO-LEGALE', cronologia);

  // EVIDENZE CLINICHE — fatti medici raggruppati per tipo fonte (A/B/C/D)
  if (events && events.length > 0) {
    const evidenzeContent = buildEvidenzeCliniche(events);
    addSection('evidenze-cliniche', 'EVIDENZE CLINICHE', evidenzeContent);
  }

  // Specialized sections (between CRONOLOGIA and CONSIDERAZIONI/ELEMENTI)
  const specializedSections = extractSpecializedSections(synthText);
  for (const spec of specializedSections) {
    addSection(spec.id, spec.title, spec.content);
  }

  // 8. ESAME OBIETTIVO
  if (pm.esameObiettivo) {
    addSection('esame-obiettivo', 'ESAME OBIETTIVO', pm.esameObiettivo);
  }

  // 9. CONSIDERAZIONI MEDICO-LEGALI / ELEMENTI DI RILIEVO
  const considerazioni = extractSynthesisSection(synthText, /^##\s*(CONSIDERAZIONI|ELEMENTI DI RILIEVO)/i);
  if (considerazioni) addSection('considerazioni', 'CONSIDERAZIONI MEDICO-LEGALI', considerazioni);

  // 10. NESSO CAUSALE
  const nesso = extractSynthesisSection(synthText, /^##\s*NESSO\s*CAUSALE/i);
  if (nesso) addSection('nesso-causale', 'NESSO CAUSALE', nesso);

  // 11. VALUTAZIONE DANNO BIOLOGICO
  const danno = extractSynthesisSection(synthText, /^##\s*VALUTAZIONE\s*(DEL\s*)?DANNO/i);
  const calcText = formatCalculationsText(calculations);
  const dannoContent = [danno, calcText].filter(Boolean).join('\n\n');
  if (dannoContent) addSection('danno-biologico', 'VALUTAZIONE DEL DANNO BIOLOGICO', dannoContent);

  // 12. SPESE MEDICHE
  if (pm.speseMediche) {
    addSection('spese-mediche', 'SPESE MEDICHE', pm.speseMediche);
  }

  // 13. RISPOSTA AI QUESITI
  const rispostaQuesiti = extractSynthesisSection(synthText, /^##\s*RISPOSTA\s*AI\s*QUESITI/i);
  if (rispostaQuesiti) addSection('risposta-quesiti', 'RISPOSTA AI QUESITI', rispostaQuesiti);

  // 14. CONCLUSIONI
  const conclusioni = extractSynthesisSection(synthText, /^##\s*CONCLUSIONI/i);
  if (conclusioni) addSection('conclusioni', 'CONCLUSIONI', conclusioni);

  // 15. ANOMALIE RILEVATE
  if (anomalies.length > 0) {
    const anomalyText = anomalies.map((a) => {
      const label = anomalyTypeLabels[a.anomaly_type] ?? a.anomaly_type;
      const suggestion = a.suggestion ? `\n  *Suggerimento:* ${a.suggestion}` : '';
      return `- **[${a.severity.toUpperCase()}] ${label}**: ${a.description}${suggestion}`;
    }).join('\n');
    addSection('anomalie', 'ANOMALIE RILEVATE', anomalyText);
  }

  // 16. DOCUMENTAZIONE MANCANTE
  if (missingDocs.length > 0) {
    const missingText = missingDocs.map((d) => {
      const related = d.related_event ? ` (evento correlato: ${d.related_event})` : '';
      return `- **${d.document_name}**: ${d.reason}${related}`;
    }).join('\n');
    addSection('doc-mancante', 'DOCUMENTAZIONE MANCANTE', missingText);
  }

  const tableOfContents = sections.map((s) => ({
    number: s.number,
    title: s.title,
    id: s.id,
  }));

  return { sections, tableOfContents };
}

/**
 * Extract specialized sections between CRONOLOGIA and CONSIDERAZIONI/ELEMENTI.
 */
function extractSpecializedSections(synthesis: string): Array<{ id: string; title: string; content: string }> {
  const lines = synthesis.split('\n');
  const results: Array<{ id: string; title: string; content: string }> = [];

  let inSpecializedZone = false;
  let currentTitle = '';
  let currentContent: string[] = [];

  const knownNonSpecialized = /^##\s*(PREMESSE|PROFILO\s*METOD|DOCUMENTAZIONE|RIASSUNTO|CRONOLOGIA|CONSIDERAZIONI|ELEMENTI\s*DI\s*RILIEVO|NESSO\s*CAUSALE|VALUTAZIONE|SPESE\s*MEDICHE|RISPOSTA\s*AI\s*QUESITI|CONCLUSIONI|ESAME\s*OBIETTIVO)/i;

  for (const line of lines) {
    // Detect end of CRONOLOGIA — start specialized zone
    if (/^##\s*CRONOLOGIA/i.test(line)) {
      inSpecializedZone = true;
      continue;
    }

    // Detect start of CONSIDERAZIONI/ELEMENTI — end specialized zone
    if (/^##\s*(CONSIDERAZIONI|ELEMENTI\s*DI\s*RILIEVO|NESSO\s*CAUSALE|VALUTAZIONE|CONCLUSIONI)/i.test(line)) {
      // Save current if any
      if (currentTitle && currentContent.length > 0) {
        results.push({
          id: `specialized-${results.length}`,
          title: currentTitle,
          content: currentContent.join('\n').trim(),
        });
      }
      break;
    }

    if (!inSpecializedZone) continue;

    // New h2 heading in specialized zone
    if (/^##\s/.test(line) && !knownNonSpecialized.test(line)) {
      if (currentTitle && currentContent.length > 0) {
        results.push({
          id: `specialized-${results.length}`,
          title: currentTitle,
          content: currentContent.join('\n').trim(),
        });
      }
      currentTitle = line.replace(/^##\s*/, '').trim();
      currentContent = [];
    } else if (inSpecializedZone && currentTitle) {
      currentContent.push(line);
    }
  }

  // Save last one if loop ended
  if (currentTitle && currentContent.length > 0) {
    results.push({
      id: `specialized-${results.length}`,
      title: currentTitle,
      content: currentContent.join('\n').trim(),
    });
  }

  return results;
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
