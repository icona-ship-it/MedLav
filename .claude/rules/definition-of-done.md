# Definition of Done — la verifica avversariale è PARTE del lavoro

Lezione ricorrente (2026-07: audit \b Unicode, guardia numeri/date dello snapper,
varco heading GDPR): ogni volta che il founder chiede "sei sicuro?", un secondo
passaggio avversariale trova difetti veri. La conclusione non è "riverificare
all'infinito" — è che il secondo passaggio va fatto PRIMA di dichiarare "fatto",
sempre, senza che venga chiesto.

## Nessun lavoro è "fatto" senza, nell'ordine:

1. **Checklist meccanica**: `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm build` verdi.
2. **Passaggio avversariale sul diff** (obbligatorio, prima di riferire "fatto"):
   rileggere il proprio lavoro cercando di ROMPERLO, con questi angoli fissi:
   - date, numeri, lateralità: può questo cambiamento alterarne uno in silenzio?
   - GDPR/Art.9: può far trapelare testo clinico (parser sezioni, log, export, link pubblico)?
   - percorsi paralleli: la modifica copre pipeline principale E batched E auto-split E regen E export?
   - input limite: vuoto, enorme, accentato, manoscritto, OCR sporco (tag HTML, marker, markdown).
   - soldi: crediti scalati senza consegna, o consegna senza scalare?
3. **Invarianti per il codice puro critico**: per la logica safety-critical
   (calcoli, fedeltà citazioni, anonimizzazione) scrivere test di invariante
   ("cosa non deve succedere MAI") oltre agli esempi — se serve, fuzz con seed fisso.
4. **Collaudo live per i cambi che toccano l'output LLM**: prompt, sezioni,
   fedeltà → non è "fatto" finché non è misurato su un caso reale rigenerato
   (o gold). I test non vedono lo stile.

## Gerarchia delle reti (perché non serve riverificare all'infinito)

L'obiettivo del prodotto NON è zero errori (impossibile): è **zero errori
SILENZIOSI**. Le reti, in ordine: (1) test+invarianti → (2) passaggio
avversariale → (3) collaudo live → (4) reti in produzione (verificatore
citazioni, claim-verify, coverage T1, registro diagnostica, pannello "Da
controllare") che rendono VISIBILE al perito ogni residuo.

**Stop rule**: superati i 4 livelli, ulteriori riverifiche a freddo sono teatro
— l'informazione nuova arriva solo dall'uso reale (feedback beta + registro
diagnostica). Non ripetere review identiche; dichiarare invece onestamente i
limiti residui accettati, per iscritto, ogni volta.
