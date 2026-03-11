/**
 * Static demo case data for onboarding.
 * All data is synthetic — no real patient data.
 */

export const DEMO_CASE = {
  code: 'DEMO-001',
  caseType: 'ortopedica' as const,
  caseRole: 'ctu' as const,
  patientInitials: 'M.R.',
  practiceReference: 'RG 12345/2025 - Tribunale di Milano',
  notes: 'Caso dimostrativo per esplorare le funzionalità di MedLav.',
  periziaMetadata: {
    tribunale: 'Tribunale Ordinario di Milano',
    sezione: 'Sezione III Civile',
    rgNumber: '12345/2025',
    judgeName: 'Dott. Marco Bianchi',
    ctuName: 'Dott. Luigi Verdi',
    ctuTitle: 'Specialista in Medicina Legale e delle Assicurazioni',
    ctpRicorrente: 'Dott.ssa Anna Rossi',
    ctpResistente: 'Dott. Paolo Neri',
    parteRicorrente: 'Mario Rossi',
    parteResistente: 'ASST Grande Ospedale Metropolitano',
    dataIncarico: '2025-01-15',
    dataOperazioni: '2025-02-10',
    dataDeposito: '2025-05-15',
    quesiti: [
      'Accerti il CTU la natura e l\'entità delle lesioni riportate dal periziando.',
      'Dica il CTU se sussiste nesso causale tra l\'intervento chirurgico e le complicanze lamentate.',
      'Quantifichi il CTU il danno biologico permanente e temporaneo.',
    ],
    esameObiettivo: 'All\'esame obiettivo il periziando presenta limitazione funzionale dell\'arto inferiore destro con riduzione della flesso-estensione del ginocchio (0-90° vs 0-130° controlaterale). Cicatrice chirurgica normoconformata in sede mediale. Ipotrofia del quadricipite destro. Deambulazione con lieve zoppia di fuga.',
  },
};

