import type { CaseType } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';
import { formatDate } from '@/lib/format';

export interface MissingDocument {
  documentName: string;
  reason: string;
  relatedEvent: string | null;
}

interface DocumentPresence {
  hasConsenso: boolean;
  hasCartellaAnestesiologica: boolean;
  hasDescrizioneOperatoria: boolean;
  hasLetteraDimissione: boolean;
  hasFollowUpPostOp: boolean;
  hasEsamiPreOp: boolean;
  hasDiarioClinico: boolean;
}

/**
 * Expected documents per case type.
 * Each case type defines which documents are mandatory.
 */
const EXPECTED_DOCS_BY_CASE_TYPE: Record<CaseType, Array<{
  name: string;
  check: keyof DocumentPresence;
  reason: string;
}>> = {
  ortopedica: [
    { name: 'Consenso informato chirurgico', check: 'hasConsenso', reason: 'Obbligatorio per ogni intervento chirurgico ortopedico ai fini della validità del consenso prestato' },
    { name: 'Descrizione operatoria', check: 'hasDescrizioneOperatoria', reason: 'Essenziale per la valutazione della tecnica chirurgica e della correttezza dell\'atto operatorio' },
    { name: 'Cartella anestesiologica', check: 'hasCartellaAnestesiologica', reason: 'Necessaria per valutare la gestione anestesiologica e i parametri vitali intraoperatori' },
    { name: 'Lettera di dimissione', check: 'hasLetteraDimissione', reason: 'Documento fondamentale per la diagnosi finale e le indicazioni terapeutiche alla dimissione' },
    { name: 'Follow-up post-operatorio', check: 'hasFollowUpPostOp', reason: 'Controlli post-chirurgici essenziali per documentare il decorso e gli esiti' },
    { name: 'Esami pre-operatori', check: 'hasEsamiPreOp', reason: 'Necessari per valutare l\'idoneità all\'intervento e le condizioni cliniche basali' },
    { name: 'Imaging pre e post operatorio (RX/TC/RM)', check: 'hasFollowUpPostOp', reason: 'Fondamentale per confrontare le condizioni anatomiche prima e dopo l\'intervento' },
  ],
  oncologica: [
    { name: 'Referti bioptici/istologici', check: 'hasDescrizioneOperatoria', reason: 'Essenziale per la diagnosi definitiva e la stadiazione tumorale' },
    { name: 'Imaging diagnostico (TC/PET/RM)', check: 'hasEsamiPreOp', reason: 'Necessario per la stadiazione e il monitoraggio della progressione' },
    { name: 'Markers tumorali', check: 'hasEsamiPreOp', reason: 'Utili per il monitoraggio della risposta terapeutica' },
    { name: 'Follow-up oncologico', check: 'hasFollowUpPostOp', reason: 'Essenziale per documentare l\'evoluzione della malattia' },
  ],
  ostetrica: [
    { name: 'Cartella ostetrica completa', check: 'hasDiarioClinico', reason: 'Documento fondamentale per ricostruire il travaglio e il parto' },
    { name: 'Tracciato cardiotocografico (CTG)', check: 'hasEsamiPreOp', reason: 'Essenziale per valutare il benessere fetale durante il travaglio' },
    { name: 'Cartella neonatale', check: 'hasFollowUpPostOp', reason: 'Necessaria per documentare le condizioni del neonato (APGAR, adattamento)' },
    { name: 'Consenso informato', check: 'hasConsenso', reason: 'Obbligatorio specialmente per taglio cesareo e procedure invasive' },
    { name: 'Partogramma', check: 'hasDiarioClinico', reason: 'Documento cruciale per la valutazione della progressione del travaglio' },
  ],
  anestesiologica: [
    { name: 'Cartella anestesiologica completa', check: 'hasCartellaAnestesiologica', reason: 'Documento primario per la valutazione dell\'atto anestesiologico' },
    { name: 'Valutazione preoperatoria anestesiologica', check: 'hasEsamiPreOp', reason: 'Necessaria per verificare l\'adeguatezza della valutazione del rischio (ASA score)' },
    { name: 'Monitoraggio parametri vitali intraoperatori', check: 'hasCartellaAnestesiologica', reason: 'Essenziale per valutare la gestione intraoperatoria' },
    { name: 'Consenso informato per anestesia', check: 'hasConsenso', reason: 'Obbligatorio per informare il paziente sui rischi specifici dell\'anestesia' },
  ],
  infezione_nosocomiale: [
    { name: 'Esami colturali e antibiogrammi', check: 'hasEsamiPreOp', reason: 'Essenziali per identificare il patogeno e la sensibilità antibiotica' },
    { name: 'Diario clinico del ricovero', check: 'hasDiarioClinico', reason: 'Necessario per documentare l\'insorgenza e l\'evoluzione dell\'infezione' },
    { name: 'Terapia antibiotica documentata', check: 'hasFollowUpPostOp', reason: 'Fondamentale per valutare l\'adeguatezza del trattamento' },
    { name: 'Lettera di dimissione', check: 'hasLetteraDimissione', reason: 'Necessaria per la diagnosi finale comprensiva dell\'infezione' },
  ],
  errore_diagnostico: [
    { name: 'Tutti i referti diagnostici in sequenza temporale', check: 'hasEsamiPreOp', reason: 'Necessari per ricostruire il percorso diagnostico e individuare ritardi' },
    { name: 'Referti imaging', check: 'hasEsamiPreOp', reason: 'Essenziali per valutare se le immagini diagnostiche erano indicative della patologia' },
    { name: 'Referti visite specialistiche', check: 'hasFollowUpPostOp', reason: 'Necessari per valutare l\'iter diagnostico-specialistico' },
  ],
  generica: [
    { name: 'Consenso informato', check: 'hasConsenso', reason: 'Obbligatorio per procedure invasive' },
    { name: 'Lettera di dimissione', check: 'hasLetteraDimissione', reason: 'Documento fondamentale per ogni ricovero' },
  ],
};

