# Registro delle Violazioni di Dati Personali

## ai sensi dell'Art. 33(5) del Regolamento (UE) 2016/679 (GDPR)

| Campo | Valore |
|-------|--------|
| **Titolare / Responsabile** | LegMed S.r.l. (vedi "Ruolo di LegMed" sotto) |
| **Referente privacy (DPO)** | privacy@legmed.it |
| **Data istituzione del registro** | 10 giugno 2026 |
| **Versione** | 1.0 |
| **Classificazione** | RISERVATO — Uso interno e DPO |
| **Conservazione** | Permanente per la durata dell'attivita; ogni scheda conservata almeno 5 anni dalla chiusura (accountability ex Art. 5(2) GDPR) |
| **Procedura collegata** | `docs/PROCEDURA-DATA-BREACH.md` |
| **DPIA collegata** | `docs/DPIA.md` (rischio R6, misure 5.8) |

---

## 1. Scopo e obbligo normativo

L'Art. 33(5) GDPR impone al titolare del trattamento di **documentare qualsiasi violazione dei dati personali**, comprese le circostanze a essa relative, le sue conseguenze e i provvedimenti adottati per porvi rimedio, **indipendentemente dall'obbligo di notifica** al Garante. Il presente registro assolve tale obbligo e consente all'autorita di controllo di verificare il rispetto dell'Art. 33.

In via prudenziale, il registro accoglie anche gli **eventi di sicurezza senza violazione confermata** (near miss), chiaramente marcati come tali: la valutazione documentata dell'assenza di violazione e essa stessa evidenza di accountability.

### Ruolo di LegMed

LegMed opera con un **doppio ruolo** (vedi `docs/DPIA.md` Sez. 2.4):

- **Titolare del trattamento** per i dati degli utenti della piattaforma (medici legali: account, fatturazione, log) → in caso di violazione, LegMed valuta e, se dovuta, effettua direttamente la notifica al Garante ex Art. 33(1);
- **Responsabile del trattamento** (Art. 28) per i dati sanitari dei pazienti caricati dai periti (titolari autonomi) → in caso di violazione, LegMed **informa il titolare senza ingiustificato ritardo** ex Art. 33(2); la notifica al Garante e la comunicazione agli interessati competono al titolare, con l'assistenza di LegMed.

Ogni scheda indica il ruolo in cui LegMed ha operato per l'evento registrato.

---

## 2. Istruzioni di compilazione

1. Aprire una nuova scheda **per ogni evento**, anche se in corso di triage (la scheda si aggiorna man mano);
2. Assegnare ID progressivo `BREACH-YYYY-NNN`;
3. Compilare seguendo la `docs/PROCEDURA-DATA-BREACH.md` (il registro e la Fase 7 della procedura);
4. Aggiungere la riga nell'indice (Sezione 3) e la scheda completa (Sezione 4);
5. Aggiornare lo **stato**: `In triage` → `In gestione` → `Chiusa` (oppure `Chiusa — non violazione`);
6. Allegare per riferimento ogni evidenza (log, comunicazioni dei fornitori, commit, screenshot) indicandone la collocazione.

---

## 3. Indice delle violazioni

| ID | Data rilevazione | Natura (sintesi) | Ruolo LegMed | Violazione confermata | Notifica Garante | Comunicazione interessati | Stato |
|----|------------------|------------------|--------------|:--------------------:|:----------------:|:------------------------:|-------|
| BREACH-2026-001 | 21/04/2026 | Potenziale esposizione di environment variables (incident Vercel + CVE-2026-42047 Inngest SDK) — nessun accesso a dati personali accertato | Titolare e Responsabile | NO | NO — non dovuta | NO — non dovuta | Chiusa — non violazione |

---

## 4. Schede dettagliate

### BREACH-2026-001 — Incident Vercel / CVE-2026-42047 (aprile 2026)

