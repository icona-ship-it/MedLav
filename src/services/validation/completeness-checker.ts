import type { CaseType } from '@/types';
import type { ConsolidatedEvent } from '../consolidation/event-consolidator';

export interface CompletenessRequirement {
  name: string;
  category: 'obbligatorio' | 'raccomandato';
  searchKeywords: string[];
  eventTypes?: string[];
}

export interface CompletenessResult {
  caseType: CaseType;
  completenessPercent: number;
  missingRequired: CompletenessRequirement[];
  foundItems: string[];
}

const REQUIREMENTS_BY_CASE_TYPE: Record<CaseType, CompletenessRequirement[]> = {
  oncologica: [
    { name: 'Staging TNM', category: 'obbligatorio', searchKeywords: ['tnm', 'staging', 'stadio', 'stadiazione'], eventTypes: ['diagnosi'] },
    { name: 'Esame istologico/biopsia', category: 'obbligatorio', searchKeywords: ['istologico', 'biopsia', 'istologia', 'bioptico'], eventTypes: ['diagnosi', 'esame'] },
    { name: 'Imaging di staging', category: 'obbligatorio', searchKeywords: ['tac', 'pet', 'rm', 'risonanza', 'tc total body', 'staging imaging'], eventTypes: ['esame'] },
    { name: 'Markers tumorali', category: 'raccomandato', searchKeywords: ['marker', 'markers', 'cea', 'ca 19', 'ca 125', 'psa', 'alfa-fetoproteina'] },
    { name: 'Piano terapeutico', category: 'obbligatorio', searchKeywords: ['piano terapeutico', 'chemioterapia', 'radioterapia', 'immunoterapia', 'protocollo terapeutico'], eventTypes: ['terapia'] },
  ],
  ostetrica: [
    { name: 'Tracciato CTG', category: 'obbligatorio', searchKeywords: ['ctg', 'cardiotocografia', 'cardiotocografico', 'tracciato'] },
    { name: 'Partogramma', category: 'obbligatorio', searchKeywords: ['partogramma', 'partografia'] },
    { name: 'Punteggio APGAR', category: 'obbligatorio', searchKeywords: ['apgar'] },
    { name: 'Età gestazionale', category: 'obbligatorio', searchKeywords: ['età gestazionale', 'settimane di gestazione', 'settimana gestazionale', 'eg'] },
    { name: 'Peso neonatale', category: 'raccomandato', searchKeywords: ['peso neonatale', 'peso alla nascita', 'peso neonato'] },
  ],
  ortopedica: [
    { name: 'Imaging pre-operatorio', category: 'obbligatorio', searchKeywords: ['rx pre', 'tac pre', 'rm pre', 'radiografia pre', 'imaging pre'], eventTypes: ['esame'] },
    { name: 'Descrizione operatoria', category: 'obbligatorio', searchKeywords: ['descrizione operatoria', 'verbale operatorio', 'intervento chirurgico'], eventTypes: ['intervento'] },
    { name: 'Imaging post-operatorio', category: 'obbligatorio', searchKeywords: ['rx post', 'tac post', 'rm post', 'radiografia post', 'controllo radiografico', 'imaging post'], eventTypes: ['esame', 'follow-up'] },
    { name: 'ROM (Range of Motion)', category: 'raccomandato', searchKeywords: ['rom', 'range of motion', 'escursione articolare', 'mobilità articolare'] },
  ],
  anestesiologica: [
    { name: 'ASA Score', category: 'obbligatorio', searchKeywords: ['asa', 'asa score', 'classificazione asa', 'rischio anestesiologico'] },
    { name: 'Monitoraggio intraoperatorio', category: 'obbligatorio', searchKeywords: ['monitoraggio intraoperatorio', 'parametri vitali intra', 'monitoraggio continuo'] },
    { name: 'Cartella anestesiologica', category: 'obbligatorio', searchKeywords: ['cartella anestesiologica', 'scheda anestesiologica', 'foglio anestesia'] },
  ],
  infezione_nosocomiale: [
    { name: 'Coltura/antibiogramma', category: 'obbligatorio', searchKeywords: ['coltura', 'antibiogramma', 'esame colturale', 'emocoltura', 'urinocoltura'] },
    { name: 'Terapia antibiotica', category: 'obbligatorio', searchKeywords: ['antibiotico', 'terapia antibiotica', 'antibioticoterapia'], eventTypes: ['terapia'] },
    { name: 'Data onset infezione', category: 'obbligatorio', searchKeywords: ['onset', 'insorgenza infezione', 'comparsa infezione', 'esordio infettivo'] },
  ],
  errore_diagnostico: [
    { name: 'Referti diagnostici sequenziali', category: 'obbligatorio', searchKeywords: ['referto', 'esame diagnostico', 'accertamento'], eventTypes: ['esame', 'diagnosi'] },
    { name: 'Imaging diagnostico', category: 'obbligatorio', searchKeywords: ['rx', 'tac', 'rm', 'ecografia', 'radiografia'], eventTypes: ['esame'] },
    { name: 'Referti specialistici', category: 'raccomandato', searchKeywords: ['consulenza', 'specialistica', 'visita specialistica'], eventTypes: ['visita'] },
  ],
  rc_auto: [
    { name: 'Verbale Pronto Soccorso', category: 'obbligatorio', searchKeywords: ['pronto soccorso', 'ps', 'verbale ps', 'accesso ps'], eventTypes: ['visita', 'ricovero'] },
    { name: 'Imaging post-trauma', category: 'obbligatorio', searchKeywords: ['rx', 'tac', 'rm', 'radiografia', 'imaging'], eventTypes: ['esame'] },
    { name: 'Dinamica sinistro', category: 'raccomandato', searchKeywords: ['dinamica', 'sinistro', 'incidente', 'impatto', 'collisione'] },
  ],
  previdenziale: [
    { name: 'Certificati specialistici', category: 'obbligatorio', searchKeywords: ['certificato', 'specialistico', 'visita specialistica', 'consulenza'], eventTypes: ['visita'] },
    { name: 'Esami diagnostici', category: 'obbligatorio', searchKeywords: ['esame', 'diagnostico', 'accertamento'], eventTypes: ['esame'] },
    { name: 'Terapie in corso', category: 'raccomandato', searchKeywords: ['terapia in corso', 'trattamento in corso', 'farmacologica'], eventTypes: ['terapia'] },
  ],
  infortuni: [
    { name: 'Certificato INAIL', category: 'obbligatorio', searchKeywords: ['inail', 'certificato inail', 'denuncia infortunio'] },
    { name: 'Denuncia infortunio', category: 'obbligatorio', searchKeywords: ['denuncia infortunio', 'denuncia di infortunio', 'rapporto infortunio'] },
    { name: 'Certificati continuazione', category: 'raccomandato', searchKeywords: ['continuazione', 'certificato continuazione', 'prosecuzione'] },
  ],
  generica: [
    { name: 'Consenso informato', category: 'raccomandato', searchKeywords: ['consenso informato', 'consenso'], eventTypes: ['consenso'] },
    { name: 'Lettera di dimissione', category: 'raccomandato', searchKeywords: ['dimissione', 'lettera dimissione', 'lettera di dimissione'] },
  ],
};