export const DEMO_EVENTS = [
  {
    orderNumber: 1,
    eventDate: '2024-06-15',
    datePrecision: 'giorno' as const,
    eventType: 'visita' as const,
    title: 'Prima visita ortopedica',
    description: 'Il paziente si presenta lamentando gonalgia destra persistente da circa 3 mesi, con limitazione funzionale progressiva. Viene prescritta RMN ginocchio destro.',
    sourceType: 'cartella_clinica' as const,
    diagnosis: 'Gonalgia destra da indagare',
    doctor: 'Dott. F. Colombo',
    facility: 'Ospedale San Raffaele - Milano',
    confidence: 0.95,
    requiresVerification: false,
  },
  {
    orderNumber: 2,
    eventDate: '2024-06-28',
    datePrecision: 'giorno' as const,
    eventType: 'esame' as const,
    title: 'RMN ginocchio destro',
    description: 'RMN evidenzia lesione del menisco mediale (tipo III sec. Stoller) con associata condropatia femoro-rotulea di grado II-III. Lieve versamento articolare.',
    sourceType: 'esame_strumentale' as const,
    diagnosis: 'Lesione menisco mediale tipo III + condropatia femoro-rotulea II-III',
    doctor: 'Dott. G. Ferrari',
    facility: 'Centro Diagnostico Italiano',
    confidence: 0.98,
    requiresVerification: false,
  },
  {
    orderNumber: 3,
    eventDate: '2024-07-10',
    datePrecision: 'giorno' as const,
    eventType: 'visita' as const,
    title: 'Visita ortopedica pre-operatoria',
    description: 'Confermata indicazione chirurgica per meniscectomia selettiva artroscopica. Paziente informato su rischi e benefici. Programmato intervento.',
    sourceType: 'cartella_clinica' as const,
    diagnosis: 'Lesione meniscale mediale — indicazione chirurgica',
    doctor: 'Dott. F. Colombo',
    facility: 'Ospedale San Raffaele - Milano',
    confidence: 0.92,
    requiresVerification: false,
  },
  {
    orderNumber: 4,
    eventDate: '2024-07-10',
    datePrecision: 'giorno' as const,
    eventType: 'consenso' as const,
    title: 'Consenso informato intervento',
    description: 'Firmato consenso informato per artroscopia ginocchio destro. Illustrati rischi: infezione, rigidità, trombosi, lesioni neurovascolari.',
    sourceType: 'cartella_clinica' as const,
    confidence: 0.90,
    requiresVerification: false,
  },
  {
    orderNumber: 5,
    eventDate: '2024-07-22',
    datePrecision: 'giorno' as const,
    eventType: 'ricovero' as const,
    title: 'Ricovero per intervento chirurgico',
    description: 'Ricovero in day surgery per meniscectomia selettiva artroscopica ginocchio destro.',
    sourceType: 'cartella_clinica' as const,
    facility: 'Ospedale San Raffaele - Milano',
    confidence: 0.97,
    requiresVerification: false,
  },
  {
    orderNumber: 6,
    eventDate: '2024-07-22',
    datePrecision: 'giorno' as const,
    eventType: 'intervento' as const,
    title: 'Meniscectomia selettiva artroscopica',
    description: 'Eseguita meniscectomia selettiva del corno posteriore del menisco mediale per via artroscopica. Riscontro intraoperatorio di condropatia di grado III del condilo femorale mediale. Eseguito shaving cartilagineo. Tempo operatorio: 45 minuti. Nessuna complicanza intraoperatoria.',
    sourceType: 'cartella_clinica' as const,
    diagnosis: 'Lesione menisco mediale + condropatia grado III condilo femorale mediale',
    doctor: 'Dott. F. Colombo',
    facility: 'Ospedale San Raffaele - Milano',
    confidence: 0.98,
    requiresVerification: false,
  },
  {
    orderNumber: 7,
    eventDate: '2024-08-05',
    datePrecision: 'giorno' as const,
    eventType: 'follow-up' as const,
    title: 'Controllo post-operatorio 2 settimane',
    description: 'Ferita chirurgica in buona evoluzione cicatriziale. Persistente tumefazione articolare. Prescritta fisioterapia riabilitativa (20 sedute).',
    sourceType: 'referto_controllo' as const,
    doctor: 'Dott. F. Colombo',
    facility: 'Ospedale San Raffaele - Milano',
    confidence: 0.93,
    requiresVerification: false,
  },
  {
    orderNumber: 8,
    eventDate: '2024-09-15',
    datePrecision: 'giorno' as const,
    eventType: 'complicanza' as const,
    title: 'Rigidità articolare persistente',
    description: 'Al controllo a 2 mesi dall\'intervento il paziente presenta rigidità articolare con ROM limitato (0-90°). Ipotrofia quadricipitale. Disposta intensificazione trattamento riabilitativo con aggiunta di mobilizzazione passiva.',
    sourceType: 'referto_controllo' as const,
    diagnosis: 'Rigidità articolare post-chirurgica ginocchio destro',
    doctor: 'Dott. F. Colombo',
    facility: 'Ospedale San Raffaele - Milano',
    confidence: 0.95,
    requiresVerification: true,
    reliabilityNotes: 'La rigidità potrebbe essere correlata alla condropatia preesistente',
  },
  {
    orderNumber: 9,
    eventDate: '2024-11-10',
    datePrecision: 'giorno' as const,
    eventType: 'esame' as const,
    title: 'RMN ginocchio destro di controllo',
    description: 'RMN di controllo: esiti di meniscectomia mediale. Condropatia femoro-tibiale mediale di grado III invariata. Modesta sinovite reattiva. Assenza di complicanze infettive.',
    sourceType: 'esame_strumentale' as const,
    diagnosis: 'Esiti meniscectomia + condropatia III grado persistente',
    doctor: 'Dott. G. Ferrari',
    facility: 'Centro Diagnostico Italiano',
    confidence: 0.97,
    requiresVerification: false,
  },
  {
    orderNumber: 10,
    eventDate: '2024-12-20',
    datePrecision: 'giorno' as const,
    eventType: 'follow-up' as const,
    title: 'Controllo ortopedico finale',
    description: 'Paziente ha completato ciclo riabilitativo (30 sedute). Permane limitazione funzionale residua con ROM 0-100°. Ipotrofia quadricipitale migliorata ma persistente. Si ritiene raggiunta la stabilizzazione dei postumi.',
    sourceType: 'referto_controllo' as const,
    diagnosis: 'Esiti stabilizzati di meniscectomia con limitazione funzionale residua',
    doctor: 'Dott. F. Colombo',
    facility: 'Ospedale San Raffaele - Milano',
    confidence: 0.94,
    requiresVerification: false,
  },
  {
    orderNumber: 11,
    eventDate: '2025-01-10',
    datePrecision: 'giorno' as const,
    eventType: 'esame' as const,
    title: 'Esami ematochimici pre-peritali',
    description: 'Emocromo, VES, PCR nella norma. Indici infiammatori negativi.',
    sourceType: 'esame_ematochimico' as const,
    confidence: 0.90,
    requiresVerification: false,
  },
  {
    orderNumber: 12,
    eventDate: '2025-02-10',
    datePrecision: 'giorno' as const,
    eventType: 'visita' as const,
    title: 'Visita medico-legale (operazioni peritali)',
    description: 'Eseguito esame obiettivo del periziando in sede di operazioni peritali alla presenza dei CTP di parte. Documentata limitazione funzionale residua e ipotrofia muscolare.',
    sourceType: 'cartella_clinica' as const,
    doctor: 'Dott. L. Verdi (CTU)',
    confidence: 0.99,
    requiresVerification: false,
  },
];

