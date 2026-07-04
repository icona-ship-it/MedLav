# Model card — LegMed

> ⚠️ **BOZZA — da validare con consulenza legale prima della pubblicazione.**
>
> Scheda di trasparenza in una pagina (modello ispirato alle "Applied Model Card"
> CHAI). Destinata alla pubblicazione in-app e sulla pagina "Sicurezza e conformità".
> Nessun numero di accuratezza va aggiunto finché le metriche non sono misurate e
> pubblicabili con metodologia.

**Data bozza**: 2026-07-04 · **Versione**: 0.1-draft · **Sistema**: LegMed (bozze di perizie RC stragiudiziali)

---

## Cosa fa il sistema

LegMed trasforma la documentazione clinica caricata dal medico legale in una **bozza strutturata di perizia stragiudiziale** per casi di responsabilità civile. La pipeline:

1. **OCR** — digitalizzazione di PDF, immagini e DOCX, incluso il manoscritto (`mistral-ocr-latest`).
2. **Classificazione** — riconoscimento del tipo di documento (referto, cartella, verbale PS, ...).
3. **Estrazione** — identificazione degli eventi clinici (date, diagnosi, prestazioni, strutture) con citazione della fonte.
4. **Consolidamento** — cronologia unificata, deduplicazione tra documenti (algoritmo deterministico, senza AI).
5. **Sintesi** — bozza sezionale della perizia: sintesi della documentazione sanitaria con citazioni testuali, calcoli dei periodi di inabilità, rilevamento di anomalie e documenti mancanti.

**Modelli utilizzati** (tutti Mistral AI, elaborazione in EU): `mistral-ocr-latest` (OCR), `mistral-large-2512` (classificazione, estrazione, sintesi, analisi immagini), `mistral-embed` (ricerca su linee guida). I dati dei clienti non sono usati per addestrare alcun modello.

## Cosa NON fa

- **Nessuna valutazione medico-legale autonoma**: il giudizio sul nesso di causalità, le percentuali di danno biologico, la graduazione dell'inabilità temporanea e ogni conclusione restano al perito. Nelle bozze queste sezioni sono segnaposto vuoti da compilare.
- Non esprime giudizi sulla condotta dei sanitari, non interpreta immagini diagnostiche a fini diagnostici, non fornisce consulenza medica o legale.
- Non decide nulla in autonomia: nessun output lascia la piattaforma senza revisione del professionista.

## Errori tipici noti

Osservati internamente sul benchmark di casi reali (metriche **in corso di misurazione sul benchmark interno**; saranno pubblicate con la metodologia):

- **Omissioni**: un evento clinico presente nei documenti può mancare dalla cronologia o dalla sintesi. È l'errore che consideriamo più insidioso, perché non si vede rileggendo la bozza ma solo tornando ai documenti.
- **Citazioni da verificare**: le citazioni testuali possono divergere dall'originale o essere attribuite alla pagina sbagliata; vanno controllate sulla fonte.
- **OCR su scansioni di bassa qualità**: fotocopie sbiadite, manoscritti e timbri producono testo incerto che si propaga alle fasi successive.
- **Date incomplete o inferite**: quando il documento non riporta una data completa, il sistema può inferirla dal contesto (segnalandola come tale).

## Mitigazioni in pipeline

- **Verifica del testo alla fonte**: le citazioni e i campi estratti sono confrontati con il testo OCR originale; il testo sorgente resta consultabile a fianco della bozza.
- **Blocco dei report troncati**: una bozza incompleta non viene salvata come completa — la generazione viene ritentata o fallisce esplicitamente.
- **Rilevamento anomalie e documenti mancanti**: controlli deterministici (senza AI) segnalano al perito incongruenze e assenze attese.
- **Cap di confidenza**: le date inferite e le diagnosi discordanti tra documenti non vengono mai risolte automaticamente — ricevono confidenza bassa e vengono portate all'attenzione del perito.
- **Segnaposto valutativi**: le sezioni di giudizio non vengono generate per progetto, così non possono contenere valutazioni inventate.

## Cosa resta SEMPRE al professionista

- La verifica di ogni contenuto della bozza sulla documentazione originale.
- L'esame obiettivo del periziando e ogni valutazione clinica e medico-legale.
- Il giudizio sul nesso di causalità, la quantificazione del danno, le conclusioni.
- La decisione di usare, modificare o scartare qualsiasi parte della bozza.
- La firma e la responsabilità professionale dell'elaborato finale.

## Limiti d'uso previsti

- Destinato **esclusivamente all'attività peritale stragiudiziale e di parte** (perizie RC, consulenze di parte) da parte di medici legali e professionisti sanitari qualificati.
- **Non destinato all'uso da parte o per conto di autorità giudiziarie** (es. attività di CTU o perito del giudice), né a decisioni automatizzate su singole persone.
- Non è un dispositivo medico e non ha finalità diagnostiche o terapeutiche.
- L'output è una bozza di lavoro: non va trasmesso a terzi senza la revisione e l'assunzione di responsabilità del professionista.

## Segnalazione di problemi

Errori nelle bozze (omissioni, citazioni errate, contenuti non supportati dai documenti) possono essere segnalati dalla piattaforma (valutazione del report) o via email a privacy@legmed.it **[DA VERIFICARE: indirizzo dedicato al feedback]**. Le segnalazioni alimentano il benchmark interno e la correzione della pipeline.

---

*Ultimo aggiornamento: 2026-07-04. Questa scheda viene aggiornata a ogni cambiamento di modelli, pipeline o limiti d'uso.*
