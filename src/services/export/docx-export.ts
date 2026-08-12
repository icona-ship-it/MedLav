import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, ShadingType,
  Header, Footer, PageNumber, Table, TableRow, TableCell, WidthType, BorderStyle,
  TableLayoutType, ImageRun,
} from 'docx';
import { sourceLabelsExport as sourceLabels, anomalyTypeLabels as anomalyLabels, NON_CLINICAL_EVENT_TYPES } from '@/lib/constants';
import { isPlaceholderBlockStart } from './markdown-to-html';
import { formatDate } from '@/lib/format';
import type { MedicoLegalCalculation } from '@/services/calculations/medico-legal-calc';
import type { DocumentWithPages } from './load-case-data';
import { assembleFullReport, synthesisHasOwnHeader, type ExportMode, type PeriziaMetadataExport as AssemblerPeriziaMetadata } from './report-assembler';
import { anonymizeText } from '@/services/anonymization/anonymizer';
import { anonymizeEventsForExport, anonymizeDocsForExport, anonymizePmForExport } from './anonymize-export';
import type { PeriziaMetadata } from '@/types';
import { getAiActDisclosureDocxParagraphs, getAiActDocxMetadata } from './ai-act-disclosure';
import { groupEventsByDocument } from './event-grouping';

const DOCX_ROLE_DESCRIPTIONS: Record<string, string> = {
  ctu: 'CTU - Consulente Tecnico d\'Ufficio (prospettiva neutrale)',
  ctp: 'CTP - Consulente Tecnico di Parte (prospettiva del paziente)',
  stragiudiziale: 'Perito Stragiudiziale (valutazione di merito)',
};

interface DocxEvent {
  order_number: number;
  /** Per il raggruppamento "un documento = un blocco" nella cronologia basic. */
  document_id?: string | null;
  event_date: string;
  date_precision: string;
  event_type: string;
  title: string;
  description: string;
  source_type: string;
  diagnosis: string | null;
  doctor: string | null;
  facility: string | null;
  confidence: number;
  requires_verification: boolean;
  expert_notes: string | null;
}

interface DocxAnomaly {
  anomaly_type: string;
  severity: string;
  description: string;
  suggestion: string | null;
  /** Nota del perito quando ha confermato l'anomalia (status user_confirmed).
   * Prima non veniva stampata → la nota scritta dal perito spariva nel nulla. */
  resolution_note?: string | null;
}

interface DocxMissingDoc {
  document_name: string;
  reason: string;
  related_event: string | null;
}

interface PeriziaMetadataExport {
  tribunale?: string;
  sezione?: string;
  rgNumber?: string;
  judgeName?: string;
  ctuName?: string;
  ctuTitle?: string;
  collaboratoreName?: string;
  collaboratoreTitle?: string;
  // Collegio di CC.TT.U.: co-perito PARITETICO (firma collegiale, non ausiliario).
  coCtuName?: string;
  coCtuTitle?: string;
  ambitoPenale?: boolean;
  ctpRicorrente?: string;
  ctpResistente?: string;
  parteRicorrente?: string;
  parteResistente?: string;
  dataIncarico?: string;
  dataOperazioni?: string;
  dataDeposito?: string;
  quesiti?: string[];
  fondoSpese?: string;
  [key: string]: unknown;
}

interface DocxExportParams {
  caseCode: string;
  caseType: string;
  caseRole: string;
  patientInitials: string | null;
  synthesis: string | null;
  events: DocxEvent[];
  anomalies: DocxAnomaly[];
  missingDocs: DocxMissingDoc[];
  calculations?: MedicoLegalCalculation[];
  periziaMetadata?: PeriziaMetadataExport | null;
  reportStatus?: string;
  /** 'depositabile' = solo il documento firmabile, niente carte di lavoro. */
  exportMode?: ExportMode;
  /** Pipeline del caso: gli strumenti standalone (extraction_only/expenses_only)
   * NON producono una perizia — l'export deve dirlo, non fingersi un report
   * monco ("Sintesi non ancora generata", feedback beta 2026-07-20). */
  pipelineMode?: string;
  /** Tipi documento classificati per le intestazioni-blocco della cronologia. */
  documents?: Array<{ id: string; documentType?: string | null }>;
  /** Export anonimizzato: le intestazioni-blocco omettono la struttura
   * (l'anonimizzatore copre solo la synthesis, non la cronologia da eventi raw
   * — audit 2026-07-23: la facility nel titolo-gruppo sarebbe trapelata). */
  anonymized?: boolean;
}

/**
 * Determine the watermark text based on report status.
 */
function getDocxWatermarkText(reportStatus?: string): string {
  // AUDIT 2026-07-16: "CONFIDENZIALE" nell'header di ogni pagina del definitivo
  // NON è nei gold Lavini (e assente in HTML/PDF): lo togliamo. Resta solo la
  // filigrana "BOZZA" (utile per non depositare una bozza per errore).
  if (reportStatus === 'bozza') return 'RISERVATO — BOZZA';
  return '';
}

/**
 * Build a signature block for the end of the report.
 * Supports dual signature (CTU + collaboratore) using a side-by-side layout.
 */
function buildSignatureBlock(periziaMetadata?: PeriziaMetadataExport | null, caseRole?: string): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  result.push(new Paragraph({ text: '', spacing: { before: 600 } }));
  // Firma DOPPIA datata (benchmark scuola veronese): sottoscrizione della bozza
  // (ai CC.TT.PP.) e deposito definitivo — solo CTU/CTP (hanno l'iter bozza→deposito).
  // Stragiudiziale/parere: firma singola. Collegiale se è nominato un ausiliario.
  if (caseRole === 'ctu' || caseRole === 'ctp') {
    pushDatedSignature(result, periziaMetadata, caseRole, 'Luogo e data (sottoscrizione della bozza): _________________________');
    result.push(new Paragraph({ text: '', spacing: { before: 500 } }));
    pushDatedSignature(result, periziaMetadata, caseRole, 'Luogo e data (deposito definitivo): _________________________');
  } else {
    pushDatedSignature(result, periziaMetadata, caseRole, 'Luogo e data: _________________________');
  }
  return result;
}