| Campo | Contenuto |
|-------|-----------|
| **ID** | BREACH-2026-001 |
| **Data e ora di rilevazione** | 21/04/2026 (comunicazione di sicurezza Vercel Inc.); evento correlato rilevato il 30/04/2026 (CVE-2026-42047 segnalata dal sistema di build Vercel) |
| **Modalita di rilevazione** | Notifica proattiva del sub-responsabile (Vercel) + blocco build per advisory di sicurezza |
| **Ruolo di LegMed** | Titolare (dati account utenti) e Responsabile ex Art. 28 (dati sanitari dei pazienti dei periti) — esposizione potenziale comune |
| **Natura della violazione** | Potenziale esposizione di credenziali tecniche (environment variables), su due fronti: (a) incident infrastrutturale Vercel del 21/04/2026 — il progetto LegMed **non** rientrava nel sottoinsieme di clienti con compromissione confermata; (b) vulnerabilita CVE-2026-42047 (GHSA-2jf5-6wwv-vhxx) nel pacchetto `inngest` 3.22.0–3.53.1, che consentiva in teoria la divulgazione di `process.env` via metodi HTTP non standard sull'endpoint `/api/inngest`. Nessuna violazione di dati personali ai sensi dell'Art. 4(12) GDPR e stata accertata: l'eventuale compromissione avrebbe riguardato credenziali tecniche, con accesso ai dati personali solo come passaggio successivo, non evidenziato dai log |
| **Categorie di dati potenzialmente coinvolte** | Credenziali tecniche (`SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `MISTRAL_API_KEY`, chiavi Inngest/Upstash/Sentry). In ipotesi peggiore (non verificatasi): dati sanitari Art. 9 e dati account tramite uso illecito delle credenziali |
| **Categorie e numero di interessati** | Potenzialmente: pazienti referenziati nei casi e medici legali utenti. Numero effettivo: **zero accertati** (nessuna evidenza di accesso ai dati) |
| **Conseguenze probabili** | Nessuna conseguenza accertata per gli interessati. Rischio teorico residuo valutato basso-moderato e azzerato dalla rotazione completa delle credenziali e dalla disabilitazione delle chiavi legacy |
| **Misure adottate** | (1) Patch immediata CVE-2026-42047: upgrade `inngest` 3.52.3 → 3.54.2 (commit `79365eb`, 30/04/2026 14:29 CEST); (2) rotazione completa di 10 credenziali distinte / 13 entries (Mistral, Supabase, Postgres, Upstash, Inngest, Sentry); (3) migrazione API key Supabase a schema `publishable`/`secret` e **disabilitazione definitiva delle JWT legacy** (30/04/2026 16:11 CEST); (4) cancellazione credenziali di servizi non attivi (Stripe, Resend); (5) hardening: policy "Enforce Sensitive Environment Variables" + 2FA enforcement a livello team Vercel; (6) test funzionali completi post-rotazione |
| **Notifica al Garante (Art. 33)** | **NO — non dovuta.** Motivazione: assenza di violazione dei dati personali confermata ex Art. 4(12) GDPR (LegMed fuori dal subset compromesso Vercel; nessuna evidenza di sfruttamento della CVE nei log). Valutazione completa in Sez. 4 del documento di audit citato sotto. Riserva di rivalutazione in caso di nuove evidenze dall'audit log retroattivo |
| **Comunicazione agli interessati (Art. 34)** | **NO — non dovuta**, in conseguenza dell'assenza di violazione confermata |
| **Informativa ai titolari (Art. 33(2))** | Non dovuta in assenza di violazione confermata; precedente alla piena operativita commerciale della piattaforma |
| **Tempistica** | Rilevazione 21/04/2026 → contenimento completato 30/04/2026 16:11 CEST → documento di audit definitivo 01/05/2026. Termine 72h non attivato (nessuna violazione confermata) |
| **Follow-up** | Audit retroattivo dei log Vercel su `/api/inngest` (metodi `PATCH`/`OPTIONS`/`DELETE`, periodo 01/03–30/04/2026) con termine 31/05/2026 — esito atteso: zero invocazioni; ulteriori follow-up in Sez. 10 del documento di audit |
| **Riferimenti / evidenze** | Audit trail completo: `scratchpad/audit-rotazione-credenziali-vercel-incident-2026-04.md` (definitivo, v1.0, 01/05/2026); piano operativo: `scratchpad/plan-rotazione-credenziali-vercel-incident-2026-04.md`; commit Git `79365eb`; comunicazione Vercel 21/04/2026 (archivio email del Titolare) |
| **Stato** | **Chiusa — non violazione** (registrata in via prudenziale ai fini di accountability, come previsto dalla Sez. 4.3 del documento di audit) |

---

## 5. Template scheda (da copiare per ogni nuovo evento)

### BREACH-YYYY-NNN — [titolo sintetico]

| Campo | Contenuto |
|-------|-----------|
| **ID** | BREACH-YYYY-NNN |
| **Data e ora di rilevazione** | [data/ora, fuso orario] |
| **Modalita di rilevazione** | [Sentry / log / segnalazione utente / comunicazione sub-responsabile / audit interno / altro] |
| **Ruolo di LegMed** | [Titolare / Responsabile ex Art. 28 / entrambi] |
| **Natura della violazione** | [confidenzialita / integrita / disponibilita; descrizione di cosa e successo, vettore, sistemi coinvolti; indicare se confermata ex Art. 4(12)] |
| **Categorie di dati coinvolte** | [dati sanitari Art. 9 / dati account / credenziali tecniche / ...] |
| **Categorie e numero di interessati** | [pazienti / medici legali / terzi; numero esatto o stima] |
| **Conseguenze probabili** | [per gli interessati: discriminazione, danno reputazionale, perdita di controllo, ...] |
| **Misure adottate** | [contenimento + rimedio + prevenzione recidiva, con date] |
| **Notifica al Garante (Art. 33)** | [SI con data/protocollo — entro 72h? Se oltre: motivazione del ritardo / NO con motivazione documentata] |
| **Comunicazione agli interessati (Art. 34)** | [SI con data e modalita / NO con motivazione, incl. eventuale eccezione Art. 34(3)] |
| **Informativa ai titolari (Art. 33(2))** | [se LegMed = responsabile: data e modalita di informativa a ciascun perito-titolare coinvolto / Non applicabile] |
| **Tempistica** | [rilevazione → triage → contenimento → notifica; verificare rispetto delle 72h] |
| **Follow-up** | [azioni residue con scadenze] |
| **Riferimenti / evidenze** | [log, email, commit, documenti] |
| **Stato** | [In triage / In gestione / Chiusa / Chiusa — non violazione] |

---

## 6. Riferimenti normativi

- Art. 4(12) GDPR — definizione di "violazione dei dati personali"
- Art. 33 GDPR — notifica al Garante (commi 1-4) e documentazione (comma 5)
- Art. 34 GDPR — comunicazione agli interessati
- Art. 5(2) GDPR — accountability
- Guidelines 9/2022 EDPB on personal data breach notification under GDPR
- `docs/PROCEDURA-DATA-BREACH.md` — procedura operativa di risposta
- `docs/DPIA.md` — rischio R6 e misure 5.8

---

*Registro istituito il 10 giugno 2026 in attuazione dell'Art. 33(5) GDPR e della misura "Registro data breach" prevista dalla DPIA (Sez. 5.8).*
