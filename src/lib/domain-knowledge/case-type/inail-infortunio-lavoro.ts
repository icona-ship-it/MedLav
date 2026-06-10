import type { CaseTypeKnowledge } from '../types';

export const INAIL_INFORTUNIO_KNOWLEDGE: CaseTypeKnowledge = {
  caseType: 'inail_infortunio',
  reportSections: [
    {
      id: 'riassunto',
      title: 'Riassunto del Caso',
      description: 'Sintesi dei fatti principali: dinamica dell\'infortunio sul lavoro, lesioni riportate, iter INAIL, esito della valutazione del danno biologico e motivi del ricorso.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 500, max: 1000 },
    },
    {
      id: 'cronologia',
      title: 'Cronologia Medico-Legale',
      description: 'Ricostruzione cronologica: data e ora dell\'infortunio, primo soccorso, iter diagnostico-terapeutico, certificati INAIL (iniziale, continuazione, definitivo), accertamenti medico-legali INAIL, stabilizzazione dei postumi.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 0, max: 0 },
    },
    {
      id: 'dinamica_infortunio',
      title: 'Dinamica dell\'Infortunio',
      description: 'Ricostruzione dettagliata della dinamica: mansione svolta al momento dell\'evento, circostanze specifiche (macchinari, attrezzature, condizioni ambientali), modalità dell\'infortunio, causa violenta, DPI in uso. Per infortunio in itinere: percorso, mezzo di trasporto, circostanze.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'quadro_clinico',
      title: 'Quadro Clinico e Postumi',
      description: 'Descrizione delle lesioni iniziali, dell\'iter terapeutico (conservativo, chirurgico, riabilitativo), dello stato attuale a stabilizzazione dei postumi. Accertamenti strumentali e funzionali. Eventuali complicanze.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'nesso_causale',
      title: 'Nesso Causale — Occasione di Lavoro',
      description: 'Analisi del rapporto tra l\'evento traumatico e l\'attività lavorativa: sussistenza della causa violenta, dell\'occasione di lavoro e del nesso con le lesioni. Per infortunio in itinere: verifica dei requisiti normativi (percorso normale, assenza deviazioni ingiustificate, mezzo necessitato).',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'danno_biologico',
      title: 'Valutazione del Danno Biologico',
      description: 'Quantificazione del danno biologico permanente secondo le tabelle INAIL (D.Lgs. 38/2000): percentuale di menomazione, periodi di inabilità temporanea assoluta (ITA) e relativa. Confronto con la valutazione INAIL impugnata. Eventuale danno differenziale rispetto al barème civilistico.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 300, max: 600 },
    },
    {
      id: 'responsabilita_datoriale',
      title: 'Profili di Responsabilità Datoriale',
      description: 'Valutazione del rispetto degli obblighi di sicurezza (D.Lgs. 81/2008): adeguatezza della valutazione dei rischi (DVR), formazione e informazione del lavoratore, fornitura e idoneità dei DPI, misure organizzative. Rilevanza per il danno differenziale e complementare.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 200, max: 500 },
    },
    {
      id: 'elementi_rilievo',
      title: 'Elementi di Rilievo Medico-Legale',
      description: 'Evidenziazione degli elementi significativi: congruità della percentuale INAIL, completezza della documentazione, eventuali preesistenze, capacità lavorativa residua, necessità di ulteriori accertamenti.',
      requiredForRoles: ['ctu', 'ctp', 'stragiudiziale'],
      wordRange: { min: 400, max: 800 },
    },
  ],
  standardTimelines: [
    {
      procedure: 'Denuncia infortunio — obbligo datore di lavoro',
      expectedFollowUpDays: 2,
      expectedRecoveryDays: 90,
      criticalDelayThresholdDays: 3,
      source: 'D.P.R. 1124/1965 art. 53 — Obbligo denuncia infortunio entro 2 giorni',
    },
    {
      procedure: 'Certificato medico iniziale INAIL',
      expectedFollowUpDays: 1,
      expectedRecoveryDays: 40,
      criticalDelayThresholdDays: 3,
      source: 'INAIL — Certificazione medica iniziale dell\'infortunio',
    },
    {
      procedure: 'Certificati di continuazione INAIL',
      expectedFollowUpDays: 7,
      expectedRecoveryDays: 90,
      criticalDelayThresholdDays: 15,
      source: 'INAIL — Certificazione medica di continuazione',
    },
    {
      procedure: 'Stabilizzazione postumi — valutazione danno biologico',
      expectedFollowUpDays: 180,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 730,
      source: 'INAIL — Valutazione postumi permanenti da infortunio',
    },
    {
      procedure: 'Revisione per aggravamento',
      expectedFollowUpDays: 365,
      expectedRecoveryDays: 365,
      criticalDelayThresholdDays: 3650,
      source: 'D.P.R. 1124/1965 art. 137 — Revisione entro 10 anni dalla data dell\'infortunio',
    },
    {
      procedure: 'Prescrizione diritto — indennizzo INAIL',
      expectedFollowUpDays: 1095,
      expectedRecoveryDays: 1095,
      criticalDelayThresholdDays: 1095,
      source: 'D.P.R. 1124/1965 art. 112 — Prescrizione triennale',
    },
  ],
  commonAnomalyPatterns: [
    'Ritardo nella denuncia dell\'infortunio oltre i 2 giorni previsti dalla legge',
    'Assenza del certificato medico iniziale INAIL o certificati di continuazione incompleti',
    'Mancata documentazione della dinamica dell\'infortunio (relazione datore, testimoni)',
    'Discrepanza tra la dinamica dichiarata e le lesioni documentate',
    'Assenza di documentazione sulla valutazione dei rischi (DVR) e sui DPI forniti',
    'Gap documentale tra il primo soccorso e gli accertamenti INAIL successivi',
    'Per infortunio in itinere: mancata documentazione del percorso e delle circostanze',
    'Mancata distinzione tra postumi dell\'infortunio e patologie preesistenti',
    'Percentuale di danno biologico INAIL non coerente con i postumi documentati',
    'Assenza di documentazione sulla formazione del lavoratore in materia di sicurezza',
  ],
  evaluationFrameworks: [
    'Tabelle INAIL per l\'indennizzo del danno biologico (D.Lgs. 38/2000)',
    'D.P.R. 1124/1965 — Testo unico infortuni sul lavoro',
    'D.Lgs. 38/2000 — Riforma indennizzo INAIL (danno biologico)',
    'D.Lgs. 81/2008 — Testo unico sicurezza sul lavoro',
    'Bareme SIMLA — per danno differenziale civilistico',
    'Art. 2087 c.c. — Obbligo di sicurezza del datore di lavoro',
    'Invalidità Temporanea (ITT/ITP)',
  ],
  keyTerminology: [
    { term: 'Infortunio sul lavoro', definition: 'Evento traumatico avvenuto per causa violenta in occasione di lavoro, da cui derivi la morte, l\'inabilità permanente o l\'inabilità temporanea assoluta per più di 3 giorni (art. 2 D.P.R. 1124/1965). Requisiti: causa violenta, occasione di lavoro, lesione.' },
    { term: 'Causa violenta', definition: 'Fattore esterno, rapido e intenso, che agisce sull\'organismo del lavoratore provocando una lesione. Comprende: trauma meccanico, agente chimico/fisico concentrato nel tempo, sforzo muscolare abnorme. Si distingue dalla causa lenta tipica della malattia professionale.' },
    { term: 'Occasione di lavoro', definition: 'Nesso tra l\'evento lesivo e l\'attività lavorativa, inteso come esposizione a un rischio specifico o generico aggravato dall\'attività stessa. Non richiede che il lavoro sia la causa diretta, ma che abbia creato le condizioni dell\'esposizione al rischio.' },
    { term: 'Infortunio in itinere', definition: 'Infortunio occorso durante il percorso di andata e ritorno dal lavoro (art. 12 D.Lgs. 38/2000). Tutelato se: percorso normale, assenza deviazioni non necessitate, interruzioni non dovute a esigenze essenziali. Con mezzo privato: tutelato solo se necessitato.' },
    { term: 'Danno biologico INAIL', definition: 'Menomazione dell\'integrità psicofisica valutata secondo le tabelle D.Lgs. 38/2000. Indennizzo: 6-15% in capitale (una tantum), ≥16% in rendita. Per menomazioni 1-5% nessun indennizzo. Le tabelle INAIL hanno valori generalmente inferiori al barème civilistico SIMLA.' },
    { term: 'Danno differenziale e complementare', definition: 'Differenziale: differenza tra danno biologico civilistico (SIMLA) e indennizzo INAIL (D.Lgs. 38/2000). Complementare: voci di danno non coperte dall\'INAIL (danno morale, esistenziale, personalizzazione). Presuppongono la responsabilità del datore ex art. 2087 c.c.' },
    { term: 'Inabilità temporanea assoluta (ITA)', definition: 'Periodo durante il quale l\'infortunato è totalmente impossibilitato a svolgere l\'attività lavorativa. Indennizzata dall\'INAIL: 60% della retribuzione media dal 4° al 90° giorno, 75% dal 91° giorno. I primi 3 giorni (periodo di carenza) sono a carico del datore.' },
    { term: 'D.Lgs. 81/2008 (TU Sicurezza)', definition: 'Testo Unico sulla salute e sicurezza nei luoghi di lavoro. Obblighi del datore: valutazione dei rischi (DVR), nomina RSPP e medico competente, formazione e informazione, fornitura DPI, sorveglianza sanitaria. La violazione fonda la responsabilità civile (art. 2087 c.c.) e penale.' },
  ],
  synthesisGuidance: `Nell'analisi dell'infortunio sul lavoro in ambito INAIL, verificare in primo luogo
la sussistenza dei tre requisiti: causa violenta, occasione di lavoro, lesione.
Per l'infortunio in itinere, verificare i requisiti specifici: percorso normale, assenza
di deviazioni non necessitate, mezzo privato solo se necessitato.
Ricostruire dettagliatamente la dinamica dell'infortunio sulla base della documentazione
disponibile (denuncia, relazione del datore, verbali di PS, certificato INAIL iniziale),
evidenziando eventuali discrepanze tra le versioni.
Per il danno biologico, utilizzare le tabelle INAIL (D.Lgs. 38/2000) specificando la voce
tabellare e la percentuale attribuita. Confrontare con la valutazione INAIL impugnata
motivando ogni divergenza. Per il danno differenziale, applicare il barème SIMLA
e calcolare la differenza con l'indennizzo INAIL.
Valutare i profili di responsabilità datoriale con riferimento al D.Lgs. 81/2008:
adeguatezza del DVR, formazione e informazione del lavoratore, fornitura e idoneità
dei DPI, organizzazione del lavoro. Questo è rilevante per il diritto al risarcimento
del danno differenziale e complementare.
Considerare le preesistenze e il loro impatto sulla valutazione: in ambito INAIL,
i postumi si valutano complessivamente (non solo l'aggravamento), ma le preesistenze
rilevano per il calcolo della rendita.
Documentare con precisione i periodi di inabilità temporanea assoluta (ITA)
sulla base dei certificati INAIL di continuazione.`,
} as const;
