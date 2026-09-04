# Documentazione sanitaria della perizia RC — specifica da approvare

**Per il Dott. Lavini.** Questa pagina descrive, tipo di documento per tipo di documento, cosa il software deve copiare dai documenti e cosa deve omettere nella sezione "La documentazione medica prodotta". L'abbiamo ricavata dalle sue tre perizie di riferimento. Le chiediamo di leggerla e di rispondere alle domande del foglio **02**: il software applicherà esattamente queste regole, senza interpretare.

---

# Documentazione sanitaria RC — passaggi-chiave per rubrica (spec per OK del Dott. Lavini)

Versione del 2026-09-04 · Tutti gli esempi sono **fittizi** (Cittàdemo, Demprova, via degli Esempi) · Derivata dal confronto fra le sue tre perizie di riferimento e i documenti da cui nascono.

## (a) Principio

**Un documento clinico = un blocco.** Titolo `Tipo[ – qualificatore], Struttura/Medico, in data gg.mm.aaaa:`; corpo = passaggi del medico **copiati alla lettera, una sola volta**, una riga per rigo OCR, senza rumore (anagrafica, codici, ticket, firme, informative, tabelle). Niente commenti, `[Ev.N]`, riassunti. Nei gold la sezione pesa il **44–48 %** della perizia e lo 0 % di cartelle, laboratorio, diari, consensi. Il generato attuale è 6× più lungo: il problema è **scegliere cosa non copiare**.

**Meccanica**: tabelle riallineate al placeholder ed esplose in righe `etichetta: valore`; metadati di titolo estratti *prima* delle omissioni; riga di rubrica = heading, voce del vocabolario o match copia/ometti; ogni altra riga è corpo della rubrica precedente; marker tabella/immagine chiude la rubrica; rubrica senza regola o vuota → omessa + avviso, mai riempita da altra fonte; **precedenza: anagrafica mai > ometti > copia**.

## (b) Per tipo

| Tipo | Si copia | Si omette | Parole |
|---|---|---|---|
| **Verbale PS standalone** (marker forti/deboli; mai pagine "richiesta di visita") | Motivo d'accesso; Anamnesi; EO verbatim senza righe dispositive; Diario; consulenze (**Risposta + Consiglio + Prognosi 100 %**) con intro `È stata richiesta consulenza … per …`; referti in urgenza; Diagnosi/Prognosi/Esito una volta, fuori tabella | Tutte le tabelle (anagrafica, esito, "guaribile in giorni", codice di uscita), arrivo/invio, legenda, parametri, laboratorio, ticket, Medico rich./Quesito come rubriche, Dinamica/Località/Circostanze, note, firme | 380–1.270 |
| **Verbale PS in fascicolo** | `Cartella P.S. <sede> n. <pratica> del <data>` + sola frase del Motivo d'accesso (anche da cella); frase 118 **solo** se c'è un verbale 118 in atti, altrimenti avviso | Tutto il resto | ~50 |
| **cartella_clinica** | Nulla. Contenitore raggruppato per nosografico: un PS per pratica; lettera/referti solo se non standalone; atto operatorio solo se manca "Trattamento adottato" | Frontespizio, SDO, diari, grafiche, scale, anestesia, checklist, laboratorio, consensi, consulenze cardio/anestesiologiche | 0 |
| **lettera_dimissione** | Da "Ricoverato/a dal … al …" (nosografico strippato): Motivo, Diagnosi di dimissione, Trattamento adottato integrale, Terapia domiciliare; pagine ANAMNESI: Farmaci (solo nomi), Anamnesi Medica e Prossima (continua oltre pagina) | Riga "Si dimette … nata il … CF", collega/saluti/firme, laboratorio, altri esami, RX incorporati, allergie, dispositivi, EO d'ingresso, informative | 150–400 |
| **esame_strumentale** | Corpo dalla rubrica "Referto" (o dal titolo esame) all'ultima riga, sottotitoli di distretto **dal corpo**, righe "a confronto con precedente", conclusioni | Lista "Esame/Classe di dose", anagrafica, accession, TSRM, firma, tabelle. Senza struttura **o** data → dalla fattura ("Dalla documentazione amministrativa…"); se indeterminabile, titolo senza struttura | 40–130 |
| **referto_specialistico** | Descrizione; Anamnesi solo righe dell'evento; Esami visionati/"presa visione"; EO; Conclusioni verbatim (senza rubrica = ultimo paragrafo); Si consiglia | Letterhead (solo per titolo/data), quesito, richiedente, anamnesi remota, cautele generiche, validazioni, prescrizioni | 45–240 |
| **esame_laboratorio** | Niente | Tutto | 0 |
| **certificato** | Date "Dati prognosi" → una riga per serie | Resto | ~16 |
| **altro** | Riclassifica (PS, fascicolo, 118, esame); altrimenti niente + avviso | — | — |
| spese, perizie, memorie | Fuori sezione. Congruità in Epicrisi **solo** per acquisti; fatture di esami solo per datare/attribuire, importo mai | — | — |