/**
 * Detect missing documents by comparing expected docs for the case type
 * against what was actually found in the extracted events.
 */
export function detectMissingDocuments(params: {
  events: ConsolidatedEvent[];
  caseType: CaseType;
}): MissingDocument[] {
  const { events, caseType } = params;
  const presence = analyzeDocumentPresence(events);
  const expected = EXPECTED_DOCS_BY_CASE_TYPE[caseType];
  const missing: MissingDocument[] = [];

  for (const doc of expected) {
    if (!presence[doc.check]) {
      // Find a related event for context
      const relatedEvent = findRelatedEvent(doc.check, events);

      missing.push({
        documentName: doc.name,
        reason: doc.reason,
        relatedEvent: relatedEvent
          ? `${formatDate(relatedEvent.eventDate)} - ${relatedEvent.title}`
          : null,
      });
    }
  }

  return missing;
}

/**
 * Analyze which types of documentation are present in the extracted events.
 */
function analyzeDocumentPresence(
  events: ConsolidatedEvent[],
): DocumentPresence {
  const allText = events.map((e) => `${e.title} ${e.description}`.toLowerCase()).join(' ');
  const eventTypes = new Set(events.map((e) => e.eventType));

  return {
    hasConsenso: eventTypes.has('consenso') || allText.includes('consenso informato'),

    hasCartellaAnestesiologica:
      allText.includes('anestesi') ||
      allText.includes('asa score') ||
      allText.includes('cartella anestesiologica'),

    hasDescrizioneOperatoria:
      eventTypes.has('intervento') ||
      allText.includes('descrizione operatoria') ||
      allText.includes('intervento chirurgico'),

    hasLetteraDimissione:
      allText.includes('dimissione') ||
      allText.includes('lettera di dimissione'),

    hasFollowUpPostOp:
      eventTypes.has('follow-up') ||
      allText.includes('follow-up') ||
      allText.includes('controllo post'),

    hasEsamiPreOp:
      allText.includes('pre-operatori') ||
      allText.includes('preoperatori') ||
      (eventTypes.has('esame') && events.some(
        (e) => e.eventType === 'esame' &&
          events.some((s) => s.eventType === 'intervento' && s.eventDate > e.eventDate),
      )),

    hasDiarioClinico:
      allText.includes('diario clinico') ||
      allText.includes('diario medico') ||
      allText.includes('diario infermieristico') ||
      allText.includes('cartella clinica'),
  };
}

/**
 * Find a related event that makes the missing document relevant.
 */
function findRelatedEvent(
  check: keyof DocumentPresence,
  events: ConsolidatedEvent[],
): ConsolidatedEvent | null {
  switch (check) {
    case 'hasConsenso':
    case 'hasDescrizioneOperatoria':
    case 'hasCartellaAnestesiologica':
    case 'hasEsamiPreOp':
      return events.find((e) => e.eventType === 'intervento') ?? null;

    case 'hasLetteraDimissione':
      return events.find((e) => e.eventType === 'ricovero') ?? null;

    case 'hasFollowUpPostOp':
      return events.find((e) => e.eventType === 'intervento') ??
        events.find((e) => e.eventType === 'ricovero') ?? null;

    case 'hasDiarioClinico':
      return events.find((e) => e.eventType === 'ricovero') ?? null;

    default:
      return null;
  }
}

