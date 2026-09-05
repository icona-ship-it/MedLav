# Informativa sull'uso di sistemi di intelligenza artificiale — testo-tipo per il perito

Bozza del 2026-09-05, **da far rivedere a un legale** prima dell'uso. Riferimenti: art. 13 della legge 23 settembre 2025 n. 132 (obbligo, per il professionista, di informare il cliente sull'uso di sistemi di IA); art. 50 par. 2 del Regolamento (UE) 2024/1689 (marcatura dei contenuti generati dall'IA, a carico del fornitore del sistema: LegMed).

## Testo da inserire nella lettera d'incarico o in calce alla perizia

> Il sottoscritto informa che, nella redazione del presente elaborato, si è avvalso del sistema informatico LegMed, che utilizza sistemi di intelligenza artificiale per la lettura ottica dei documenti sanitari, l'ordinamento cronologico degli eventi clinici e la predisposizione di una bozza di testo. Ogni contenuto è stato verificato dal sottoscritto sui documenti originali; le valutazioni medico-legali (nesso di causalità, entità del danno, inabilità temporanea, sofferenza) sono esclusivamente opera del sottoscritto. I documenti sono trattati su infrastrutture ubicate nell'Unione Europea; nessun dato è utilizzato per l'addestramento di modelli di intelligenza artificiale.

## Cosa fa LegMed per rendere vera questa informativa

- Marcatura del testo generato nei file esportati (proprietà del documento Word e HTML), come richiesto dall'art. 50 par. 2 AI Act.
- Pannello "Da controllare" con citazioni non riscontrate, date senza riscontro, eventi da verificare: il perito vede cosa il sistema non ha potuto garantire.
- Appendice di verifica negli export: documenti ricevuti, trascritti, esclusi e perché.
- Trattamento su endpoint europei (Supabase Francoforte, Mistral endpoint regionale UE); zero data retention richiesta al fornitore e documentata quando confermata (`docs/DPA-MISTRAL.md`).

## Cosa resta al perito

La verifica sui documenti originali e la firma. Il software prepara i fatti; il giudizio è suo. È la ragione per cui la bozza contiene campi da compilare e non valutazioni.
