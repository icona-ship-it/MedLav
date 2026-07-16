# Registro incidente — Dati personali reali negli esempi few-shot dei prompt

**Data rilevazione**: 2026-07-17 (sweep interno su direttiva del titolare)
**Stato**: RISOLTO lo stesso giorno · Audit di contaminazione: NEGATIVO
**Classificazione**: esposizione interna verso il responsabile del trattamento (Mistral, EU, no-training); nessuna violazione verso terzi rilevata.

## Cosa è stato trovato

1. **Prompt di generazione dell'intestazione** (`NEGATIVE_FEW_SHOT_INTESTAZIONE`): conteneva nome completo, data di nascita, diagnosi e struttura sanitaria di una periziando reale (dati Art. 9), etichettati "caso reale". Il blocco veniva inviato a Mistral a ogni generazione della sezione, anche per casi di altri interessati.
2. **Prompt della sezione "Il Fatto"**: l'esempio di stile derivava dal gold reale (luogo identificabile "Scuola Cangrande"); un dettaglio è trapelato in un report generato (stesso interessato, non cross-paziente).
3. **Fixture di test**: una data di nascita reale (minore) in un file di test committato.
4. **Slug committati** nel repository con i cognomi dei periziandi (in un caso nome completo + tipologia di danno).

## Azioni correttive (stesso giorno)

- Esempi few-shot riscritti con **dati interamente fittizi** e dichiarati tali (universo di riferimento: "via degli Esempi", "Cittàdemo", "Demprova") — commit `cb7c6c1`, `2e0ce2e`.
- Canarini di leak nel `report-validator` per i token fittizi (rilevazione automatica di eventuali riproduzioni).
- Fixture di test bonificata; slug rinominati in codici neutri (`gold-a/b/c`) con rinomina coerente dei file locali (mai committati: `benchmark/` è gitignored).
- **Regola permanente** in `.claude/rules/security.md`: prompt, esempi, fixture e slug sempre fittizi.

## Audit di contaminazione (2026-07-17)

Scansione di **tutti i 112 report salvati (ogni versione)** per i token reali e fittizi noti:

- **Nessun dato reale di un interessato è presente nei report di altri interessati** (zero cross-contaminazione). L'unico match del dato reale è nel report del caso dell'interessata stessa (uso legittimo).
- 4 report **v1 legacy** (apr–mag 2026, casi di test del titolare) contengono i dati **fittizi** dell'esempio ("Mario Bianchi" ecc.): sono il residuo dell'incidente storico che ha motivato il rilevatore di fabbricazione; nessun dato reale coinvolto. Raccomandazione: eliminare quei casi di test o rigenerarli.
- 1 report v2 (caso di test del titolare) conteneva il dettaglio reale "Scuola Cangrande" riferito allo **stesso interessato** del caso; superseded dalla v5 pulita.

## Valutazione

Nessun obbligo di notifica ex Art. 33 ravvisato: l'esposizione è avvenuta esclusivamente verso il fornitore LLM (UE, opt-out training) già coinvolto nel trattamento dei medesimi dati come responsabile designando, senza accessi di terzi né trasferimenti ulteriori; nessuna diffusione cross-interessato nei documenti prodotti. Restano ferme le azioni pendenti note: firma DPA/SCC con i subprocessor.
