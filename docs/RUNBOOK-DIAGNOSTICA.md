# Runbook diagnostica — "perché è successo?"

Nato dal post-mortem del CASO-2026-235 (2026-07-24): estrazione di un fascicolo
da 301 pagine con pause da rate-limit di 15-20 minuti, nessuna traccia della
causa, utente convinto del blocco, caso annullato a 2/3. Regola da allora:
**ogni rallentamento, fallimento o annullamento deve lasciare una riga col
perché** — la risposta sta in una query, mai in un'indagine.

## Dove guardare (in ordine)

1. **Pagina del caso → "Dettagli tecnici dell'elaborazione"** (step Elaborazione):
   il registro tradotto in italiano. È la stessa fonte del banner "rallentata
   dai limiti del fornitore AI".
2. **Tabella `pipeline_diagnostics`** (SQL editor Supabase):
   ```sql
   SELECT step, code, count, last_at, detail
   FROM pipeline_diagnostics pd JOIN cases c ON c.id = pd.case_id
   WHERE c.code = 'CASO-2026-NNN' ORDER BY last_at DESC;
   ```
   Una riga per (caso, fase, causa): `count` = occorrenze, `detail` = contesto
   non clinico (pagine, documento, minuti, errore troncato).
3. **`audit_log`** per gli annullamenti: `case.processing.cancelled` porta la
   fotografia al momento dell'annullo (fase, sezione, eventi estratti, minuti).
4. **Sentry** per gli allarmi (caso bloccato, circuito Mistral aperto, rimborsi
   falliti, pattern di annulli) e **dashboard Inngest** per i run/retry.

## I codici

| Codice | Significato | Azione tipica |
|---|---|---|
| `rate_limited` | Attese imposte dal fornitore AI (la classe del 235) | Nessuna: riprende da sola. Se sistematico su fascicoli normali → rivedere pool/limiti |
| `timeout` | Rete/servizio momentaneamente giù | Riprova; se persiste → status Mistral/Supabase |
| `truncated` / `stream_stalled` | Risposta AI interrotta | Auto-split/retry già in pipeline; se ricorrente su uno stesso doc → doc troppo denso |
| `pages_missing` / `insert_failed` | Transitorio DB | Auto-retry; se persiste → health DB |
| `validator_blocked` | Bozza fermata dai controlli qualità | Il perito decide: correggere o sbloccare |
| `stuck_auto_fail` | Interrotta dal monitor dopo 60 min di silenzio | Crediti già rimborsati + email inviata; il caso è riavviabile |
| `cancelled_by_user` | Annullo volontario (con fotografia del punto esatto) | Se ricorre durante fasi lente → problema di percezione UX, non tecnico |
| `stale_run_aborted` | Run obsoleto auto-terminato al confine di step (caso annullato/in errore/completato/eliminato mentre il run era vivo) | È la guardia anti-zombie che funziona (post-mortem 235: run sopravvissuto 2,5 giorni all'annullo). Se ricorre spesso → qualche percorso annulla senza mandare il kill-event |
| `refund_failed` | Rimborso non riuscito = debito verso l'utente | **Intervenire**: verificare ledger e rimborsare a mano |

## Il ciclo di miglioramento

Ogni segnalazione ("X si è bloccato", "Y non funziona") segue lo stesso giro:
**query sul registro → causa → fix → riga in questo runbook se emerge un codice
o un pattern nuovo**. Se la causa NON è nel registro, il primo fix è aggiungere
il punto di scrittura mancante: un incidente senza traccia non deve ripetersi
due volte.

## Limiti noti (onestà)

- I retry che **riescono** dentro lo stesso tentativo di step (backoff interni
  ≤30s del client Mistral) non lasciano riga: si vedono solo i tentativi
  esauriti. I 429 "di passaggio" vivono nei log Vercel (effimeri).
- Le attese in coda nel pool Inngest (`mistral-pool`, 12 step) non sono
  attribuite a un caso: si deducono dal quadro (molti casi attivi insieme).
- La tabella arriva con la **migration 0032** (`pnpm db:migrate` col pooler);
  prima dell'applicazione tutto degrada in silenzio senza rompere nulla.
