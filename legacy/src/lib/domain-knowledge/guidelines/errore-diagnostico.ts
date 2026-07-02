import type { GuidelineContent } from './types';

export const ERRORE_DIAGNOSTICO_GUIDELINES: GuidelineContent = {
  title: 'Raccomandazioni per la Riduzione degli Errori Diagnostici',
  source: 'Ministero della Salute / SIBioC / Raccomandazioni Ministeriali per la Sicurezza',
  year: 2023,
  caseTypes: ['errore_diagnostico'],
  content: `## 1. TEMPO MASSIMO DI REFERTAZIONE DEGLI ESAMI URGENTI

1.1. Gli esami diagnostici richiesti con carattere di urgenza devono essere refertati entro tempistiche definite, la cui violazione configura un ritardo potenzialmente lesivo per il paziente.

1.2. Tempistiche massime di refertazione per categoria:
- Esami di laboratorio urgenti (emocromo, elettroliti, glicemia, troponina, D-dimero, emogasanalisi): risultato disponibile entro 60 minuti dal prelievo
- Esami di laboratorio con valori critici: comunicazione immediata (entro 15 minuti dal riscontro) al medico richiedente
- Radiografia del torace urgente: refertazione entro 1 ora
- TC cranio senza mezzo di contrasto (sospetto ictus, trauma cranico): refertazione entro 30 minuti
- TC con mezzo di contrasto urgente: refertazione entro 2 ore
- Ecografia urgente (sospetto addome acuto, colecistite, aneurisma): refertazione entro 1 ora
- RMN urgente (sospetto compressione midollare, ictus in finestra trombolisi): refertazione entro 1 ora
- Esame istologico: refertazione standard entro 10-15 giorni lavorativi; esame estemporaneo intraoperatorio entro 20 minuti

1.3. La struttura sanitaria deve disporre di procedure documentate per la tracciabilita dei tempi di refertazione e per la gestione dei ritardi. La mancata refertazione nei tempi previsti deve essere segnalata come near-miss.

## 2. COMUNICAZIONE DEI VALORI CRITICI (RACCOMANDAZIONI SIBioC)

2.1. I valori critici (o valori di panico) sono risultati di laboratorio che indicano una condizione potenzialmente pericolosa per la vita del paziente e che richiedono un intervento terapeutico immediato.

2.2. Elenco dei principali valori critici (soglie indicative SIBioC):
- Potassio: < 2.8 mmol/L o > 6.2 mmol/L
- Sodio: < 120 mmol/L o > 160 mmol/L
- Calcio ionizzato: < 0.75 mmol/L o > 1.6 mmol/L
- Glicemia: < 40 mg/dL o > 500 mg/dL
- Emoglobina: < 7 g/dL
- Piastrine: < 20.000/mcL o > 1.000.000/mcL
- INR: > 5.0 (in paziente in terapia anticoagulante)
- Troponina: > 99esimo percentile del limite superiore di riferimento
- Lattato: > 4 mmol/L
- pH arterioso: < 7.20 o > 7.60
- pO2 arterioso: < 40 mmHg
- Fibrinogeno: < 100 mg/dL

2.3. Procedura di comunicazione obbligatoria:
- Il laboratorio deve comunicare il valore critico direttamente al medico responsabile del paziente (o al medico di guardia) per via telefonica, entro 15 minuti dal riscontro
- Il medico ricevente deve ripetere verbalmente il valore (read-back) per conferma
- Devono essere documentati: data, ora della comunicazione, valore comunicato, nome del medico ricevente, eventuale azione clinica concordata
- In caso di impossibilita di raggiungere il medico responsabile, deve essere attivata una procedura di escalation definita

2.4. La mancata o ritardata comunicazione di un valore critico e un evento sentinella ai sensi della Raccomandazione Ministeriale n. 11. Ogni mancata comunicazione deve essere oggetto di incident reporting e analisi delle cause.

## 3. HANDOFF CLINICO STRUTTURATO

3.1. Il passaggio di consegne (handoff) e un momento critico per la sicurezza del paziente. Si stima che il 60-80% degli eventi avversi in sanita sia riconducibile a errori di comunicazione, e il passaggio di consegne ne rappresenta il momento piu vulnerabile.

3.2. Metodo I-PASS (raccomandato per il passaggio di consegne tra turni):
- I — Illness severity: stabilita del paziente (stabile, "watcher" da sorvegliare attentamente, instabile)
- P — Patient summary: diagnosi di ammissione, anamnesi rilevante, trattamento in corso
- A — Action list: azioni pendenti, esami da controllare, terapie da somministrare
- S — Situation awareness and contingency planning: "se succede X, fare Y"
- S — Synthesis by receiver: il ricevente riassume le informazioni ricevute per conferma

3.3. Metodo SBAR (raccomandato per la comunicazione tra medico e infermiere o tra specialisti):
- S — Situation: chi sono, da dove chiamo, per quale paziente, qual e il problema attuale
- B — Background: anamnesi rilevante, terapia in corso, parametri vitali recenti
- A — Assessment: cosa penso che stia succedendo, qual e la mia valutazione
- R — Recommendation: cosa chiedo (visita, esame, terapia), quanto e urgente

3.4. Ogni passaggio di consegne deve essere documentato e deve prevedere un momento dedicato per le domande e i chiarimenti. Le consegne affrettate, incomplete o interrotte sono fattori di rischio documentati per errore diagnostico.

## 4. DIAGNOSI DIFFERENZIALE SISTEMATICA

4.1. Il ragionamento diagnostico sistematico e la principale difesa contro l'errore diagnostico. Le linee guida raccomandano l'adozione di un approccio strutturato alla diagnosi differenziale, in particolare in contesti ad alto rischio (pronto soccorso, guardia medica, prima valutazione di sintomi acuti).

4.2. Approccio raccomandato per la diagnosi differenziale sistematica:
- Raccolta anamnestica completa: non limitarsi al sintomo principale, esplorare sistematicamente i fattori di rischio, l'anamnesi familiare, le terapie in corso
- Esame obiettivo mirato ma sistematico: non tralasciare i distretti non direttamente coinvolti dal sintomo principale
- Formulazione di almeno 3 ipotesi diagnostiche in ordine di probabilita
- Per ciascuna ipotesi: identificare gli esami necessari per confermarla o escluderla
- Documentare esplicitamente le ipotesi considerate e le ragioni della loro esclusione
- Rivalutazione: se il paziente non migliora come atteso, riconsiderare le ipotesi scartate

4.3. Bias cognitivi piu frequenti nell'errore diagnostico:
- Anchoring bias: fissarsi sulla prima ipotesi diagnostica senza considerare alternative
- Premature closure: chiudere il processo diagnostico troppo precocemente, prima di avere dati sufficienti
- Availability bias: sopravvalutare le diagnosi piu recentemente incontrate o piu memorabili
- Confirmation bias: cercare solo le informazioni che confermano l'ipotesi iniziale
- Framing effect: lasciarsi influenzare dal modo in cui il caso e presentato (es. diagnosi formulata dal collega precedente)

4.4. La documentazione clinica deve tracciare il ragionamento diagnostico: ipotesi considerate, esami richiesti per conferma/esclusione, risultati e conclusioni. La mancanza di documentazione del ragionamento diagnostico rende impossibile la difesa della condotta medica in sede peritale.

## 5. RED FLAGS — SEGNALI DI ALLARME DA NON SOTTOVALUTARE

5.1. Le red flags sono segni, sintomi o combinazioni cliniche che suggeriscono una patologia grave sottostante e che impongono un approfondimento diagnostico urgente. La mancata identificazione delle red flags e una delle cause piu frequenti di errore diagnostico.

5.2. Red flags per area clinica:
- Cefalea: esordio improvviso e intenso ("thunderclap"), cefalea peggiore della vita, rigidita nucale, deficit neurologici focali, papilledema — escludere emorragia subaracnoidea, meningite, lesione occupante spazio
- Dolore toracico: dolore oppressivo con irradiazione, dispnea, diaforesi, ipotensione, asimmetria dei polsi — escludere sindrome coronarica acuta, embolia polmonare, dissezione aortica, pneumotorace iperteso
- Dolore addominale: addome acuto con difesa, Blumberg positivo, ileo paralitico, instabilita emodinamica — escludere perforazione, occlusione intestinale, aneurisma aortico, pancreatite acuta necrotizzante
- Lombalgia: sindrome della cauda equina (ritenzione urinaria, anestesia a sella, deficit motorio progressivo), febbre, calo ponderale, trauma recente in osteoporotico — escludere compressione midollare, spondilodiscite, frattura patologica
- Febbre: febbre > 38.5 in immunodepresso, febbre con petecchie/porpora, rigidita nucale, alterazione dello stato di coscienza — escludere sepsi, meningite, endocardite

5.3. La rivalutazione clinica e mandatoria: ogni paziente dimesso dal pronto soccorso o dall'ambulatorio con diagnosi di patologia minore deve ricevere istruzioni scritte sui segnali di allarme che impongono il ritorno immediato. La documentazione di queste istruzioni e un elemento di tutela medico-legale.

5.4. I pazienti che tornano in pronto soccorso entro 72 ore per lo stesso motivo rappresentano una popolazione ad alto rischio di errore diagnostico e devono essere rivalutati con attenzione particolare, riconsiderando sistematicamente le ipotesi diagnostiche iniziali.`,
} as const;