/** Renderizza un blocco firma datato (riga "Luogo e data" + firmatari). */
function pushDatedSignature(
  result: (Paragraph | Table)[],
  periziaMetadata: PeriziaMetadataExport | null | undefined,
  caseRole: string | undefined,
  dateLabel: string,
): void {
  const pm = periziaMetadata;

  // Location and date line
  result.push(new Paragraph({
    children: [new TextRun({ text: dateLabel, size: 24 })],
    spacing: { after: 400 },
  }));

  // Secondo firmatario: co-perito PARITETICO (collegio, benchmark gold 2026-06-10)
  // con precedenza sull'ausiliario/collaboratore.
  const coSigner = pm?.coCtuName
    ? { name: pm.coCtuName, title: pm.coCtuTitle }
    : pm?.collaboratoreName
      ? { name: pm.collaboratoreName, title: pm.collaboratoreTitle }
      : null;

  const signerLabel = pm?.coCtuName
    ? (pm?.ambitoPenale ? 'I Periti' : 'Il Collegio di CC.TT.U.')
    : caseRole === 'ctu' ? 'I CC.TT.U.'
    : caseRole === 'ctp' ? 'Il Consulente Tecnico di Parte'
    : 'Il Perito';

  if (coSigner) {
    // Dual signature block using borderless table
    const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const cellBorders = { top: noBorder, left: noBorder, right: noBorder, bottom: noBorder };

    result.push(new Paragraph({
      children: [new TextRun({ text: signerLabel, bold: true, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
    }));

    const leftChildren: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: pm?.ctuName ?? '_________________________', size: 24 })],
        alignment: AlignmentType.CENTER,
      }),
    ];
    if (pm?.ctuTitle) {
      leftChildren.push(new Paragraph({
        children: [new TextRun({ text: pm.ctuTitle, size: 20, italics: true })],
        alignment: AlignmentType.CENTER,
      }));
    }
    leftChildren.push(new Paragraph({
      children: [new TextRun({ text: '_________________________', size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
    }));

    const rightChildren: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: coSigner.name, size: 24 })],
        alignment: AlignmentType.CENTER,
      }),
    ];
    if (coSigner.title) {
      rightChildren.push(new Paragraph({
        children: [new TextRun({ text: coSigner.title, size: 20, italics: true })],
        alignment: AlignmentType.CENTER,
      }));
    }
    rightChildren.push(new Paragraph({
      children: [new TextRun({ text: '_________________________', size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 200 },
    }));

    result.push(new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: leftChildren, borders: cellBorders, width: { size: 4500, type: WidthType.DXA } }),
            new TableCell({ children: rightChildren, borders: cellBorders, width: { size: 4500, type: WidthType.DXA } }),
          ],
        }),
      ],
      width: { size: 9000, type: WidthType.DXA },
    }));
  } else {
    // Single signature block
    const singleSignerLabel = caseRole === 'ctu' ? 'Il Consulente Tecnico d\'Ufficio'
      : caseRole === 'ctp' ? 'Il Consulente Tecnico di Parte'
      : 'Il Perito';

    result.push(new Paragraph({
      children: [new TextRun({ text: singleSignerLabel, bold: true, size: 24 })],
      alignment: AlignmentType.RIGHT,
    }));

    if (pm?.ctuName) {
      result.push(new Paragraph({
        children: [new TextRun({ text: pm.ctuName, size: 24 })],
        alignment: AlignmentType.RIGHT,
      }));
    }
    if (pm?.ctuTitle) {
      result.push(new Paragraph({
        children: [new TextRun({ text: pm.ctuTitle, size: 20, italics: true })],
        alignment: AlignmentType.RIGHT,
      }));
    }

    result.push(new Paragraph({
      children: [new TextRun({ text: '_________________________', size: 24 })],
      alignment: AlignmentType.RIGHT,
      spacing: { before: 200 },
    }));
  }
}

/**
 * Generate a DOCX report document.
 * Returns a Buffer ready for download.
 */
/**
 * Validazione PRE-export. Una perizia "depositabile" senza i dati identificativi del
 * perito uscirebbe via il flusso BASIC (senza carta intestata né firma) → un documento
 * incompleto spacciato per depositabile. Blocca con messaggio esplicito; in modalità
 * "lavoro" (bozza) i dati parziali restano ammessi. Ritorna il messaggio o null.
 */
export function validateDepositableExport(
  pm: { ctuName?: string | null; tribunale?: string | null; rgNumber?: string | null } | null | undefined,
  caseRole: string,
  exportMode: 'depositabile' | 'lavoro',
): string | null {
  if (exportMode !== 'depositabile') return null;
  if (!pm?.ctuName?.trim()) {
    return 'Per esportare la perizia compila almeno il Nome del perito nei "Dati perizia" del caso.';
  }
  if ((caseRole === 'ctu' || caseRole === 'ctp') && (!pm.tribunale?.trim() || !pm.rgNumber?.trim())) {
    return 'Per una perizia giudiziaria depositabile servono anche il Tribunale e il numero di Ruolo Generale (RG) nei "Dati perizia".';
  }
  return null;
}

/**
 * Guard dell'export ANONIMIZZATO (audit GDPR 2026-07-17): l'anonimizzatore
 * redige in modo affidabile solo i nomi che CONOSCE — senza il nome completo
 * del paziente nei Dati perizia, un nome presente solo nell'OCR citato nel
 * report sfugge alla redazione (visto nello smoke test 2026-07-14). Un file
 * chiamato "anonimizzato" che non lo è davvero è una promessa falsa su dati
 * Art. 9: meglio bloccare con istruzione chiara. Il messaggio contiene
 * "Dati perizia" → la CTA in UI porta direttamente al form.
 */
export function validateAnonymizedExport(
  pm: { patientFullName?: string | null } | null | undefined,
  anonymize: boolean,
): string | null {
  if (!anonymize) return null;
  if (!pm?.patientFullName?.trim()) {
    return 'Per esportare la versione anonimizzata compila prima nome e cognome del paziente nei "Dati perizia": servono a redigerli ovunque compaiano nel testo, anche dentro le citazioni dai documenti.';
  }
  return null;
}

