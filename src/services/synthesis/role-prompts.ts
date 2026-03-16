import type { CaseRole } from '@/types';

export interface RolePromptStrategy {
  readonly role: CaseRole;
  readonly toneDirective: string;
  readonly emphasisDirective: string;
  readonly anomalyFraming: string;
  readonly extraSections: string;
  readonly conclusionGuidance: string;
}

/**
 * Common objective tone shared by ALL roles.
 * The AI does not express opinions — it organizes and presents documented facts.
 * The medical expert adds their own professional conclusions.
 */
const OBJECTIVE_TONE = `Adotta un tono RIGOROSAMENTE OGGETTIVO e FATTUALE. Il tuo compito è organizzare e presentare i fatti documentati, NON esprimere opinioni o giudizi.
Ogni affermazione deve essere ancorata a evidenza documentale [Ev.N]. NON formulare deduzioni, supposizioni o conclusioni personali.
Usa ESCLUSIVAMENTE formulazioni fattuali:
- "Dalla documentazione risulta che [fatto, Ev.N]..."
- "Il quadro documentale evidenzia..."
- "Come documentato in [Ev.N], si rileva..."
- "La documentazione in atti attesta..."
NON usare MAI formulazioni soggettive come: "si ritiene", "appare evidente", "è verosimile", "a parere dello scrivente", "risulta probabile".
Il report è un DOCUMENTO DI LAVORO per il medico legale, che formulerà autonomamente le proprie valutazioni professionali.`;

const OBJECTIVE_EMPHASIS = `Evidenzia TUTTI i fatti rilevanti dalla documentazione senza selezione tendenziosa.
Segnala sia le criticità nella gestione clinica sia gli elementi di corretta condotta, SEMPRE con riferimento documentale [Ev.N].
Per ogni anomalia, presenta anche eventuali elementi documentali che ne attenuano la rilevanza.
NON selezionare o enfatizzare i fatti a favore di una parte — riporta l'intero quadro documentale oggettivamente.`;

const OBJECTIVE_ANOMALY_FRAMING = `Per ogni profilo critico riscontrato dalla documentazione, struttura come:
**FATTO DOCUMENTATO**: descrizione oggettiva del rilievo con riferimento puntuale [Ev.N]
**STANDARD DI RIFERIMENTO**: quale linea guida o buona pratica clinica è applicabile [Fonte, Anno]
**ELEMENTI A SUPPORTO**: fatti documentati [Ev.N] che confermano la deviazione dallo standard
**ELEMENTI CONTRARI**: fatti documentati [Ev.N] che attenuano o contraddicono la deviazione
**CONSEGUENZE DOCUMENTATE**: impatto clinico risultante dalla documentazione [Ev.N]
Presentare ENTRAMBI i lati senza esprimere un giudizio conclusivo — il medico legale formulerà le proprie valutazioni.`;

const OBJECTIVE_CONCLUSION_GUIDANCE = `La sezione conclusiva deve essere una SINTESI FATTUALE, NON un'opinione.
Riepiloga: i fatti principali emersi dalla documentazione, i profili critici identificati con relativa evidenza documentale,
i periodi medico-legali calcolati (ITT/ITP) con date e criteri tabellari, e le lacune documentali riscontrate.
NON esprimere giudizi su responsabilità, nesso causale o merito — presentare gli elementi documentali
organizzati in modo che il medico legale possa formulare autonomamente le proprie conclusioni professionali.
Usa formule come: "Dalla documentazione in atti risultano i seguenti elementi rilevanti...",
"Il quadro documentale presenta le seguenti criticità...", "Si segnalano le seguenti lacune documentali..."`;

