# E2E Tests — MedLav/LegMed

Test end-to-end con Playwright. Servono come **safety net** per il software medico-legale: nessun PR va in main senza che questi test passino.

## File presenti

| File | Cosa testa |
|------|-----------|
| `smoke.spec.ts` | Smoke generico: auth, dashboard, creazione caso, upload, settings, admin (162 LOC) |
| `auth.spec.ts` | Flussi di autenticazione (login, signup, reset password) |
| `dashboard.spec.ts` | Pagina dashboard + navigazione moduli |
| `smoke-pipeline.spec.ts` | Pipeline elaborazione casi (mock o reale) |
| `ondata-1-refactor.spec.ts` | **NUOVO** — verifica completa di tutti i cambiamenti UX Ondata 1 + visual regression |

## Setup iniziale (una volta sola)

### 1. Installa i browser Playwright
```bash
pnpm exec playwright install chromium
```

### 2. Configura env vars

Crea `.env.test.local` (o esporta nello shell):
```bash
E2E_BASE_URL=http://localhost:3000
E2E_USER_EMAIL=tuo-account-test@example.com
E2E_USER_PASSWORD=la-tua-password
```

> **Importante**: usa un **account dedicato ai test**, non l'account di produzione. Gli e2e creano/modificano dati.

### 3. Prepara un caso di test (per Ondata 1)

I test di Ondata 1 hanno bisogno che l'account abbia almeno un caso con:
- Un report già generato (anche in stato bozza)
- Anomalie rilevate (opzionale ma alcuni test si saltano se mancano)

**Modo veloce**: dopo login, crea un caso, carica un PDF semplice, esegui pipeline full. In 5 minuti hai il caso pronto.

## Comandi

| Comando | Cosa fa |
|---------|---------|
| `pnpm test:e2e` | Esegue TUTTI gli spec |
| `pnpm test:e2e:ondata-1` | Solo i test del refactor Ondata 1 (~20 test, ~3 min) |
| `pnpm test:e2e:headed` | Apre browser visibile (utile per debug) |
| `pnpm test:e2e:ui` | Modalità UI interattiva di Playwright (consigliata per esplorare) |
| `pnpm test:e2e:update-snapshots` | **Aggiorna le baseline screenshot** dopo modifiche UI intenzionali |

## Workflow consigliato per ogni Ondata UX

### Prima del refactor (snapshot baseline)
```bash
# Su main (codice "vecchio"):
pnpm test:e2e:update-snapshots
git add e2e/**/*.png
git commit -m "test(e2e): baseline snapshots before Ondata N"
```

### Durante il refactor (verifica regressioni)
```bash
# Su branch refactor:
pnpm dev  # in altro terminale
pnpm test:e2e
```

I test che usano `toHaveScreenshot()` fallisco se la UI è cambiata vs baseline. Esamina la diff con `playwright show-report`.

### Dopo il refactor (aggiorna baseline se cambio è intenzionale)
```bash
# Solo se la UI è cambiata IN MODO INTENZIONALE:
pnpm test:e2e:update-snapshots
git add e2e/**/*.png
git commit -m "test(e2e): update snapshots after Ondata N approval"
```

## Visual regression — come funziona

- `expect(page).toHaveScreenshot('nome.png')` salva uno screenshot al primo run come baseline.
- Ai run successivi confronta pixel-per-pixel con la baseline.
- `maxDiffPixelRatio: 0.02` tollera fino al 2% di differenza (fonts, scrollbars, antialiasing).
- Le baseline sono committate in `e2e/__screenshots__/<spec>/<test-name>.png`.

## Cosa NON funziona ancora (TODO)

- [ ] CI integration (eseguire e2e su Vercel preview deploy ad ogni PR)
- [ ] Benchmark output testing (PASSO 4) — confronto report generato vs gold standard Lavini
- [ ] Test specifici per i 4 pipeline mode (full/extraction/expenses/anonymize)
- [ ] Mock Mistral API per test deterministici (oggi serve real Mistral key)
- [ ] Test su mobile viewport (375x812 iPhone, 768x1024 iPad)

## Troubleshooting

### "browserType.launch: Executable doesn't exist"
Esegui `pnpm exec playwright install chromium`.

### "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run"
I test che richiedono auth si saltano se mancano env vars. Configurali come sopra.

### "TimeoutError waiting for selector"
Probabilmente il dev server non è attivo o sta cold-starting. Apri `pnpm dev` in altro terminale e aspetta che sia ready.

### Screenshot test falliscono dopo refactor intenzionale
Lancia `pnpm test:e2e:update-snapshots` e committa le nuove PNG.

### Test PDF download fallisce
Verifica che Chrome di sistema sia installato (il PDF generator lo usa in dev). Su macOS: `/Applications/Google Chrome.app` deve esistere.

## Per il refactor UX in corso (Ondata 1)

Eseguire **PRIMA del merge in main**:

```bash
# Terminal 1
pnpm dev

# Terminal 2 (dopo che dev è ready)
pnpm test:e2e:ondata-1
```

Tutti i ~20 test devono passare. Se anche uno solo fallisce, **NON mergere** e segnalare a Claude.

Esegui anche manualmente:
1. Apri caso reale tuo → tab Report
2. Verifica visibilità bottone "Approva" verde (se status=bozza)
3. Apri dropdown "Esporta" → conferma "Esporta PDF" presente
4. Click "Esporta PDF" → si scarica un file `.pdf` apribile
5. Apri il PDF → assomiglia all'HTML del report?

Solo dopo questi check passati il branch è pronto per main.
