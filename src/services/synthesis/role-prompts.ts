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

Ogni affermazione deve essere ancorata alla fonte (tipo documento + data) UNA VOLTA SOLA, alla prima menzione. NON ripetere wrapper di ancoraggio in ogni frase: dopo aver citato un documento, riferisciti al fatto in modo compatto.

Esempio (prima menzione): "Dalla cartella clinica del P.O. di [struttura], in data DD.MM.YYYY, risulta una frattura composta del piatto tibiale destro." Successive frasi sullo stesso ricovero possono dire semplicemente "Il decorso post-operatorio è stato caratterizzato da [...]" senza ripetere "come risulta dalla cartella clinica".

NON usare MAI formulazioni soggettive: "si ritiene", "appare evidente", "è verosimile", "a parere dello scrivente", "risulta probabile", "è ragionevole concludere", "si può presumere".

NEUTRALITÀ DEL PERIZIANDO (regola anti-bias): non assumere mai caratteristiche cliniche, sociali o demografiche dal nome, genere, etnia o età biologica del paziente. Tutti i dati relativi al periziando — incluse anamnesi, condizioni cliniche, fattori di rischio, attività lavorativa e ricreativa — devono provenire ESCLUSIVAMENTE dai documenti forniti. Mai dedurre tratti clinici da segnali identitari (es. non assumere fragilità per nome femminile, non assumere abitudini per cognome straniero).

Il report è un DOCUMENTO DI LAVORO per il medico legale, che formulerà autonomamente le proprie valutazioni professionali.`;

const OBJECTIVE_EMPHASIS = `Evidenzia TUTTI i fatti rilevanti dalla documentazione senza selezione tendenziosa.
Segnala sia le criticità nella gestione clinica sia gli elementi di corretta condotta, SEMPRE con riferimento documentale [documento, data].
Per ogni anomalia, presenta anche eventuali elementi documentali che ne attenuano la rilevanza.
NON selezionare o enfatizzare i fatti a favore di una parte — riporta l'intero quadro documentale oggettivamente.`;

const OBJECTIVE_ANOMALY_FRAMING = `Quando — e SOLO quando — devi presentare un profilo critico richiesto dalla sezione "Considerazioni Medico-Legali" o "Anomalie", struttura come:
**FATTO DOCUMENTATO**: descrizione oggettiva del rilievo con riferimento puntuale [documento, data]
**STANDARD DI RIFERIMENTO**: quale linea guida o buona pratica clinica è applicabile [Fonte, Anno]
**ELEMENTI A SUPPORTO**: fatti documentati [documento, data] che confermano la deviazione dallo standard
**ELEMENTI CONTRARI**: fatti documentati [documento, data] che attenuano o contraddicono la deviazione
**CONSEGUENZE DOCUMENTATE**: impatto clinico risultante dalla documentazione [documento, data]
Presentare ENTRAMBI i lati senza esprimere un giudizio conclusivo — il medico legale formulerà le proprie valutazioni.

VINCOLO DI POSIZIONAMENTO: questo pattern è AMMESSO ESCLUSIVAMENTE nelle sezioni dedicate alle anomalie / considerazioni medico-legali. È VIETATO usarlo nella sezione "Documentazione Sanitaria" o nell'Intestazione, che devono restare puramente fattuali.`;

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
Per ogni quesito, elenca i FATTI DOCUMENTALI pertinenti [documento, data] — il CTU formulerà le risposte.`,
  },

  ctp: {
    role: 'ctp',
    toneDirective: `${OBJECTIVE_TONE}
Il report è destinato al CTP. Presenta TUTTI i fatti documentati in modo completo e oggettivo, senza selezionare a favore o contro.`,
    emphasisDirective: `${OBJECTIVE_EMPHASIS}
Per ogni fatto rilevante, evidenzia sia gli elementi che supportano la pretesa sia quelli che la indeboliscono, SENZA favorire nessuna delle due posizioni.`,
    anomalyFraming: OBJECTIVE_ANOMALY_FRAMING,
    extraSections: '',
    conclusionGuidance: `${OBJECTIVE_CONCLUSION_GUIDANCE}
Il CTP formulerà autonomamente le proprie valutazioni professionali sulla base degli elementi documentali presentati.`,
  },

  stragiudiziale: {
    role: 'stragiudiziale',
    toneDirective: `${OBJECTIVE_TONE}
Il report è una valutazione stragiudiziale. La cronologia documentale deve essere puramente fattuale. Le valutazioni e i giudizi spettano al perito nelle sezioni dedicate (Epicrisi e considerazioni).`,
    emphasisDirective: `${OBJECTIVE_EMPHASIS}
La presentazione di elementi favorevoli/sfavorevoli o lacune documentali è LIMITATA alla sezione "Anomalie Rilevate" e alle sezioni di considerazioni dedicate. NON disseminare valutazioni "favorevole/sfavorevole" o "lacuna" nella documentazione sanitaria — quella deve essere riproduzione documentale fedele e neutra.`,
    anomalyFraming: OBJECTIVE_ANOMALY_FRAMING,
    // No extra sections: the dedicated "Anomalie" output section already handles
    // critical-profile listing. Adding a "QUADRO DOCUMENTALE COMPLESSIVO"
    // duplicated content into the chronology and biased the narrative.
    extraSections: '',
    conclusionGuidance: `${OBJECTIVE_CONCLUSION_GUIDANCE}
La valutazione di completezza documentale e l'eventuale richiesta di documentazione integrativa devono comparire SOLO nelle sezioni dedicate (Epicrisi finale o sezione "Documentazione Mancante"), MAI nella cronologia clinica.`,
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
