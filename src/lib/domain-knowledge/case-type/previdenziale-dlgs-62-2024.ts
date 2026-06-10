import type { CaseTypeKnowledge } from '../types';

export const PREVIDENZIALE_DLGS62_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'previdenziale_dlgs62',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali: condizione di disabilità accertata, iter amministrativo presso la commissione multidisciplinare, verbale impugnato, quesito peritale e conclusioni sulla valutazione multidimensionale.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 500, max: 1000 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica dell\'iter: domanda di accertamento, valutazione della commissione multidisciplinare, verbale di accertamento, eventuale progetto di vita, ricorso giurisdizionale.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'quadro_clinico',
      title: 'Quadro Clinico e Funzionale',
      description: 'Descrizione delle menomazioni fisiche, psichiche e sensoriali. Analisi dello stato funzionale secondo il modello ICF (funzioni corporee, strutture corporee, attività e partecipazione, fattori ambientali). Terapie in corso e ausili utilizzati.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'valutazione_multidimensionale',
      title: 'Valutazione Multidimensionale',
      description: 'Valutazione della condizione di disabilità secondo i criteri del D.Lgs. 62/2024: analisi delle limitazioni dell\'attività e delle restrizioni alla partecipazione sociale, lavorativa e relazionale. Applicazione della classificazione ICF. Confronto con la valutazione della commissione multidisciplinare contenuta nel verbale impugnato.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
    {
      id: 'progetto_di_vita',
      title: 'Progetto di Vita Individuale',
      description: 'Valutazione delle esigenze di sostegno e degli accomodamenti ragionevoli necessari. Analisi dell\'adeguatezza dell\'eventuale progetto di vita formulato dalla commissione. Indicazioni sui supporti necessari per la piena partecipazione alla vita sociale, lavorativa e relazionale.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi: conformità della valutazione ai criteri ICF, completezza dell\'accertamento multidimensionale, adeguatezza del progetto di vita, profili di criticità del verbale impugnato.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Domanda di accertamento condizione di disabilità',
      expectedFollowUpDays: 90,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 180,
      source: 'D.Lgs. 62/2024 — Tempistiche accertamento condizione di disabilità',
    },
    {
      procedure: 'Valutazione commissione multidisciplinare',
      expectedFollowUpDays: 60,
      expectedRecoveryDays: 180,
      criticalDelayThresholdDays: 120,
      source: 'D.Lgs. 62/2024 art. 5 — Commissione multidisciplinare',
    },
    {
      procedure: 'Ricorso giurisdizionale avverso verbale',
      expectedFollowUpDays: 30,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 180,
      source: 'D.Lgs. 62/2024 — Termini ricorso',
    },
    {
      procedure: 'Elaborazione e revisione progetto di vita',
      expectedFollowUpDays: 60,
      expectedRecoveryDays: 180,
      criticalDelayThresholdDays: 365,
      source: 'D.Lgs. 62/2024 art. 18 — Progetto di vita individuale',
    },
  ],
  commonAnomalyPatterns: [
    'Valutazione della commissione non conforme al modello ICF come richiesto dal D.Lgs. 62/2024',
    'Assenza di valutazione multidimensionale completa (funzioni corporee, attività, partecipazione, fattori ambientali)',
    'Documentazione clinica insufficiente per la valutazione della condizione di disabilità',
    'Progetto di vita non elaborato o non adeguato alle esigenze documentate',
    'Mancata considerazione dei fattori ambientali e contestuali nella valutazione',
    'Discrepanza tra la documentazione clinica e la valutazione espressa nel verbale',
    'Assenza di documentazione specialistica recente per patologie in evoluzione',
    'Composizione della commissione multidisciplinare non conforme ai requisiti normativi',
  ],
  evaluationFrameworks: [
    'Classificazione Internazionale del Funzionamento, della Disabilità e della Salute (ICF — OMS)',
    'D.Lgs. 62/2024 — Definizioni e procedure di accertamento della condizione di disabilità',
    'Tabelle INPS per l\'invalidità civile (D.M. 05/02/1992) — integrative',
    'Convenzione ONU sui Diritti delle Persone con Disabilità (CRPD)',
  ],
  keyTerminology: [
    { term: 'Condizione di disabilità (D.Lgs. 62/2024)', definition: 'Condizione risultante dall\'interazione tra menomazioni che riguardano funzioni o strutture del corpo e barriere comportamentali e ambientali, che, su base di uguaglianza con gli altri, impediscono la piena ed effettiva partecipazione alla società. Sostituisce la precedente nozione di "invalidità civile" nei nuovi accertamenti.' },
    { term: 'Valutazione multidimensionale', definition: 'Procedura di accertamento prevista dal D.Lgs. 62/2024 che valuta la persona con disabilità nella globalità della sua condizione, considerando funzioni corporee, strutture corporee, attività e partecipazione, fattori ambientali e personali secondo il modello bio-psico-sociale ICF.' },
    { term: 'Progetto di vita individuale', definition: 'Strumento introdotto dal D.Lgs. 62/2024 (art. 18) che definisce i sostegni, gli accomodamenti ragionevoli e le misure necessarie per garantire alla persona con disabilità la piena partecipazione alla vita sociale, lavorativa e relazionale. Deve essere elaborato con la partecipazione della persona interessata.' },
    { term: 'ICF (Classificazione Internazionale del Funzionamento)', definition: 'Framework dell\'OMS per la classificazione della salute e degli stati correlati. Articolato in: funzioni corporee (b), strutture corporee (s), attività e partecipazione (d), fattori ambientali (e). Il D.Lgs. 62/2024 ne impone l\'adozione per gli accertamenti della condizione di disabilità.' },
    { term: 'Commissione multidisciplinare', definition: 'Organismo previsto dal D.Lgs. 62/2024 (art. 5) per l\'accertamento della condizione di disabilità, composta da medico legale, medico specialista, professionista dell\'area sanitaria e assistente sociale. Deve effettuare la valutazione secondo il modello bio-psico-sociale.' },
    { term: 'Accomodamento ragionevole', definition: 'Modifiche e adattamenti necessari e appropriati che non impongano un onere sproporzionato o eccessivo, per assicurare alle persone con disabilità il godimento e l\'esercizio di tutti i diritti umani e delle libertà fondamentali su base di uguaglianza (art. 2 CRPD, recepito dal D.Lgs. 62/2024).' },
  ],
  synthesisGuidance: `Nell'analisi del ricorso avverso verbale di accertamento ai sensi del D.Lgs. 62/2024,
adottare rigorosamente il modello bio-psico-sociale previsto dalla classificazione ICF.
La valutazione deve superare l'approccio puramente percentualistico dell'invalidità civile
tradizionale, concentrandosi sull'interazione tra le menomazioni della persona e le barriere
ambientali e sociali che limitano la partecipazione.
Strutturare la valutazione secondo le componenti ICF: funzioni corporee (b), strutture
corporee (s), attività e partecipazione (d), fattori ambientali (e). Per ciascuna componente,
specificare il qualificatore di gravità (0-4) ove possibile.
Verificare la conformità del verbale impugnato ai criteri del D.Lgs. 62/2024: completezza
della valutazione multidimensionale, corretta applicazione del modello ICF, adeguata
considerazione dei fattori contestuali.
Per il progetto di vita, valutare se gli interventi proposti siano proporzionati alle esigenze
documentate, se garantiscano la massima autonomia possibile e se siano stati elaborati
con la partecipazione della persona interessata.
Distinguere tra condizione di disabilità accertata e diritto alle prestazioni: il D.Lgs. 62/2024
separa l'accertamento della condizione dalla determinazione dei benefici spettanti.`,
} as const;
