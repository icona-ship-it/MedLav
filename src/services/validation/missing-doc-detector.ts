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
  rc_auto: [
    { name: 'Verbale di pronto soccorso', check: 'hasLetteraDimissione', reason: 'Documento fondamentale per attestare le lesioni riportate immediatamente dopo il sinistro e la tempestivita del primo accesso sanitario' },
    { name: 'Imaging post-trauma (RX/TC/RM)', check: 'hasEsamiPreOp', reason: 'Essenziale per documentare oggettivamente le lesioni e la loro compatibilita con la dinamica del sinistro' },
    { name: 'Referti visite specialistiche e follow-up', check: 'hasFollowUpPostOp', reason: 'Necessari per documentare l\'evoluzione clinica delle lesioni e determinare i periodi di inabilita temporanea' },
    { name: 'Diario clinico o documentazione del decorso', check: 'hasDiarioClinico', reason: 'Necessario per ricostruire l\'evoluzione clinica e i periodi di inabilita temporanea' },
  ],
  previdenziale: [
    { name: 'Documentazione specialistica delle patologie dichiarate', check: 'hasFollowUpPostOp', reason: 'Essenziale per documentare le patologie alla base della richiesta di invalidita con referti specialistici recenti' },
    { name: 'Esami strumentali e diagnostici', check: 'hasEsamiPreOp', reason: 'Necessari per oggettivare le limitazioni funzionali e supportare la valutazione percentuale di invalidita' },
    { name: 'Documentazione delle terapie in corso', check: 'hasDiarioClinico', reason: 'Fondamentale per dimostrare la cronicita delle patologie e l\'adeguatezza del trattamento in atto' },
  ],
  infortuni: [
    { name: 'Certificato medico iniziale INAIL', check: 'hasEsamiPreOp', reason: 'Documento obbligatorio per l\'apertura della pratica INAIL con diagnosi iniziale e prognosi' },
    { name: 'Denuncia di infortunio o malattia professionale', check: 'hasDiarioClinico', reason: 'Documento obbligatorio che attesta la dinamica dell\'evento e le circostanze lavorative' },
    { name: 'Referti dei controlli e certificati di continuazione', check: 'hasFollowUpPostOp', reason: 'Necessari per documentare il decorso clinico e determinare la durata dell\'inabilita temporanea' },
    { name: 'Lettera di dimissione (se ricovero)', check: 'hasLetteraDimissione', reason: 'Documento fondamentale per la diagnosi finale e le indicazioni terapeutiche alla dimissione post-infortunio' },
  ],
  perizia_assicurativa: [
    { name: 'Verbale di pronto soccorso', check: 'hasLetteraDimissione', reason: 'Documento fondamentale per attestare le lesioni riportate e la tempestivita del primo accesso sanitario post-sinistro' },
    { name: 'Imaging post-trauma (RX/TC/RM)', check: 'hasEsamiPreOp', reason: 'Essenziale per documentare oggettivamente le lesioni e la loro compatibilita con la dinamica del sinistro' },
    { name: 'Referti visite specialistiche e follow-up', check: 'hasFollowUpPostOp', reason: 'Necessari per documentare l\'evoluzione clinica e determinare i periodi di inabilita temporanea' },
  ],
  analisi_spese_mediche: [
    { name: 'Fatture e ricevute delle prestazioni sanitarie', check: 'hasEsamiPreOp', reason: 'Documentazione essenziale per la valutazione di congruita delle spese mediche sostenute' },
    { name: 'Prescrizioni mediche correlate alle spese', check: 'hasFollowUpPostOp', reason: 'Necessarie per verificare la necessita medica delle prestazioni e la loro pertinenza al quadro clinico' },
    { name: 'Documentazione clinica del quadro patologico', check: 'hasDiarioClinico', reason: 'Fondamentale per valutare la coerenza delle spese con la patologia documentata' },
  ],
  opinione_prognostica: [
    { name: 'Documentazione clinica recente', check: 'hasFollowUpPostOp', reason: 'Essenziale per valutare lo stato attuale delle lesioni e formulare la prognosi' },
    { name: 'Imaging diagnostico recente', check: 'hasEsamiPreOp', reason: 'Necessario per oggettivare lo stato di evoluzione delle lesioni e stimare la stabilizzazione' },
    { name: 'Documentazione dei trattamenti effettuati', check: 'hasDiarioClinico', reason: 'Fondamentale per valutare la risposta ai trattamenti e prevedere l\'evoluzione clinica' },
  ],
  generica: [
    { name: 'Consenso informato', check: 'hasConsenso', reason: 'Obbligatorio per procedure invasive' },
    { name: 'Lettera di dimissione', check: 'hasLetteraDimissione', reason: 'Documento fondamentale per ogni ricovero' },
  ],
};

/**
 * Detect missing documents by comparing expected docs for the case type
 * against what was actually found in the extracted events.
 * Supports caseTypes array for multi-type cases: combines expected docs from all types.
 */
export function detectMissingDocuments(params: {
  events: ConsolidatedEvent[];
  caseType: CaseType;
  caseTypes?: CaseType[];
}): MissingDocument[] {
  const { events, caseType, caseTypes } = params;
  const presence = analyzeDocumentPresence(events);

  // Combine expected docs from all types, deduplicating by name
  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const seenNames = new Set<string>();
  const allExpected: Array<{ name: string; check: keyof DocumentPresence; reason: string }> = [];

  for (const ct of effectiveTypes) {
    const expected = EXPECTED_DOCS_BY_CASE_TYPE[ct];
    for (const doc of expected) {
      if (!seenNames.has(doc.name)) {
        seenNames.add(doc.name);
        allExpected.push(doc);
      }
    }
  }

  const missing: MissingDocument[] = [];

  for (const doc of allExpected) {
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

