import type { GuidelineContent } from './types';

export const SNLG_INFEZIONI: GuidelineContent = {
  title: 'Linee Guida SNLG per la Prevenzione delle Infezioni Correlate all\'Assistenza',
  source: 'SNLG (Sistema Nazionale Linee Guida) / ISS (Istituto Superiore di Sanita)',
  year: 2023,
  caseTypes: ['infezione_nosocomiale'],
  content: `## 1. PROFILASSI ANTIBIOTICA PERIOPERATORIA

1.1. La profilassi antibiotica perioperatoria ha l'obiettivo di ridurre l'incidenza delle infezioni del sito chirurgico (SSI) e deve essere somministrata con tempistiche precise per garantire adeguate concentrazioni tissutali al momento dell'incisione.

1.2. Timing di somministrazione: la profilassi deve essere somministrata per via endovenosa entro 30-60 minuti prima dell'incisione chirurgica. Per la vancomicina e i fluorochinoloni, l'infusione deve iniziare 60-120 minuti prima. La somministrazione troppo precoce (> 120 minuti prima) o troppo tardiva (dopo l'incisione) ne annulla l'efficacia ed e un errore documentato con frequenza significativa nei contenziosi medico-legali.

1.3. Scelta della molecola in base al tipo di intervento:
- Chirurgia ortopedica (protesi, osteosintesi): cefazolina 2g EV (3g se peso > 120 kg)
- Chirurgia addominale (colon-retto): cefazolina 2g + metronidazolo 500mg EV
- Chirurgia cardiaca: cefazolina 2g EV
- Taglio cesareo: cefazolina 2g EV (prima dell'incisione, non al clampaggio del cordone)
- Chirurgia urologica: ciprofloxacina 400mg EV o cefazolina 2g EV
- In caso di allergia ai beta-lattamici: clindamicina 900mg + gentamicina 5mg/kg, oppure vancomicina 15mg/kg

1.4. Dose intraoperatoria: ripetere la dose se l'intervento supera le 2 emivite dell'antibiotico scelto (per cefazolina: dose aggiuntiva dopo 3-4 ore) o se la perdita ematica supera i 1500 mL.

1.5. Durata: la profilassi deve essere limitata alla singola dose preoperatoria (o al massimo 24 ore post-operatorie per la chirurgia cardiaca e ortopedica protesica). Il prolungamento della profilassi oltre le 24 ore non riduce il rischio infettivo e seleziona resistenze batteriche. La prosecuzione ingiustificata della profilassi per giorni e un errore di antibiotic stewardship frequentemente riscontrato.

## 2. BUNDLE PREVENZIONE INFEZIONI DA CATETERE VENOSO CENTRALE (CLABSI)

2.1. Le infezioni correlate a catetere venoso centrale (CLABSI) sono tra le ICA piu gravi, con mortalita attribuibile del 12-25%. La prevenzione si basa su un bundle di misure la cui applicazione combinata riduce il rischio fino all'80%.

2.2. Bundle di inserimento:
- Igiene delle mani con soluzione alcolica prima della procedura
- Precauzioni di barriera massimale: cuffia, maschera, camice sterile, guanti sterili, telo sterile ampio
- Antisepsi cutanea con clorexidina alcolica al 2% (non iodopovidone)
- Scelta ottimale del sito di inserzione: preferire la vena succlavia rispetto alla giugulare interna e alla femorale (quest'ultima associata al rischio infettivo piu elevato)
- Guida ecografica per l'inserimento (raccomandazione forte)

2.3. Bundle di gestione:
- Rivalutazione quotidiana della necessita del CVC: rimuovere appena non piu indispensabile
- Medicazione con pellicola trasparente semipermeabile, cambio ogni 7 giorni o prima se sporca, staccata o bagnata
- Medicazione con garza: cambio ogni 2 giorni
- Disinfezione degli hub e dei connettori con clorexidina alcolica prima di ogni accesso (scrub the hub per almeno 15 secondi)
- Cambio dei set di infusione ogni 96 ore (ogni 24 ore per lipidi ed emoderivati)

2.4. La mancata applicazione del bundle nella sua interezza configura un difetto di aderenza agli standard di prevenzione. La documentazione deve tracciare: data e ora di inserimento, sito, operatore, indicazione clinica, e le rivalutazioni quotidiane della necessita.

## 3. BUNDLE PREVENZIONE POLMONITE ASSOCIATA A VENTILAZIONE (VAP)

3.1. La VAP e l'ICA piu frequente in terapia intensiva, con incidenza di 5-15 episodi per 1000 giorni di ventilazione meccanica e mortalita attribuibile del 10-30%.

3.2. Bundle di prevenzione VAP:
- Elevazione della testata del letto a 30-45 gradi (riduce il rischio di aspirazione gastrica)
- Interruzione quotidiana della sedazione con valutazione dello svezzamento dalla ventilazione meccanica (daily sedation interruption + spontaneous breathing trial)
- Igiene orale con clorexidina 0.12% ogni 8 ore
- Profilassi della trombosi venosa profonda
- Profilassi dell'ulcera da stress (solo nei pazienti ad alto rischio: coagulopatia, ventilazione meccanica > 48 ore, trauma cranico)
- Pressione della cuffia del tubo endotracheale mantenuta tra 20 e 30 cmH2O
- Aspirazione delle secrezioni sub-glottiche (tubi endotracheali con lume di aspirazione dedicato)

3.3. Monitoraggio: rivalutazione quotidiana della possibilita di svezzamento dalla ventilazione meccanica. Ogni giorno di ventilazione meccanica in eccesso aumenta il rischio di VAP dell'1-3%.

## 4. ANTIBIOTIC STEWARDSHIP

4.1. L'antibiotic stewardship e l'insieme di interventi coordinati finalizzati a promuovere l'uso appropriato degli antibiotici: molecola giusta, dose giusta, via di somministrazione giusta, durata giusta.

4.2. Principi fondamentali per la pratica clinica:
- Eseguire SEMPRE emocolture (almeno 2 set) e colture mirate PRIMA di iniziare la terapia antibiotica empirica
- Avviare la terapia empirica ad ampio spettro solo dopo il prelievo delle colture, sulla base dei dati epidemiologici locali (ecologia di reparto)
- De-escalation: restringere lo spettro antibiotico entro 48-72 ore sulla base dei risultati microbiologici (antibiogramma)
- Durata della terapia: rispettare le durate raccomandate (generalmente 5-7 giorni per la maggior parte delle infezioni, salvo indicazioni specifiche)
- Switch EV-orale: passare alla somministrazione orale appena le condizioni cliniche lo consentono (paziente emodinamicamente stabile, tratto gastrointestinale funzionante, assenza di malassorbimento)

4.3. Errori comuni di antibiotic stewardship rilevanti in ambito medico-legale: mancata esecuzione di emocolture prima dell'antibiotico, terapia empirica non adeguata all'ecologia locale, mancata de-escalation dopo antibiogramma, durate eccessive o insufficienti, mancato monitoraggio dei livelli plasmatici dei farmaci nefrotossici (vancomicina, aminoglicosidi).

## 5. GESTIONE DELLA SEPSI (SEPSIS-3 E ORA DORATA)

5.1. La sepsi e definita (Sepsis-3, 2016) come una disfunzione d'organo potenzialmente letale causata da una risposta disregolata dell'organismo a un'infezione. La disfunzione d'organo e identificata da un aumento del punteggio SOFA >= 2 punti rispetto al basale.

5.2. Lo shock settico e un sottotipo di sepsi con grave alterazione circolatoria e metabolica: necessita di vasopressori per mantenere una pressione arteriosa media >= 65 mmHg e lattato sierico > 2 mmol/L nonostante adeguata rianimazione volemica.

5.3. Bundle dell'ora dorata (Hour-1 Bundle — Surviving Sepsis Campaign 2021):
Entro 1 ORA dal riconoscimento della sepsi, devono essere eseguiti TUTTI i seguenti interventi:
- Misurazione del lattato sierico (ripetere se lattato > 2 mmol/L)
- Prelievo di emocolture (almeno 2 set da siti diversi) PRIMA della terapia antibiotica
- Somministrazione di antibiotici ad ampio spettro per via endovenosa
- Inizio della rianimazione volemica con cristalloidi (30 mL/kg nelle prime 3 ore) in caso di ipotensione o lattato >= 4 mmol/L
- Inizio di vasopressori (noradrenalina) se ipotensione persistente durante o dopo la rianimazione volemica

5.4. Lo screening per la sepsi deve essere effettuato con il qSOFA (quick SOFA) in contesto non intensivo: pressione arteriosa sistolica <= 100 mmHg, frequenza respiratoria >= 22 atti/min, alterazione dello stato di coscienza (GCS < 15). Due o piu criteri positivi suggeriscono sepsi e impongono la valutazione urgente.

5.5. Il ritardo nella somministrazione dell'antibiotico nella sepsi e associato a un aumento della mortalita del 7-8% per ogni ora di ritardo. Il mancato riconoscimento della sepsi e il ritardo nell'avvio del bundle sono tra le principali cause di morte evitabile in ospedale e configurano potenziale responsabilita professionale.

## 6. ISOLAMENTO E PRECAUZIONI STANDARD

6.1. Le precauzioni standard si applicano a TUTTI i pazienti, indipendentemente dalla diagnosi infettiva nota:
- Igiene delle mani: i 5 momenti OMS (prima del contatto, prima di procedura asettica, dopo esposizione a liquidi biologici, dopo il contatto, dopo il contatto con l'ambiente circostante)
- Utilizzo di DPI (guanti, mascherina, occhiali, camice) in base al rischio di esposizione
- Igiene respiratoria e galateo della tosse
- Gestione sicura dei taglienti
- Pulizia e disinfezione delle superfici ambientali e dei dispositivi medici
- Gestione della biancheria contaminata
- Corretta gestione dei rifiuti sanitari

6.2. Precauzioni aggiuntive basate sulla via di trasmissione:
- Contatto (MRSA, VRE, Clostridium difficile, microrganismi multiresistenti): stanza singola o cohorting, guanti e camice ad ogni contatto, dispositivi medici dedicati
- Droplet (influenza, meningococco, pertosse): stanza singola, mascherina chirurgica a distanza < 1 metro
- Airborne (tubercolosi, varicella, morbillo): stanza a pressione negativa, mascherina FFP2/FFP3

6.3. La compliance all'igiene delle mani e il singolo intervento piu efficace nella prevenzione delle ICA. La compliance media nelle strutture sanitarie italiane e circa 40-50%, ben al di sotto dell'obiettivo dell'80%. Il monitoraggio e il feedback sulla compliance sono interventi organizzativi obbligatori.`,
} as const;
