# Benchmark Testing — confronto report MedLav vs gold standard Lavini

## Scopo

Garantire che **ogni cambiamento al codice di generazione report** non causi regressioni invisibili. Confrontiamo automaticamente i report generati da MedLav contro le perizie reali depositate da Lavini in Tribunale.

Questo è il **gold standard medico-legale**: la perizia di riferimento, quella che funziona davvero in pratica forense.

## Architettura

```
Example/                              # Input + gold (gitignored, dati pazienti)
├── DEL PORTO ... .docx               # Perizia CTU gold
├── Antoniazzi ... .docx              # Perizia stragiudiziale gold
├── Regnoto/                          # Caso con input PDF + output gold
└── cronistoriapassaniti/             # Cronistoria con input + output gold + Lavini-rivista

benchmark/                            # Workspace locale (gitignored)
├── gold/                             # Testo estratto da Example/ (per diff)
│   ├── del-porto-ctu-resp-civile.md
│   ├── antoniazzi-stragiudiziale.md
│   └── ...
├── generated/                        # Report generati da LegMed corrente
│   └── <slug>.md                     # SCARICATI MANUALMENTE dall'app
└── diffs/                            # Output dei diff (timestamped)
    └── <slug>-<timestamp>.md

scripts/                              # COMMITTATO
├── extract-gold-standards.ts         # Estrae testo dai gold .docx/.pdf
└── diff-report-vs-gold.ts            # Confronta generated vs gold
```

## Workflow completo (per ogni Ondata / cambiamento al generatore report)

### STEP 1 — Una volta sola: estrai i gold standard

```bash
pnpm tsx scripts/extract-gold-standards.ts
```

Questo genera i file in `benchmark/gold/`. Vanno aggiornati solo se aggiungi nuovi benchmark in `Example/`.

### STEP 2 — Per ogni cambiamento al generatore: rigenera baseline

Per ciascuno dei casi benchmark di cui hai i **documenti input** (non solo il gold output):

1. Apri MedLav
2. Crea un caso di test con i documenti input di `Example/Regnoto/`, `Example/cronistoriapassaniti/PASSANITI ALESSANDRO DOCUMENTAZIONE SANITARIA.pdf`, ecc.
3. Esegui la pipeline completa
4. Esporta il report come HTML o markdown
5. Salva in `benchmark/generated/<slug>.md` con stesso slug del gold

Esempio:
- Slug gold: `passaniti-cronistoria-rivista-lavini`
- Carichi: `Example/cronistoriapassaniti/PASSANITI ALESSANDRO DOCUMENTAZIONE SANITARIA.pdf`
- Esporti cronistoria → salvi in `benchmark/generated/passaniti-cronistoria-rivista-lavini.md`

### STEP 3 — Diff vs gold

```bash
pnpm tsx scripts/diff-report-vs-gold.ts passaniti-cronistoria-rivista-lavini
```

Output esempio:
```markdown
# Benchmark diff: passaniti-cronistoria-rivista-lavini

## Verdict: ✅ MATCH (similarity >= 70%)

## Metrics
| Metric | Gold | Generated | Delta |
| Words | 3450 | 3210 | -6.9% |
| Jaccard similarity | — | — | 78.3% |

## Domain keyword coverage
- Keywords expected: 25
- Present in gold: 22
- Present in generated: 21

Missing from generated:
- `nesso causale` (presente nel gold)

## Lines in gold NOT found in generated (potential missing content)
1. Il paziente presenta esiti permanenti della frattura...
2. Si conclude per invalidita permanente del 12%...
...
```

### STEP 4 — Lavini valuta

Il diff viene salvato in `benchmark/diffs/<slug>-<timestamp>.md`. Lavini lo legge e dà un verdict:
- ✅ Approvato: il report generato è equivalente al gold (anche se diverso testualmente)
- ⚠️ Minor fixes: regressioni minori da sistemare prima del merge
- ❌ Block merge: regressioni gravi, il refactor ha rotto qualcosa

Lavini annota la sua valutazione in `scratchpad/lavini-qa-gate.md`.

### STEP 5 — Solo dopo OK di Lavini

Il PR può essere merged in main.

## Cosa misura il diff

| Metrica | Significato |
|---------|-------------|
| **Jaccard similarity** | % di parole uniche in comune tra gold e generated. ≥70% = match, 50-70% = review, <50% = regression |
| **Word count delta** | Differenza % di lunghezza. Forti deviazioni (±30%) sono red flag |
| **Domain keyword coverage** | Quanti termini medico-legali chiave (anamnesi, diagnosi, nesso causale, ITT/ITP, ecc.) sono presenti |
| **Lines missing from generated** | Righe presenti nel gold ma assenti dal generated. Indicano possibili omissioni |
| **Lines extra in generated** | Righe del generated assenti nel gold. Possibili allucinazioni o aggiunte legittime |

## Cosa NON misura (limiti del diff automatico)

- **Sostituzioni semantiche**: "Il paziente lamenta" vs "Il periziando riferisce" — testo diverso, significato uguale. Lavini deve valutare.
- **Riordinamenti**: sezioni nello stesso ordine? Il diff non lo verifica direttamente, ma forte mismatch lo segnala.
- **Tono medico-legale**: registro professionale? Solo Lavini può valutarlo.
- **Conformità formale**: page break, margini, firma. Verificare visivamente sul PDF.

## Limitazioni note

- **Servono i documenti input**: per generare un report con MedLav serve il fascicolo originale. Solo Regnoto, Passaniti, spese mediche hanno input completo in `Example/`. DEL PORTO, Antoniazzi, bechmark giudiziale hanno solo il gold output (utili come reference visivo ma non testabili in ciclo automatico).
- **Real Mistral API**: generare i report richiede chiamate Mistral reali (consumo crediti). Per CI/CD futuro valuteremo VCR cassettes / mock layer.
- **Manualità step 2**: oggi serve caricare documenti via UI. Futuro: script che li carichi via API + lancia pipeline.

## Quando NON serve

Se il PR non tocca:
- `src/services/extraction/`
- `src/services/consolidation/`
- `src/services/synthesis/`
- `src/services/calculations/`
- `src/services/ocr/`
- Pipeline `inngest/functions/process-case.ts`

...puoi skippare il benchmark testing. Per modifiche puramente UI bastano E2E + screenshot regression.

## Roadmap evoluzione

- **v1 (ora)**: extract + diff manuale
- **v2**: script `pnpm tsx scripts/upload-and-generate.ts <case-dir>` che automatizza upload + pipeline
- **v3**: CI step che esegue benchmark su preview Vercel per ogni PR che tocca services/
- **v4**: VCR cassettes per riproducibilità deterministica senza Mistral API
- **v5**: dashboard storico dei diff per tracciare drift della qualità nel tempo