/**
 * Check documentation completeness against expected requirements for a case type.
 * Scans event titles, descriptions, and diagnoses for keyword matches.
 */
export function checkCompleteness(params: {
  events: ConsolidatedEvent[];
  caseType: CaseType;
  caseTypes?: CaseType[];
}): CompletenessResult {
  const { events, caseType, caseTypes } = params;

  // Combine requirements from all types for multi-type cases
  const effectiveTypes = caseTypes && caseTypes.length > 1 ? caseTypes : [caseType];
  const seenNames = new Set<string>();
  const allRequirements: CompletenessRequirement[] = [];

  for (const ct of effectiveTypes) {
    const reqs = REQUIREMENTS_BY_CASE_TYPE[ct] ?? [];
    for (const req of reqs) {
      if (!seenNames.has(req.name)) {
        seenNames.add(req.name);
        allRequirements.push(req);
      }
    }
  }

  if (allRequirements.length === 0) {
    return {
      caseType,
      completenessPercent: 100,
      missingRequired: [],
      foundItems: [],
    };
  }

  // Build searchable text from events
  const eventTexts = events.map((e) =>
    `${e.title} ${e.description} ${e.diagnosis ?? ''}`.toLowerCase(),
  );

  const foundItems: string[] = [];
  const missingRequired: CompletenessRequirement[] = [];

  for (const req of allRequirements) {
    const found = isRequirementMet(req, events, eventTexts);
    if (found) {
      foundItems.push(req.name);
    } else {
      missingRequired.push(req);
    }
  }

  const completenessPercent = allRequirements.length > 0
    ? Math.round((foundItems.length / allRequirements.length) * 100)
    : 100;

  return {
    caseType,
    completenessPercent,
    missingRequired,
    foundItems,
  };
}

/**
 * Check if a requirement is met by scanning events for keyword matches.
 */
function isRequirementMet(
  req: CompletenessRequirement,
  events: ConsolidatedEvent[],
  eventTexts: string[],
): boolean {
  for (let i = 0; i < events.length; i++) {
    // If eventTypes filter is specified, check it first
    if (req.eventTypes && req.eventTypes.length > 0) {
      if (!req.eventTypes.includes(events[i].eventType)) continue;
    }

    const text = eventTexts[i];
    const keywordMatch = req.searchKeywords.some((kw) => text.includes(kw.toLowerCase()));
    if (keywordMatch) return true;
  }

  // Also try a broader search across ALL event texts (no eventType filter)
  if (req.eventTypes && req.eventTypes.length > 0) {
    for (const text of eventTexts) {
      const keywordMatch = req.searchKeywords.some((kw) => text.includes(kw.toLowerCase()));
      if (keywordMatch) return true;
    }
  }

  return false;
}