Lessico: RX→Radiografia, RM→Risonanza Magnetica, TC→Tomografia Computerizzata, ECO→Ecografia; dx/sx sciolti **solo** in titoli e intro; Dott./Dott.ssa dal nome.

## (c) Sovrapposti e serie

- Fonte: lettera standalone > referto standalone > PS standalone > fascicolo. Stessa rubrica, corpi diversi: entrambi; duplicato solo a similarità ≥ 0,85.
- **Serie radiologica**: ≤ 3 referti → tutti. Oltre: tenuto se data ∈ {trauma, tempi chirurgici} ± 1 g e distretto nella diagnosi; scartati TC con RX stessa data, RX torace, "vedi referto", controlli "invariato" senza altro. Novità clinica = override del perito.
- **Controllo stesso distretto**: accodato con frase-ponte solo se cita il confronto con un esame **in atti** (tra tutti i citati); altrimenti blocco autonomo.
- Certificati: una riga. Controlli ambulatoriali: un blocco ciascuno, esami visionati non deduplicati. Due ricoveri: una lettera ciascuno.

## (d) Ordine e stile

Cronologico per data dell'atto; lettera alla dimissione; esami in degenza prima della lettera; PS prima della RM dello stesso giorno. Dentro il PS: accettazione · EO · consulenza · dimissione (accettazione senza motivo = `Accesso in PS in data …, codice <colore>`). Separatore `————` solo tra documenti diversi, assenza tollerata. Virgolette e intro "Il referto … riporta quanto segue" = stile gold A (domanda 10).

## (e) Cosa NON fa

Niente narrazione, dinamica dal colloquio, giudizi, note interpretative: stanno in Dati anamnestici (37 parole), Fatto (109), Epicrisi (430–500, dei referti solo gli esiti). Coi default il caso semplice esce ~10 % più corto del gold: accettato.

## (f) Domande a Lavini (default)

1. Anamnesi PS: **copiare**, omessa se ≥ 0,85 simile a Motivo/Circostanze.
2. Diagnosi/Prognosi/Esito PS: **una volta, fuori tabella**; "guaribile in giorni" saltata se i giorni sono già nel testo.
3. Visita telegrafica: **verbatim**; parafrasi manuale.
4. Controllo stesso distretto: **autonomo**, accodato solo con confronto citato.
5. Indicazioni di dimissione in elenco: **no**.
6. Titolo: "La documentazione medica resasi disponibile e recensita" (B) o "…prodotta" (A).
7. Sola fattura: **nessun blocco**, tappa in Epicrisi + avviso.
8. Data di nascita nell'intro: **mai**.
9. **EO del PS**: verbatim o "una riga per reperto" come nel gold A?
10. **Stile blocchi esame**: gold A (titolo esteso, intro, virgolette) o gold B (`RX del gg/mm/aaaa`, nudo)?

## (g) Esempio (fittizio)

**Radiografia (RX) polso destro (dx) – esame strumentale, Ospedale Civile di Cittàdemo, in data 03.03.2026:**
Il referto, firmato digitalmente dalla Dott.ssa Demprova, riporta quanto segue:
> "RX POLSO DX. Notizie cliniche: caduta accidentale.
> Frattura composta dell'epifisi distale del radio. Rapporti articolari conservati."