export const DEMO_ANOMALIES = [
  {
    anomalyType: 'gap_post_chirurgico',
    severity: 'media' as const,
    description: 'Gap documentale di 40 giorni tra il controllo post-operatorio del 05.08.2024 e il successivo controllo del 15.09.2024. Non risulta documentazione relativa al trattamento fisioterapico intermedio.',
    involvedEvents: '7,8',
    suggestion: 'Richiedere la documentazione del ciclo fisioterapico eseguito nel periodo agosto-settembre 2024.',
  },
  {
    anomalyType: 'consenso_non_documentato',
    severity: 'bassa' as const,
    description: 'Il consenso informato risulta firmato nello stesso giorno della visita pre-operatoria (10.07.2024) e non menziona specificamente il rischio di rigidità articolare post-chirurgica, che si è poi verificata.',
    involvedEvents: '3,4',
    suggestion: 'Verificare se esistono moduli di consenso più dettagliati negli archivi della struttura.',
  },
];

export const DEMO_MISSING_DOCS = [
  {
    documentName: 'Cartella fisioterapica',
    reason: 'Non presente documentazione del ciclo riabilitativo (20+10 sedute) eseguito tra agosto e novembre 2024.',
    relatedEvent: 'Controllo post-operatorio 2 settimane',
  },
  {
    documentName: 'Verbale di dimissione day surgery',
    reason: 'Manca il verbale di dimissione con le istruzioni post-operatorie fornite al paziente.',
    relatedEvent: 'Ricovero per intervento chirurgico',
  },
  {
    documentName: '[CHECKLIST] Scala VAS dolore pre/post',
    reason: 'Non presente valutazione standardizzata del dolore prima e dopo l\'intervento.',
  },
];

