# Modulo di feedback — un rigo per difetto

Compili una riga per ogni cosa che non va. Se preferisce, ce lo detti al telefono con la stessa struttura.

| # | Codice caso | Dove (sezione / documento / evento) | Cosa si aspettava | Cosa ha trovato | Gravità (1 = da correggere subito, 2 = importante, 3 = estetico) | Screenshot |
|---|---|---|---|---|---|---|
| 1 | CASO-2026-___ | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |

Esempi di righe utili (fittizi):
- `CASO-2026-999 · Documentazione, blocco RX del 13.09 · mi aspettavo la conclusione del referto · c'è solo l'intestazione · 1`
- `CASO-2026-999 · Spese, riga fattura n. 45 · 400,00 · 488,00 (sommata IVA) · 1`
- `CASO-2026-999 · Cronistoria, evento del 10.02 · lato destro · lato sinistro · 1`

Cosa serve a noi per riprodurre: il codice del caso (mai il nome del paziente), la sezione, la frase o il numero esatto. Con questi tre dati il difetto viene riprodotto e chiuso; senza, si perde.
