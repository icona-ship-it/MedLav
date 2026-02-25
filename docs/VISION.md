# Vision: MedLav

## Problema

Il medico legale riceve centinaia di pagine di documentazione clinica (cartelle cliniche, referti, esami, scansioni, foto) e deve leggere tutto manualmente, riordinare cronologicamente, trascrivere le evidenze e individuare criticita. Questo lavoro preparatorio richiede ore o giorni per un singolo caso. La documentazione arriva in formati eterogenei e spesso contiene testo manoscritto di difficile lettura.

## Soluzione

MedLav e una web app che automatizza la fase preparatoria della perizia medico-legale. Il perito carica la documentazione clinica, il sistema la elabora (OCR + AI) e produce un report strutturato con: sintesi medico-legale, cronologia eventi clinici, anomalie rilevate e documentazione mancante. Il report e modificabile ed esportabile, pronto per essere integrato nella relazione peritale.

## Utente Target

- **Persona primaria**: Medico legale / perito (CTU, CTP, stragiudiziale). Professionista non informatico che lavora quotidianamente con grandi volumi di documentazione clinica. Ha bisogno di uno strumento che gli faccia risparmiare ore di lavoro manuale di ricostruzione cronologica.
- **Persona secondaria**: Studio medico-legale associato con piu periti che condividono una piattaforma comune.

## Obiettivi Misurabili (MVP)

1. Ridurre il tempo di ricostruzione cronologica da ore/giorni a minuti
2. Garantire ZERO eventi scartati (Zero Discard Policy) — affidabilita forense
3. Supportare tutti i formati comuni di documentazione clinica (PDF, immagini, DOC, XLS)
4. Produrre report esportabili in HTML, CSV, DOCX pronti per la relazione peritale
5. Compliance GDPR completa per dati sanitari

## Differenziazione

Nessun tool esistente combina OCR (incluso testo manoscritto), estrazione strutturata AI, e analisi medico-legale specializzata (anomalie, documentazione mancante, confronto linee guida) in un unico flusso integrato. MedLav e costruito DA medici legali PER medici legali.

## Vincoli di Business

- Timeline: MVP completo funzionante
- Budget infra: flessibile, ottimizzato per qualita e affidabilita
- Team: Claude Code + 1 developer umano per review
- Modello: single-tenant iniziale, architettura predisposta per SaaS multi-tenant
- Regolatorio: GDPR (dati sanitari = categoria speciale art. 9), tutti i dati in EU
