/**
 * Facsimile dell'esame obiettivo per la sezione "La Visita Clinica" (feedback
 * beta 2026-07-20: "sarebbe carino mettere nella sezione esame obiettivo un
 * facsimile modificabile"). Traccia GENERICA con slot [tra parentesi]: nessun
 * dato clinico o anagrafico reale (GDPR — il perito compila durante la visita).
 *
 * Due varianti dello stesso contenuto:
 * - ESAME_OBIETTIVO_FACSIMILE: testo piano per la textarea del form perizia
 *   ("Inserisci facsimile");
 * - VISITA_CLINICA_PLACEHOLDER: variante corsivo-placeholder per la sezione del
 *   report (ogni riga in *...*, apre con *[ così isPlaceholderBlockStart la
 *   marca "da compilare" nell'indice).
 */

// ATTENZIONE (review 2026-07-21): nella variante placeholder queste righe vivono
// DENTRO un blocco `*[ ... ]*`. La grammatica dei parser di export
// (markdown-to-html / docx-export) chiude il blocco alla prima riga che termina
// con `]` e ne riapre uno sulle righe che iniziano con `*[` — quindi qui NIENTE
// parentesi quadre: gli slot usano "…" e parentesi tonde.
const FACSIMILE_LINES = [
  'SOGGETTIVAMENTE — Il/La periziando/a riferisce:',
  'persistenza di sintomatologia algico-funzionale a carico di …, con limitazione nelle attività della vita quotidiana: deambulazione protratta / salita e discesa delle scale / accovacciamento / stazione eretta prolungata / …',
  '',
  'OBIETTIVAMENTE — All\'esame obiettivo:',
  'Vigile, orientato/a nei tre assi, collaborante. Destrimane/Mancino.',
  'Peso … kg; altezza … cm.',
  'Non apparenti deficit degli organi di senso.',
  'Si tralascia l\'obiettività di organi ed apparati non interessati dagli eventi lesivi in oggetto.',
  '',
  'Distretto interessato (es. caviglia destra):',
  '- Ispezione: cute, cicatrici (sede, dimensioni, qualità), tumefazione, deformità …',
  '- Perimetria comparata: eccedenza/riduzione di … cm a livello …',
  '- Palpazione: dolorabilità evocata su …',
  '- Articolarità (ROM) attiva e passiva: conservata / limitata di …° in flesso-estensione / prono-supinazione',
  '- Test specifici (es. cassetto anteriore, Thompson, Lasègue): negativi/positivi',
  '- Deambulazione: schema del passo; cammino sulle punte e sui talloni; appoggio monopodalico',
  '- Accovacciamento: concesso / cautelato / non concesso',
  '',
  'Esame obiettivo neurologico: nella norma per quanto apprezzabile in questa sede / …',
];

/** Testo piano per la textarea "Esame obiettivo" del form perizia. */
export const ESAME_OBIETTIVO_FACSIMILE = FACSIMILE_LINES.join('\n');

/**
 * Variante placeholder per la sezione del report: righe in corsivo, apertura
 * `*[` (riconosciuta come blocco-placeholder da isPlaceholderBlockStart) e
 * chiusura `]*`. La sezione resta marcata "da compilare" finché il perito non
 * la sostituisce (o compila il campo Esame obiettivo del form, iniettato a
 * export-time dal report-assembler).
 */
export const VISITA_CLINICA_PLACEHOLDER = [
  '*[Da compilare durante la visita — traccia:*',
  ...FACSIMILE_LINES.map((line) => (line === '' ? '' : `*${line}*`)),
  '*]*',
].join('\n');