export async function generateDocxReport(params: DocxExportParams): Promise<Buffer> {
  const { caseCode, caseType, caseRole, patientInitials, anomalies, missingDocs, calculations, reportStatus } = params;

  // GDPR (audit 2026-08-11, E-1/H-2): anonymized=true → anonimizza pm (cover),
  // testo eventi e synthesis prima del rendering; i campi strutturati (date)
  // restano intatti.
  const anonCtx = params.anonymized ? (params.periziaMetadata as unknown as PeriziaMetadata) : undefined;
  const periziaMetadata = params.anonymized
    ? (anonymizePmForExport(params.periziaMetadata as unknown as Record<string, unknown>, anonCtx) as unknown as typeof params.periziaMetadata)
    : params.periziaMetadata;
  const synthesis = params.anonymized && params.synthesis
    ? anonymizeText({ text: params.synthesis, periziaMetadata: anonCtx }).anonymizedText
    : params.synthesis;
  const events = params.anonymized
    ? anonymizeEventsForExport(params.events, anonCtx)
    : params.events;

  // QA 2026-06-11: nel depositabile niente carte di lavoro (riepilogo qualità,
  // periodi calcolati, anomalie, doc mancante) — restano nel fascicolo di lavoro.
  const isDepositabile = (params.exportMode ?? 'lavoro') === 'depositabile';

  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });

  const children: (Paragraph | Table)[] = [];

  // Formal perizia header (if metadata present) — saltato se la sintesi contiene
  // già la propria intestazione veronese (evita il doppione: ADR 2026-06-02).
  if (periziaMetadata && (periziaMetadata.tribunale || periziaMetadata.ctuName) && !synthesisHasOwnHeader(synthesis)) {
    const roleTitle = caseRole === 'ctu' ? 'CONSULENZA TECNICA D\'UFFICIO'
      : caseRole === 'ctp' ? 'CONSULENZA TECNICA DI PARTE'
      : 'PERIZIA STRAGIUDIZIALE';

    if (periziaMetadata.tribunale) {
      children.push(new Paragraph({
        children: [new TextRun({ text: periziaMetadata.tribunale.toUpperCase(), bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    if (periziaMetadata.sezione) {
      children.push(new Paragraph({
        children: [new TextRun({ text: periziaMetadata.sezione, size: 24 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    if (periziaMetadata.rgNumber) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `n. R.G. ${periziaMetadata.rgNumber}`, size: 24 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({
      children: [new TextRun({ text: roleTitle, bold: true, size: 26 })],
      alignment: AlignmentType.CENTER,
    }));
    if (patientInitials) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `relativa alla vicenda clinica del/della sig. ${patientInitials}`, size: 24 })],
        alignment: AlignmentType.CENTER,
      }));
    }
    children.push(new Paragraph({ text: '' }));

    const details: Array<{ label: string; value: string }> = [];
    if (periziaMetadata.ctuName) details.push({ label: 'CTU', value: `${periziaMetadata.ctuName}${periziaMetadata.ctuTitle ? ` — ${periziaMetadata.ctuTitle}` : ''}` });
    if (periziaMetadata.judgeName) details.push({ label: 'Giudice', value: periziaMetadata.judgeName });
    if (periziaMetadata.parteRicorrente) details.push({ label: 'Parte Ricorrente', value: periziaMetadata.parteRicorrente });
    if (periziaMetadata.parteResistente) details.push({ label: 'Parte Resistente', value: periziaMetadata.parteResistente });
    if (periziaMetadata.ctpRicorrente) details.push({ label: 'CTP Ricorrente', value: periziaMetadata.ctpRicorrente });
    if (periziaMetadata.ctpResistente) details.push({ label: 'CTP Resistente', value: periziaMetadata.ctpResistente });
    if (periziaMetadata.dataIncarico) details.push({ label: 'Data incarico', value: periziaMetadata.dataIncarico });
    if (periziaMetadata.dataOperazioni) details.push({ label: 'Data operazioni', value: periziaMetadata.dataOperazioni });
    if (periziaMetadata.dataDeposito) details.push({ label: 'Termine deposito', value: periziaMetadata.dataDeposito });
    if (periziaMetadata.fondoSpese) details.push({ label: 'Fondo spese', value: periziaMetadata.fondoSpese });

    for (const detail of details) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${detail.label}: `, bold: true }),
          new TextRun({ text: detail.value }),
        ],
      }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  // Strumenti standalone (cronistoria/spese): il documento dichiara cosa è,
  // non si presenta come un report medico-legale a cui "manca la sintesi".
  const isStandaloneTool = params.pipelineMode === 'extraction_only' || params.pipelineMode === 'expenses_only';
  const docTitle = params.pipelineMode === 'extraction_only'
    ? 'CRONISTORIA DOCUMENTALE'
    : params.pipelineMode === 'expenses_only'
      ? 'ANALISI SPESE MEDICHE'
      : 'REPORT MEDICO-LEGALE';

  // Title
  children.push(
    new Paragraph({
      text: docTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({ text: '' }),
  );

  // Header info ("Tipo/Ruolo" solo per la perizia: su uno strumento standalone
  // "Ruolo: Perito Stragiudiziale" era fuorviante).
  children.push(
    new Paragraph({ children: [new TextRun({ text: `Caso: ${caseCode}`, bold: true })] }),
    new Paragraph({ children: [new TextRun({ text: `Paziente: ${patientInitials ?? 'N/D'}` })] }),
    ...(isStandaloneTool
      ? []
      : [new Paragraph({ children: [new TextRun({ text: `Tipo: ${caseType} | Ruolo: ${DOCX_ROLE_DESCRIPTIONS[caseRole] ?? caseRole.toUpperCase()}` })] })]),
    new Paragraph({ children: [new TextRun({ text: `Data report: ${now}` })] }),
    new Paragraph({
      children: [new TextRun({ text: `Eventi: ${events.length} | Anomalie: ${anomalies.length} | Doc. Mancanti: ${missingDocs.length}` })],
    }),
    new Paragraph({ text: '' }),
  );

  // Wave B.4: quality summary header for the perito (carta di lavoro).
  const lowConfidenceCount = events.filter((e) => e.confidence < 60).length;
  const verifyCount = events.filter((e) => e.requires_verification).length;
  if (!isDepositabile && (lowConfidenceCount > 0 || verifyCount > 0)) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Riepilogo qualità estrazione', bold: true, color: '9A3412' })],
        spacing: { before: 100, after: 80 },
      }),
    );
    if (lowConfidenceCount > 0) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `• ${lowConfidenceCount} ${lowConfidenceCount === 1 ? 'evento ha' : 'eventi hanno'} confidenza inferiore al 60% — verificare contro la documentazione originale.`,
          color: '7C2D12',
        })],
      }));
    }
    if (verifyCount > 0) {
      children.push(new Paragraph({
        children: [new TextRun({
          text: `• ${verifyCount} ${verifyCount === 1 ? 'evento è marcato' : 'eventi sono marcati'} come "DA VERIFICARE".`,
          color: '7C2D12',
        })],
      }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  // Section 1: Synthesis — per gli strumenti standalone diventa una nota onesta
  // su cosa contiene il documento (mai "Sintesi non ancora generata" su un caso
  // che una sintesi non la prevede).
  children.push(
    new Paragraph({
      text: isStandaloneTool && !synthesis ? '1. NOTA SUL DOCUMENTO' : '1. SINTESI MEDICO-LEGALE',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  );

  if (synthesis) {
    children.push(...markdownToDocxParagraphs(synthesis));
  } else if (isStandaloneTool) {
    children.push(new Paragraph({
      children: [new TextRun({
        text: 'Questo caso è stato creato con uno strumento di analisi: il documento raccoglie in ordine cronologico gli eventi estratti dalla documentazione caricata e non è una perizia. Per il report medico-legale completo (trascrizione della documentazione, visita, calcoli ed epicrisi) crea un nuovo caso con il modulo "Responsabilità civile".',
        italics: true,
      })],
    }));
  } else {
    children.push(new Paragraph({ text: 'Sintesi non ancora generata.' }));
  }

  children.push(new Paragraph({ text: '' }));

  // Section 2: Timeline
  children.push(
    new Paragraph({
      text: '2. CRONOLOGIA EVENTI CLINICI',
      heading: HeadingLevel.HEADING_1,
    }),
    new Paragraph({ text: '' }),
  );

  // Filter non-clinical events from the chronology (Passaniti regression):
  // SSN cost notices, ticket payments, and admin docs don't belong in the
  // medical timeline.
  const clinicalEvents = events.filter((e) => !NON_CLINICAL_EVENT_TYPES.has(e.event_type));

  // Un documento = UN blocco (feedback beta 2026-07-20): il verbale di PS
  // estratto in 6 eventi resta un blocco unico con le sue sotto-voci, invece
  // di 6 intestazioni indipendenti. Eventi senza documento: lista piatta.
  const groupableEvents = params.anonymized
    ? clinicalEvents.map((e) => ({ ...e, facility: null }))
    : clinicalEvents;
  for (const group of groupEventsByDocument(groupableEvents, params.documents)) {
    if (group.heading) {
      children.push(new Paragraph({
        children: [new TextRun({ text: group.heading, bold: true, size: 26 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 260 },
      }));
    }
    for (const event of group.events) {
    const datePrecNote = event.date_precision !== 'giorno' ? ` [${event.date_precision}]` : '';
    const source = sourceLabels[event.source_type] ?? event.source_type;
    // Wave B.1/B.2: surface confidence + verification flag in DOCX export.
    // Threshold 60% mirrors the events-tab UI badge cutoff.
    const isLowConfidence = typeof event.confidence === 'number' && event.confidence < 60;
    const confidenceTag = isLowConfidence
      ? new TextRun({ text: ` [confidenza ${Math.round(event.confidence)}%]`, color: 'B91C1C', italics: true })
      : new TextRun({ text: '' });

    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${formatDate(event.event_date)}${datePrecNote} `, bold: true }),
          new TextRun({ text: `[${source}]`, bold: true, color: '1E40AF' }),
          event.requires_verification ? new TextRun({ text: ' ⚠ DA VERIFICARE', color: 'DC2626', bold: true }) : new TextRun({ text: '' }),
          confidenceTag,
        ],
        spacing: { before: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: event.title, bold: true, italics: isLowConfidence })],
      }),
      new Paragraph({
        children: [new TextRun({ text: event.description, italics: isLowConfidence })],
      }),
    );

    if (event.diagnosis) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Diagnosi: ', bold: true }),
          new TextRun({ text: event.diagnosis }),
        ],
      }));
    }

    if (event.doctor) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Medico: ', bold: true }),
          new TextRun({ text: event.doctor }),
        ],
      }));
    }

    if (event.expert_notes) {
      children.push(new Paragraph({
        children: [
          new TextRun({ text: 'Note perito: ', bold: true, italics: true }),
          new TextRun({ text: event.expert_notes, italics: true }),
        ],
        shading: { type: ShadingType.SOLID, color: 'EFF6FF' },
      }));
    }
    }
  }

  children.push(new Paragraph({ text: '' }));

  // Section 3: Calculations (carta di lavoro — la tabella ITT/ITP depositabile
  // vive già dentro la sintesi via marker deterministico)
  if (!isDepositabile && calculations && calculations.length > 0) {
    children.push(
      new Paragraph({
        text: '3. PERIODI MEDICO-LEGALI CALCOLATI',
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: '' }),
    );

    for (const calc of calculations) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${calc.label}: `, bold: true }),
            new TextRun({ text: calc.value, bold: true, color: '1E40AF' }),
          ],
          spacing: { before: 150 },
        }),
      );
      if (calc.startDate && calc.endDate) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `${formatDate(calc.startDate)} — ${formatDate(calc.endDate)}`, color: '64748B', size: 22 })],
        }));
      }
      children.push(new Paragraph({
        children: [new TextRun({ text: calc.notes, italics: true, color: '64748B', size: 22 })],
      }));
    }
    children.push(new Paragraph({ text: '' }));
  }

  // Section: Anomalies (carta di lavoro)
  if (!isDepositabile) {
    const anomalySectionNum = calculations && calculations.length > 0 ? '4' : '3';
    children.push(
      new Paragraph({
        text: `${anomalySectionNum}. ANOMALIE RILEVATE`,
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({ text: '' }),
    );

    if (anomalies.length === 0) {
      children.push(new Paragraph({ text: 'Nessuna anomalia rilevata.' }));
    } else {
      for (const anomaly of anomalies) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `[${anomaly.severity.toUpperCase()}] `, bold: true, color: anomaly.severity === 'critica' || anomaly.severity === 'alta' ? 'DC2626' : 'CA8A04' }),
              new TextRun({ text: anomalyLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type, bold: true }),
            ],
            spacing: { before: 150 },
          }),
          new Paragraph({ text: anomaly.description }),
        );
        if (anomaly.suggestion) {
          children.push(new Paragraph({
            children: [new TextRun({ text: anomaly.suggestion, italics: true, color: '64748B' })],
          }));
        }
        // La nota del perito è la SUA valutazione: va stampata in evidenza (prima
        // spariva). "Nota del perito: «...»" — è ciò che lui ha deciso su questa voce.
        if (anomaly.resolution_note && anomaly.resolution_note.trim()) {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: 'Nota del perito: ', bold: true }),
              new TextRun({ text: `«${anomaly.resolution_note.trim()}»` }),
            ],
            spacing: { before: 60 },
          }));
        }
      }
    }

    children.push(new Paragraph({ text: '' }));

    // Section 4: Missing Docs (carta di lavoro)
    children.push(
      new Paragraph({
        text: `${calculations && calculations.length > 0 ? '5' : '4'}. DOCUMENTAZIONE MANCANTE`,
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({ text: '' }),
    );

    if (missingDocs.length === 0) {
      children.push(new Paragraph({ text: 'Nessuna documentazione mancante rilevata.' }));
    } else {
      for (const doc of missingDocs) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: doc.document_name, bold: true })],
            spacing: { before: 100 },
          }),
          new Paragraph({ text: doc.reason }),
        );
      }
    }
  }

  // Signature block
  children.push(...buildSignatureBlock(periziaMetadata, caseRole));

  // AI Act / L. 132/2025 transparency disclosure
  children.push(...getAiActDisclosureDocxParagraphs());

  // Footer timestamp
  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({
      children: [new TextRun({ text: `Report generato da LegMed il ${now}`, color: '94A3B8', size: 18 })],
      alignment: AlignmentType.CENTER,
    }),
  );

  // Build professional header with perito names (like benchmark)
  const headerChildren: Paragraph[] = [];
  if (periziaMetadata?.ctuName) {
    const leftHeader: Paragraph[] = [
      new Paragraph({
        children: [new TextRun({ text: periziaMetadata.ctuName, bold: true, font: 'Courier New', size: 20 })],
      }),
    ];
    if (periziaMetadata.ctuTitle) {
      leftHeader.push(new Paragraph({
        children: [new TextRun({ text: periziaMetadata.ctuTitle, font: 'Courier New', size: 16 })],
      }));
    }

    const rightHeader: Paragraph[] = [];
    if (periziaMetadata.collaboratoreName) {
      rightHeader.push(new Paragraph({
        children: [new TextRun({ text: periziaMetadata.collaboratoreName, bold: true, font: 'Courier New', size: 20 })],
        alignment: AlignmentType.RIGHT,
      }));
      if (periziaMetadata.collaboratoreTitle) {
        rightHeader.push(new Paragraph({
          children: [new TextRun({ text: periziaMetadata.collaboratoreTitle, font: 'Courier New', size: 16 })],
          alignment: AlignmentType.RIGHT,
        }));
      }
    }

    if (rightHeader.length > 0) {
      // Tables can't go directly in docx Header, so we use flat paragraphs
      headerChildren.push(...leftHeader);
      headerChildren.push(new Paragraph({ children: [] })); // spacer
      headerChildren.push(...rightHeader);
    } else {
      headerChildren.push(...leftHeader);
    }
  }

  // Footer with RG number on left, page number on right
  const footerParagraphs: Paragraph[] = [];
  if (periziaMetadata?.rgNumber) {
    footerParagraphs.push(new Paragraph({
      children: [
        new TextRun({ text: `Numero di Ruolo Generale ${periziaMetadata.rgNumber}`, font: 'Courier New', size: 18, color: '444444' }),
      ],
    }));
    footerParagraphs.push(new Paragraph({
      children: [
        new TextRun({ children: [PageNumber.CURRENT], font: 'Courier New', size: 20 }),
      ],
      alignment: AlignmentType.RIGHT,
    }));
  } else {
    footerParagraphs.push(new Paragraph({
      children: [
        new TextRun({ children: [PageNumber.CURRENT], font: 'Courier New', size: 20 }),
      ],
      alignment: AlignmentType.RIGHT,
    }));
  }

  const doc = new Document({
    ...getAiActDocxMetadata(), // marcatura machine-readable art. 50(2) AI Act
    styles: {
      default: {
        document: {
          run: { font: 'Courier New', size: 24 }, // 12pt Courier New (benchmark style)
          paragraph: {
            spacing: { line: 276 }, // ~1.15 line spacing (240=single, 276=1.15)
            alignment: AlignmentType.JUSTIFIED,
          },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,    // 1 inch
            bottom: 1440,  // 1 inch
            left: 1800,    // 1.25 inch (wider for legal docs)
            right: 1440,   // 1 inch
          },
        },
      },
      headers: {
        default: new Header({
          children: headerChildren.length > 0
            ? headerChildren
            : (getDocxWatermarkText(reportStatus)
              ? [new Paragraph({
                  children: [new TextRun({
                    text: getDocxWatermarkText(reportStatus),
                    color: 'C0C0C0', size: 18, italics: true, font: 'Courier New',
                  })],
                  alignment: AlignmentType.CENTER,
                })]
              : []),
        }),
      },
      footers: {
        default: new Footer({ children: footerParagraphs }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}

// ── Professional DOCX Export ──

interface ProfessionalDocxExportParams {
  caseCode: string;
  caseType: string;
  caseRole: string;
  patientInitials: string | null;
  synthesis: string | null;
  events: DocxEvent[];
  anomalies: DocxAnomaly[];
  missingDocs: DocxMissingDoc[];
  calculations?: MedicoLegalCalculation[];
  periziaMetadata: PeriziaMetadataExport;
  documentsWithPages: DocumentWithPages[];
  reportStatus?: string;
  signatureImageBase64?: string;
  /** 'depositabile' (default dalle route) = solo perizia, niente carte di lavoro. */
  exportMode?: ExportMode;
  /** Anonimizza ogni input testuale (audit E-1/H-2): esame obiettivo, parti,
   * eventi, OCR, filename, synthesis. NON tocca i campi strutturati (date). */
  anonymized?: boolean;
}

/**
 * Parse a markdown pipe table into rows of cells.
 */
export function parseMarkdownTable(text: string): string[][] | null {
  const lines = text.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 2) return null;
  // Filter separator rows
  const dataLines = lines.filter((l) => !/^\|[\s\-:|]+\|$/.test(l));
  if (dataLines.length === 0) return null;
  // Split on UNESCAPED pipes (a `\|` is a literal pipe inside a cell), then
  // un-escape it — matching the HTML export. A naive split('|') broke cells
  // containing an escaped pipe (e.g. from formatITTITPTable).
  return dataLines.map((line) =>
    line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, '|')),
  );
}

/**
 * Larghezze di colonna PROPORZIONALI al contenuto (in DXA/twip), non più uguali.
 * Prima ogni colonna riceveva `totalDxa / n`: la colonna "Descrizione" (testo lungo)
 * finiva compressa e mandata a capo mentre "Data"/"Importo" sprecavano spazio — la
 * tabella sembrava "stretta e sbilanciata". Qui la larghezza è proporzionale al
 * contenuto più lungo di ciascuna colonna, con un minimo per non ridurre a filo le
 * colonne corte, poi normalizzata così la somma resta esatta = totalDxa. Pura e testabile.
 */
export function computeTableColumnWidths(tableData: string[][], totalDxa: number): number[] {
  const colCount = Math.max(1, ...tableData.map((r) => r.length));
  const maxLen = new Array<number>(colCount).fill(1);
  for (const row of tableData) {
    row.forEach((cell, c) => {
      const len = (cell ?? '').replace(/\*\*|\*/g, '').length;
      if (len > maxLen[c]) maxLen[c] = len;
    });
  }
  const MIN_DXA = Math.min(Math.floor(totalDxa / colCount), 1100); // ~0.76in di soglia minima
  const totalLen = maxLen.reduce((a, b) => a + b, 0) || 1;
  const raw = maxLen.map((l) => Math.max(MIN_DXA, Math.round((l / totalLen) * totalDxa)));
  const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
  // Normalizza in modo che la somma sia ESATTAMENTE totalDxa (l'ultima assorbe l'arrotondamento).
  const widths = raw.map((w) => Math.round((w / rawSum) * totalDxa));
  const drift = totalDxa - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += drift;
  return widths;
}

/**
 * Convert a section's markdown content to DOCX paragraphs.
 * Handles headings, bold/italic, lists, tables, and plain text.
 */
/**
 * Dimensioni reali di un'immagine leggendo l'header (sincrono — il renderer DOCX è
 * sincrono, niente sharp/async). PNG: IHDR; JPEG: marcatori SOF. Null se non parsabile.
 */
export function getImageDimensions(buffer: Buffer, type: 'png' | 'jpg'): { width: number; height: number } | null {
  try {
    if (type === 'png') {
      if (buffer.length < 24 || buffer.readUInt32BE(0) !== 0x89504e47) return null;
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    // JPEG: scorre i segmenti fino a un marcatore SOF (contiene le dimensioni).
    if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset < buffer.length - 8) {
      if (buffer[offset] !== 0xff) { offset++; continue; }
      const marker = buffer[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return width > 0 && height > 0 ? { width, height } : null;
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
    return null;
  } catch {
    return null;
  }
}

/** Scala (w,h) per stare dentro maxW×maxH conservando l'aspect ratio (no distorsione). */
export function scaleToFit(
  width: number, height: number, maxW: number, maxH: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxW, height: maxH };
  const scale = Math.min(maxW / width, maxH / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Blocchi-placeholder: predicato condiviso col renderer HTML (stessi blocchi
// evidenziati in giallo in entrambi gli export). Ri-esportato per compatibilità.
export { isPlaceholderBlockStart };

export function markdownToDocxParagraphs(content: string): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') { i++; continue; }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      result.push(new Paragraph({
        children: [new TextRun({ text: '————————————————————', color: '999999', size: 18 })],
        spacing: { before: 100, after: 100 },
      }));
      i++;
      continue;
    }

    // Image: ![alt](data:mime;base64,...) — can be anywhere on the line
    const imgMatch = line.match(/!\[([^\]]*)\]\(data:([^;]+);base64,([^)]+)\)/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const mimeType = imgMatch[2];
      const base64Data = imgMatch[3];
      try {
        const imageBuffer = Buffer.from(base64Data, 'base64');
        const docxImageType = mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'jpg' : 'png';
        // Aspect-ratio reale: niente più 450×350 fisso che stira le RX (#audit DOCX 2026-06-27).
        const dims = getImageDimensions(imageBuffer, docxImageType);
        const transformation = dims ? scaleToFit(dims.width, dims.height, 450, 600) : { width: 450, height: 350 };
        result.push(new Paragraph({
          children: [
            new ImageRun({
              data: imageBuffer,
              transformation,
              type: docxImageType,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 100 },
        }));
        if (alt) {
          result.push(new Paragraph({
            children: [new TextRun({ text: alt, italics: true, size: 20, color: '555555' })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }));
        }
      } catch {
        // If image parsing fails, add text placeholder
        result.push(new Paragraph({
          children: [new TextRun({ text: `[Immagine: ${alt}]`, italics: true, color: '999999' })],
        }));
      }
      i++;
      continue;
    }

    // Unresolved ocr-image: placeholder — show as text note
    const ocrImgMatch = line.match(/!\[([^\]]*)\]\(ocr-image:[^)]+\)/);
    if (ocrImgMatch) {
      const alt = ocrImgMatch[1];
      if (alt) {
        result.push(new Paragraph({
          children: [new TextRun({ text: `[${alt}]`, italics: true, size: 20, color: '555555' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 100, after: 100 },
        }));
      }
      i++;
      continue;
    }

    // Table block
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const tableData = parseMarkdownTable(tableLines.join('\n'));
      if (tableData && tableData.length > 0) {
        const TABLE_TOTAL_DXA = 9000;
        const cellLine = { style: BorderStyle.SINGLE, size: 1, color: '999999' };
        const borders = { top: cellLine, bottom: cellLine, left: cellLine, right: cellLine };
        const colWidths = computeTableColumnWidths(tableData, TABLE_TOTAL_DXA);
        const rows = tableData.map((row, rowIdx) =>
          new TableRow({
            tableHeader: rowIdx === 0, // ripete l'intestazione se la tabella va a pagina nuova
            children: row.map((cell, colIdx) =>
              new TableCell({
                children: [new Paragraph({
                  // #7 (audit 2026-06-09): parse inline **grassetto**/*corsivo* nelle
                  // celle invece di stamparli letterali; size 20 + bold sull'header.
                  children: parseInlineFormatting(cell, { size: 20, bold: rowIdx === 0 }),
                })],
                borders,
                // Padding interno: senza margini il testo tocca i bordi e la tabella
                // sembra "schiacciata". ~0.08in sui lati, un filo sopra/sotto.
                margins: { top: 40, bottom: 40, left: 108, right: 108 },
                // Header leggermente ombreggiato = stacco visivo pulito (come nel gold).
                ...(rowIdx === 0 ? { shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } } : {}),
                width: { size: colWidths[colIdx] ?? Math.floor(TABLE_TOTAL_DXA / row.length), type: WidthType.DXA },
              }),
            ),
          }),
        );
        result.push(new Table({
          rows,
          width: { size: TABLE_TOTAL_DXA, type: WidthType.DXA },
          columnWidths: colWidths, // layout fisso rispetta le larghezze calcolate
          layout: TableLayoutType.FIXED,
        }));
        result.push(new Paragraph({ text: '' }));
      } else {
        // Collected pipe-lines that are NOT a real table (e.g. a stray "| nota").
        // Preserve them as plain paragraphs instead of dropping the content.
        for (const tl of tableLines) {
          result.push(new Paragraph({
            children: parseInlineFormatting(tl),
            alignment: AlignmentType.JUSTIFIED,
          }));
        }
      }
      continue;
    }

    // Headings
    // H1 — used for "TRIBUNALE ORDINARIO DI..." benchmark Del Porto.
    // Renders in monospace + character spacing for the giudiziale look.
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      const text = h1Match[1];
      const isTribunal = /tribunale|sezione|n\.\s*r\.?g\.?|procedimenti/i.test(text);
      result.push(new Paragraph({
        children: [new TextRun({
          text,
          bold: true,
          size: 26,
          ...(isTribunal ? { font: 'Courier New', characterSpacing: 30 } : {}),
        })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 200 },
      }));
      i++;
      continue;
    }

    // H2 — section title
    const h2Match = line.match(/^##\s+(.+)$/);
    if (h2Match) {
      result.push(new Paragraph({
        children: [new TextRun({ text: h2Match[1], bold: true, size: 24 })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
      }));
      i++;
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)$/);
    if (h3Match) {
      result.push(new Paragraph({
        text: h3Match[1],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 200 },
      }));
      i++;
      continue;
    }

    const h4Match = line.match(/^####\s+(.+)$/);
    if (h4Match) {
      result.push(new Paragraph({
        children: [new TextRun({ text: h4Match[1], bold: true })],
        spacing: { before: 150 },
      }));
      i++;
      continue;
    }

    // List items
    const ulMatch = line.match(/^[\s]*[-*+]\s+(.+)$/);
    if (ulMatch) {
      result.push(new Paragraph({
        children: parseInlineFormatting(ulMatch[1]),
        bullet: { level: 0 },
      }));
      i++;
      continue;
    }

    const olMatch = line.match(/^[\s]*(\d+)[.)]\s+(.+)$/);
    if (olMatch) {
      result.push(new Paragraph({
        children: [
          new TextRun({ text: `${olMatch[1]}. ` }),
          ...parseInlineFormatting(olMatch[2]),
        ],
        spacing: { before: 50 },
      }));
      i++;
      continue;
    }

    // Blockquote: line starting with `>` (OCR quoted passage). Indented paragraph
    // invece del `>` letterale nel documento depositato. #10 (audit 2026-06-09).
    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
    if (quoteMatch) {
      result.push(new Paragraph({
        children: parseInlineFormatting(quoteMatch[1]),
        indent: { left: 720 },
        alignment: AlignmentType.JUSTIFIED,
      }));
      i++;
      continue;
    }

    // Blocco-placeholder del perito (*[...]* anche multi-riga): evidenziato in GIALLO
    // così il perito trova subito cosa compilare (#audit DOCX 2026-06-27).
    if (isPlaceholderBlockStart(line)) {
      const blockLines: string[] = [];
      while (i < lines.length && blockLines.length < 40) {
        blockLines.push(lines[i]);
        const closes = /\]\*?[.\s]*$/.test(lines[i].trim());
        i++;
        if (closes) break;
      }
      const inner = blockLines.join('\n').trim().replace(/^\*?\[/, '').replace(/\]\*?\.?$/, '').trim();
      for (const pl of inner.split('\n')) {
        result.push(new Paragraph({
          children: [new TextRun({ text: pl.replace(/^\*|\*$/g, ''), italics: true, highlight: 'yellow', size: 20 })],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 60, after: 60 },
        }));
      }
      continue;
    }

    // Regular paragraph — JUSTIFIED by default to match benchmark
    // (Del Porto, Antoniazzi). Word renders justified paragraphs with
    // tracked word-spacing similar to legal/professional documents.
    result.push(new Paragraph({
      children: parseInlineFormatting(line),
      alignment: AlignmentType.JUSTIFIED,
    }));
    i++;
  }

  return result;
}

/**
 * Parse inline markdown formatting (bold, italic) into TextRun array.
 * `opts.size` applies a font size to every run; `opts.bold` forces a bold base
 * (e.g. a table header row) — `**...**` segments stay bold regardless. Both are
 * optional and default to docx defaults, so existing callers are unchanged.
 */
function parseInlineFormatting(text: string, opts?: { size?: number; bold?: boolean }): TextRun[] {
  const { size, bold } = opts ?? {};
  const runs: TextRun[] = [];
  // Split on bold (**text** / __text__) and italic (*text* / _text_).
  // AUDIT 2026-07-16: il corsivo markdown a underscore ("_Non risultano spese..._",
  // riga intro tabella SSN) usciva con underscore LETTERALI nel DOCX depositabile.
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g);
  for (const part of parts) {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true, size }));
    } else if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true, bold, size }));
    } else if (part.length > 0) {
      runs.push(new TextRun({ text: part, bold, size }));
    }
  }
  return runs.length > 0 ? runs : [new TextRun({ text, bold, size })];
}

/**
 * Build 2-column header for DOCX: CTU on left, collaborator on right,
 * separated by a dotted bottom border. Uses a borderless table for layout.
 */
function buildDocxHeaderContent(
  pm: AssemblerPeriziaMetadata,
  hasCollaboratore: boolean,
): (Paragraph | Table)[] {
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const cellBorders = { top: noBorder, left: noBorder, right: noBorder, bottom: noBorder };

  // Lavini benchmark 2026-05-11: nome perito grande+bold (no italic),
  // specializzazioni sotto in size minore, NO allCaps (benchmark usa
  // capitalizzazione normale "Dott. Franco Lavini" + "Specialista in...").
  const leftCellChildren: Paragraph[] = [];
  if (pm.ctuName) {
    leftCellChildren.push(new Paragraph({
      children: [new TextRun({ text: pm.ctuName, bold: true, size: 22 })],
      spacing: { after: 60 },
    }));
  }
  if (pm.ctuTitle) {
    // Title may contain multiple specializations separated by "; " or "|" or newline
    const titleLines = pm.ctuTitle
      .split(/\s*[;|\n]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const line of titleLines) {
      leftCellChildren.push(new Paragraph({
        children: [new TextRun({ text: line, size: 18, color: '333333' })],
        spacing: { after: 40 },
      }));
    }
  }

  const rightCellChildren: Paragraph[] = [];
  if (hasCollaboratore && pm.collaboratoreName) {
    rightCellChildren.push(new Paragraph({
      children: [new TextRun({ text: pm.collaboratoreName, bold: true, size: 22 })],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
    }));
    if (pm.collaboratoreTitle) {
      const titleLines = pm.collaboratoreTitle
        .split(/\s*[;|\n]\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of titleLines) {
        rightCellChildren.push(new Paragraph({
          children: [new TextRun({ text: line, size: 18, color: '333333' })],
          alignment: AlignmentType.RIGHT,
          spacing: { after: 40 },
        }));
      }
    }
  }

  // If no content, return empty
  if (leftCellChildren.length === 0 && rightCellChildren.length === 0) {
    return [];
  }

  // Ensure cells have at least one paragraph
  if (leftCellChildren.length === 0) leftCellChildren.push(new Paragraph({ text: '' }));
  if (rightCellChildren.length === 0) rightCellChildren.push(new Paragraph({ text: '' }));

  const headerTable = new Table({
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: leftCellChildren,
            borders: cellBorders,
            width: { size: 4500, type: WidthType.DXA },
          }),
          new TableCell({
            children: rightCellChildren,
            borders: cellBorders,
            width: { size: 4500, type: WidthType.DXA },
          }),
        ],
      }),
    ],
    width: { size: 9000, type: WidthType.DXA },
  });

  return [
    headerTable,
    new Paragraph({
      text: '',
      border: { bottom: { style: BorderStyle.DOTTED, size: 3, color: '444444', space: 4 } },
    }),
  ];
}

/**
 * Generate a court-quality professional DOCX report with headers, footers,
 * full OCR documentation, and assembled sections.
 */
export async function generateProfessionalDocxReport(params: ProfessionalDocxExportParams): Promise<Buffer> {
  const { caseRole, patientInitials, anomalies, missingDocs, calculations, reportStatus, signatureImageBase64 } = params;

  // GDPR (audit 2026-08-11, E-1/H-2): con anonymized=true anonimizziamo QUI ogni
  // input testuale (pm inclusi esameObiettivo e nomi parti, testo eventi, OCR,
  // filename, synthesis) PRIMA dell'assemblaggio — il DOCX è binario e non
  // ripassabile a valle come l'HTML. Difesa in profondità: qualunque chiamante del
  // generatore ottiene un file davvero anonimo. I campi strutturati (event_date,
  // date dei calcoli) NON si toccano: li parsa il generatore.
  const anonCtx = params.anonymized ? (params.periziaMetadata as unknown as PeriziaMetadata) : undefined;
  const periziaMetadata = params.anonymized
    ? (anonymizePmForExport(params.periziaMetadata as unknown as Record<string, unknown>, anonCtx) as unknown as typeof params.periziaMetadata)
    : params.periziaMetadata;
  const documentsWithPages = params.anonymized
    ? anonymizeDocsForExport(params.documentsWithPages, anonCtx)
    : params.documentsWithPages;
  const synthesis = params.anonymized && params.synthesis
    ? anonymizeText({ text: params.synthesis, periziaMetadata: anonCtx }).anonymizedText
    : params.synthesis;
  const eventsForAssembly = params.anonymized
    ? anonymizeEventsForExport(params.events ?? [], anonCtx)
    : (params.events ?? []);

  const pm = periziaMetadata as AssemblerPeriziaMetadata;
  const assembled = assembleFullReport({
    periziaMetadata: pm,
    caseRole,
    documentsWithPages,
    synthesis,
    anomalies,
    missingDocs,
    calculations,
    exportMode: params.exportMode,
    events: eventsForAssembly.map((e) => ({
      event_date: e.event_date,
      event_type: e.event_type,
      title: e.title,
      description: e.description,
      source_type: e.source_type,
      source_text: (e as unknown as Record<string, unknown>).source_text as string | null ?? null,
      diagnosis: e.diagnosis ?? null,
      doctor: e.doctor ?? null,
      facility: e.facility ?? null,
    })),
  });

  const patientInfo = patientInitials ?? '';
  const hasCollaboratore = Boolean(pm.collaboratoreName);
  const roleTitle = caseRole === 'ctu' ? 'CONSULENZA TECNICA D\'UFFICIO'
    : caseRole === 'ctp' ? 'CONSULENZA TECNICA DI PARTE'
    : 'PERIZIA STRAGIUDIZIALE';

  const children: (Paragraph | Table)[] = [];

  // Cover/intestazione strutturata — soppressa se la sintesi contiene già la sua
  // intestazione veronese (## Intestazione), per non duplicare il frontespizio.
  if (!synthesisHasOwnHeader(synthesis)) {
  // Cover page
  if (pm.tribunale) {
    children.push(new Paragraph({
      children: [new TextRun({ text: pm.tribunale.toUpperCase(), bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600 },
    }));
  }
  if (pm.sezione) {
    children.push(new Paragraph({
      children: [new TextRun({ text: pm.sezione, size: 24 })],
      alignment: AlignmentType.CENTER,
    }));
  }
  if (pm.rgNumber) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `n. R.G. ${pm.rgNumber}`, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
  }
  children.push(new Paragraph({
    children: [new TextRun({ text: roleTitle, bold: true, size: 28, underline: {} })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400, after: 200 },
  }));
  if (patientInitials) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `relativa alla vicenda clinica del/della sig. ${patientInitials}`, size: 24 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
  }

  // Cover details
  const coverDetails: Array<{ label: string; value: string }> = [];
  if (pm.ctuName) coverDetails.push({ label: caseRole === 'ctu' ? 'CTU' : 'CTP', value: `${pm.ctuName}${pm.ctuTitle ? ` — ${pm.ctuTitle}` : ''}` });
  if (pm.judgeName) coverDetails.push({ label: 'Giudice', value: pm.judgeName });
  if (pm.parteRicorrente) coverDetails.push({ label: 'Parte Ricorrente', value: pm.parteRicorrente });
  if (pm.parteResistente) coverDetails.push({ label: 'Parte Resistente', value: pm.parteResistente });
  if (pm.dataIncarico) coverDetails.push({ label: 'Data incarico', value: pm.dataIncarico });
  if (pm.dataDeposito) coverDetails.push({ label: 'Termine deposito', value: pm.dataDeposito });
  if (pm.fondoSpese) coverDetails.push({ label: 'Fondo spese', value: pm.fondoSpese });

  for (const detail of coverDetails) {
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `${detail.label}: `, bold: true }),
        new TextRun({ text: detail.value }),
      ],
    }));
  }

  children.push(new Paragraph({ text: '', spacing: { after: 400 } }));
  } // fine cover gateata (no doppione intestazione)

  // Table of Contents — solo nel fascicolo di lavoro (l'assembler restituisce
  // TOC vuoto in modalità depositabile: i gold aprono con l'intestazione).
  if (assembled.tableOfContents.length > 0) {
    children.push(new Paragraph({
      children: [new TextRun({ text: 'INDICE', bold: true, size: 26, underline: {} })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 200 },
    }));
    for (const item of assembled.tableOfContents) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `${item.number}. ${item.title}` })],
        spacing: { before: 50 },
      }));
    }
    children.push(new Paragraph({ text: '', spacing: { after: 400 } }));
  }

  // Sections
  for (const section of assembled.sections) {
    children.push(new Paragraph({
      text: `${section.number}. ${section.title}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 100 },
    }));

    const sectionParagraphs = markdownToDocxParagraphs(section.content);
    children.push(...sectionParagraphs);
    children.push(new Paragraph({ text: '' }));
  }

  // Signature image (if uploaded)
  if (signatureImageBase64) {
    try {
      const mimeMatch = signatureImageBase64.match(/^data:image\/(\w+);base64,/);
      const imgType = mimeMatch?.[1] === 'jpeg' || mimeMatch?.[1] === 'jpg' ? 'jpg' : 'png';
      const base64Data = signatureImageBase64.replace(/^data:image\/\w+;base64,/, '');
      const sigBuffer = Buffer.from(base64Data, 'base64');
      children.push(new Paragraph({
        children: [
          new ImageRun({
            data: sigBuffer,
            transformation: { width: 200, height: 80 },
            type: imgType,
          }),
        ],
        spacing: { before: 400 },
      }));
    } catch { /* skip if image fails */ }
  }

  // Signature block
  children.push(...buildSignatureBlock(periziaMetadata as PeriziaMetadataExport, caseRole));

  // AI Act / L. 132/2025 transparency disclosure
  children.push(...getAiActDisclosureDocxParagraphs());

  // Footer timestamp
  const now = new Date().toLocaleDateString('it-IT', { year: 'numeric', month: 'long', day: 'numeric' });
  children.push(new Paragraph({
    children: [new TextRun({ text: `Report generato da LegMed il ${now}`, color: '94A3B8', size: 18 })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 400 },
  }));

  const doc = new Document({
    ...getAiActDocxMetadata(), // marcatura machine-readable art. 50(2) AI Act
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 }, // 12pt — requisito tribunali italiani
          paragraph: { spacing: { line: 360 } }, // Interlinea 1.5 — requisito tribunali
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1440,
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
      },
      headers: {
        default: new Header({
          children: [
            ...buildDocxHeaderContent(pm, hasCollaboratore),
            ...(getDocxWatermarkText(reportStatus) ? [new Paragraph({
              children: [
                new TextRun({
                  text: getDocxWatermarkText(reportStatus),
                  color: 'C0C0C0',
                  size: 18,
                  italics: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
            })] : []),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: `${pm.rgNumber ? `${pm.rgNumber} N.R.G.` : ''} – ${patientInfo}${pm.parteResistente ? ` // ${pm.parteResistente}` : ''}`, size: 17, color: '444444', italics: true }),
              ],
              alignment: AlignmentType.LEFT,
              border: { top: { style: BorderStyle.DOTTED, size: 3, color: '444444', space: 4 } },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: '', size: 17, color: '444444' }),
              ],
              alignment: AlignmentType.RIGHT,
              // Page number in same footer paragraph
            }),
            new Paragraph({
              children: [
                new TextRun({ children: [PageNumber.CURRENT], size: 17, color: '444444' }),
                new TextRun({ text: '/', size: 17, color: '444444' }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 17, color: '444444' }),
              ],
              alignment: AlignmentType.RIGHT,
            }),
          ],
        }),
      },
      children: children as Paragraph[],
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
