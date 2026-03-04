import type { EvaluationFramework } from './types';

export const EVALUATION_FRAMEWORKS: readonly EvaluationFramework[] = [
  {
    name: 'Barème SIMLA',
    description: 'Guida alla valutazione medico-legale del danno biologico permanente della Società Italiana di Medicina Legale e delle Assicurazioni. Tabella di riferimento principale per la quantificazione del danno biologico permanente in ambito civilistico.',
    applicableCaseTypes: ['ortopedica', 'oncologica', 'ostetrica', 'anestesiologica', 'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto', 'previdenziale', 'infortuni', 'generica'],
    criteria: [
      'Danno biologico permanente (percentuale 0-100%)',
      'Menomazione dell\'integrità psicofisica della persona',
      'Valutazione indipendente dalla capacità lavorativa',
      'Riferimento a voci tabellari specifiche per distretto anatomico e tipologia di esito',
    ],
    source: 'SIMLA - Società Italiana di Medicina Legale e delle Assicurazioni',
  },
  {
    name: 'Tabelle Govoni-Luvoni-Mangili',
    description: 'Guida orientativa per la valutazione del danno biologico permanente. Storicamente utilizzata come riferimento complementare al Barème SIMLA, specialmente in ambito assicurativo.',
    applicableCaseTypes: ['ortopedica', 'generica'],
    criteria: [
      'Valutazione del danno biologico con approccio tabellare',
      'Gradazione percentuale per tipologia di menomazione',
      'Riferimenti per danno estetico e funzionale',
    ],
    source: 'Govoni-Luvoni-Mangili',
  },
  {
    name: 'Linee Guida ex L. 24/2017 (Gelli-Bianco)',
    description: 'La Legge 24/2017 stabilisce che il giudice, nel decidere sulla responsabilità sanitaria, deve tenere conto delle linee guida pubblicate nel Sistema Nazionale Linee Guida (SNLG) e delle buone pratiche clinico-assistenziali. L\'adesione alle linee guida è criterio di valutazione della condotta sanitaria.',
    applicableCaseTypes: ['ortopedica', 'oncologica', 'ostetrica', 'anestesiologica', 'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto', 'previdenziale', 'infortuni', 'generica'],
    criteria: [
      'Art. 5: obbligo di attenersi a raccomandazioni delle linee guida SNLG',
      'Art. 6: responsabilità penale esclusa se rispettate linee guida (salvo imperizia grave)',
      'Art. 7: responsabilità civile della struttura (contrattuale) e del sanitario (extracontrattuale)',
      'Art. 7 comma 4: inversione onere della prova a carico della struttura sanitaria',
      'Art. 10: obbligo di assicurazione per strutture e professionisti',
    ],
    source: 'Legge 8 marzo 2017, n. 24 (Gelli-Bianco)',
  },
  {
    name: 'Tabelle Ronchi',
    description: 'Guida alla valutazione medico-legale dell\'invalidità permanente utilizzata come riferimento per la liquidazione del danno alla persona, specialmente per micropermanenti (fino al 9%).',
    applicableCaseTypes: ['ortopedica', 'rc_auto', 'generica'],
    criteria: [
      'Valutazione micropermanenti (1-9%)',
      'Riferimento per RC Auto (art. 139 Codice Assicurazioni)',
      'Criteri tabellari per danno biologico di lieve entità',
    ],
    source: 'Tabelle Ronchi (RC Auto)',
  },
  {
    name: 'Invalidità Temporanea (ITT/ITP)',
    description: 'Periodi di invalidità temporanea totale (ITT: impossibilità completa di attendere alle ordinarie occupazioni) e parziale (ITP: riduzione parziale, espressa in percentuale). Calcolati sulla base dei periodi di ricovero, immobilizzazione e convalescenza documentati.',
    applicableCaseTypes: ['ortopedica', 'oncologica', 'ostetrica', 'anestesiologica', 'infezione_nosocomiale', 'errore_diagnostico', 'rc_auto', 'previdenziale', 'infortuni', 'generica'],
    criteria: [
      'ITT: periodo di totale incapacità (ricovero, allettamento, immobilizzazione)',
      'ITP al 75%: convalescenza con limitazioni significative',
      'ITP al 50%: autonomia parziale ma attività ridotta',
      'ITP al 25%: limitazioni lievi, graduale ripresa',
      'Determinazione della data di stabilizzazione dei postumi',
    ],
    source: 'Criterio medico-legale consolidato',
  },
] as const;

/**
 * Format evaluation frameworks as text for prompt injection.
 */
export function formatEvaluationFrameworksForPrompt(): string {
  return EVALUATION_FRAMEWORKS
    .map((f) => `### ${f.name}\n${f.description}\nCriteri: ${f.criteria.join('; ')}\nFonte: ${f.source}`)
    .join('\n\n');
}