export const DEMO_SYNTHESIS = `## Riassunto del Caso

Il presente caso riguarda il sig. M.R. che è stato sottoposto in data 22.07.2024 ad intervento di meniscectomia selettiva artroscopica del ginocchio destro presso l'Ospedale San Raffaele di Milano, ad opera del Dott. F. Colombo. L'intervento, eseguito per lesione del menisco mediale tipo III sec. Stoller con associata condropatia femoro-rotulea di grado II-III, ha evidenziato in sede intraoperatoria una condropatia di grado III del condilo femorale mediale, trattata con shaving cartilagineo.

Il decorso post-operatorio è stato caratterizzato da rigidità articolare persistente con limitazione funzionale significativa, che ha richiesto un ciclo riabilitativo intensivo. A distanza di 5 mesi dall'intervento, il paziente presenta esiti stabilizzati con limitazione funzionale residua.

## Cronologia Medico-Legale

La cronologia degli eventi si articola in 12 eventi documentati nel periodo giugno 2024 - febbraio 2025:

1. **15.06.2024** - Prima visita ortopedica con diagnosi di gonalgia destra
2. **28.06.2024** - RMN: lesione menisco mediale tipo III + condropatia II-III
3. **10.07.2024** - Visita pre-operatoria e consenso informato
4. **22.07.2024** - Meniscectomia selettiva artroscopica + shaving cartilagineo
5. **05.08.2024** - Controllo post-operatorio: buona evoluzione, prescritta FKT
6. **15.09.2024** - Riscontro rigidità articolare (ROM 0-90°), intensificata riabilitazione
7. **10.11.2024** - RMN controllo: esiti stabili, condropatia invariata
8. **20.12.2024** - Controllo finale: stabilizzazione postumi, ROM 0-100°
9. **10.02.2025** - Visita medico-legale (operazioni peritali)

## Analisi dell'Intervento Chirurgico

L'indicazione chirurgica alla meniscectomia selettiva artroscopica appare appropriata sulla base del quadro clinico-strumentale documentato. La lesione meniscale tipo III sec. Stoller, non responsiva al trattamento conservativo per 3 mesi, rappresentava una corretta indicazione all'approccio artroscopico.

Il riscontro intraoperatorio di condropatia di grado III del condilo femorale mediale, più severa rispetto al grado II-III documentato alla RMN pre-operatoria, ha comportato l'esecuzione di shaving cartilagineo associato. Tale procedura accessoria rientra nella normale pratica chirurgica artroscopica.

Il tempo operatorio (45 minuti) e l'assenza di complicanze intraoperatorie documentano un intervento eseguito senza particolari difficoltà tecniche.

## Complicanze

La rigidità articolare post-chirurgica documentata al controllo del 15.09.2024 (ROM 0-90°) rappresenta una complicanza nota della chirurgia artroscopica del ginocchio, con incidenza riportata in letteratura tra il 5% e il 15% dei casi.

Si rileva tuttavia che la condropatia preesistente di grado elevato (III grado confermato in sede intraoperatoria) rappresenta un fattore predisponente alla rigidità post-operatoria, come documentato dalla letteratura scientifica.

## Nesso Causale

A parere di questo CTU, il nesso causale tra l'intervento chirurgico e la rigidità articolare residua deve essere valutato considerando la multifattorialità della condizione:

1. **Fattore concausale preesistente**: condropatia di grado III documentata, che di per sé determina progressiva limitazione funzionale
2. **Fattore iatrogeno**: la procedura chirurgica, pur correttamente eseguita, ha determinato una risposta infiammatoria articolare con conseguente rigidità
3. **Fattore riabilitativo**: il gap documentale nel periodo agosto-settembre 2024 non consente di escludere ritardi nell'avvio della riabilitazione

In termini di probabilità medico-legale, si ritiene che l'esito finale sia il risultato della convergenza dei tre fattori sopra indicati, con prevalenza del fattore concausale preesistente (condropatia III grado).

## Danno Biologico

Sulla base dell'esame obiettivo eseguito in sede di operazioni peritali (10.02.2025) e della documentazione in atti, si quantifica:

**Invalidità temporanea:**
- ITT (Invalidità Temporanea Totale): 3 giorni (ricovero e post-operatorio immediato)
- ITP 75%: 14 giorni (prima fase post-chirurgica)
- ITP 50%: 30 giorni (fase riabilitativa intensiva)
- ITP 25%: 60 giorni (fase riabilitativa residua)

**Invalidità permanente:**
Si stima un danno biologico permanente nella misura del **8-10%**, comprensivo della limitazione funzionale residua del ginocchio destro (ROM 0-100° vs 0-130° controlaterale) e dell'ipotrofia muscolare del quadricipite.

## Profili di Responsabilità

A parere di questo CTU, non si ravvisano profili di responsabilità professionale a carico dell'equipe chirurgica. L'indicazione chirurgica era corretta, la tecnica operatoria adeguata e il follow-up conforme alle linee guida.

La rigidità articolare residua è da ritenersi complicanza nota e non evitabile, aggravata dalla condropatia preesistente di grado elevato.

Si segnala come unico elemento di criticità il gap documentale nel percorso riabilitativo, che tuttavia non configura di per sé una responsabilità chirurgica.

## Valutazione di Merito

In conclusione, a parere di questo CTU:

1. L'intervento di meniscectomia selettiva artroscopica è stato eseguito secondo la buona pratica clinica
2. La rigidità articolare residua rappresenta una complicanza nota, favorita dalla condropatia preesistente
3. Non si configurano profili di responsabilità professionale
4. Il danno biologico permanente è stimato in 8-10%
5. Si raccomanda l'acquisizione della documentazione fisioterapica per completare il quadro valutativo
`;