export const ROLE_STRATEGIES: Record<CaseRole, RolePromptStrategy> = {
  ctu: {
    role: 'ctu',
    toneDirective: `${OBJECTIVE_TONE}
Il report è destinato al Giudice tramite il CTU. Presenta i fatti in modo equilibrato, con evidenze per entrambe le parti.`,
    emphasisDirective: `${OBJECTIVE_EMPHASIS}
Per ogni fatto rilevante, evidenzia sia la prospettiva documentale del ricorrente sia quella del resistente, SENZA favorire nessuna delle due.`,
    anomalyFraming: OBJECTIVE_ANOMALY_FRAMING,
    extraSections: '',
    conclusionGuidance: `${OBJECTIVE_CONCLUSION_GUIDANCE}
Organizza gli elementi documentali per facilitare la risposta ai quesiti del Giudice.
Per ogni quesito, elenca i FATTI DOCUMENTALI pertinenti [Ev.N] — il CTU formulerà le risposte.`,
  },

  ctp: {
    role: 'ctp',
    toneDirective: `${OBJECTIVE_TONE}
Il report è destinato al CTP. Presenta TUTTI i fatti documentati in modo completo e oggettivo.`,
    emphasisDirective: `${OBJECTIVE_EMPHASIS}
Analizza con particolare attenzione (riportando oggettivamente dalla documentazione):
1. Ritardi diagnostici e terapeutici DOCUMENTATI (quantifica in giorni con date precise [Ev.N])
2. Deviazioni da linee guida e protocolli (cita quali linee guida [Fonte, Anno])
3. Omissioni documentali oggettivamente riscontrabili
4. Complicanze documentate e loro gestione
5. Difetti nel consenso informato se documentati`,
    anomalyFraming: OBJECTIVE_ANOMALY_FRAMING,
    extraSections: `Aggiungi una sezione "PROFILI CRITICI DOCUMENTATI" dopo gli Elementi di Rilievo:
elenca ogni specifico profilo di criticità DOCUMENTALMENTE RISCONTRATO,
con riferimento alla condotta specifica documentata [Ev.N] e alla linea guida/buona pratica applicabile [Fonte, Anno].
Riportare SOLO fatti verificabili — il CTP formulerà le proprie valutazioni.`,
    conclusionGuidance: `${OBJECTIVE_CONCLUSION_GUIDANCE}
Organizza gli elementi documentali evidenziando i profili critici con relativa evidenza.
Il CTP formulerà autonomamente le proprie valutazioni professionali.`,
  },

  stragiudiziale: {
    role: 'stragiudiziale',
    toneDirective: `${OBJECTIVE_TONE}
Il report è una valutazione stragiudiziale. Fornisci un'analisi COMPLETA e OGGETTIVA di tutti i fatti documentati.`,
    emphasisDirective: `${OBJECTIVE_EMPHASIS}
Per ogni aspetto, analizza dalla documentazione:
1. ELEMENTI FAVOREVOLI DOCUMENTATI [Ev.N]: fatti che supportano la pretesa
2. ELEMENTI SFAVOREVOLI O LACUNE [Ev.N]: fatti che indeboliscono la pretesa o lacune documentali
3. DOCUMENTAZIONE INTEGRATIVA: quale documentazione aggiuntiva sarebbe necessaria
4. COMPLETEZZA DOCUMENTALE: valutazione oggettiva della completezza della documentazione in atti`,
    anomalyFraming: OBJECTIVE_ANOMALY_FRAMING,
    extraSections: `Aggiungi una sezione "QUADRO DOCUMENTALE COMPLESSIVO" finale con:
- Sintesi degli elementi favorevoli e sfavorevoli risultanti dalla documentazione
- Valutazione della completezza della documentazione disponibile
- Documentazione integrativa da acquisire per completare l'analisi`,
    conclusionGuidance: `${OBJECTIVE_CONCLUSION_GUIDANCE}
Chiudi con una valutazione della completezza documentale e indicazione della documentazione integrativa necessaria.`,
  },
};

/**
 * Get prompt strategy for a specific role.
 */
export function getRoleStrategy(role: CaseRole): RolePromptStrategy {
  return ROLE_STRATEGIES[role];
}

/**
 * Format the complete role directive for prompt injection.
 */
export function formatRoleDirectiveForPrompt(role: CaseRole): string {
  const strategy = ROLE_STRATEGIES[role];
  return `## RUOLO E PROSPETTIVA

${strategy.toneDirective}

## CRITERI DI ENFASI

${strategy.emphasisDirective}

## COME PRESENTARE I PROFILI CRITICI

${strategy.anomalyFraming}

${strategy.extraSections ? `## SEZIONI AGGIUNTIVE RICHIESTE\n\n${strategy.extraSections}` : ''}

## LINEE GUIDA PER LA SEZIONE CONCLUSIVA

${strategy.conclusionGuidance}`;
}
