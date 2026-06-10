# Procedura di Risposta alle Violazioni di Dati Personali (Data Breach)

## ai sensi degli Artt. 33-34 del Regolamento (UE) 2016/679 (GDPR)

| Campo | Valore |
|-------|--------|
| **Organizzazione** | LegMed S.r.l. |
| **Referente privacy (DPO)** | privacy@legmed.it |
| **Data formalizzazione** | 10 giugno 2026 |
| **Versione** | 1.0 |
| **Classificazione** | RISERVATO — Uso interno e DPO |
| **Registro collegato** | `docs/REGISTRO-DATA-BREACH.md` |
| **DPIA collegata** | `docs/DPIA.md` (rischio R6, misure 5.8) |
| **Revisione** | Annuale, o dopo ogni incidente, o a ogni modifica rilevante dello stack |

---

## 1. Scopo e ambito

Questa procedura definisce **chi fa cosa, entro quando e con quali strumenti** quando si sospetta o si accerta una violazione di dati personali sulla piattaforma LegMed. Copre l'intero ciclo: rilevazione → triage → contenimento → valutazione del rischio → notifica → comunicazione → registrazione → post-mortem.

LegMed tratta **dati sanitari ex Art. 9 GDPR** (documentazione clinica dei pazienti dei periti): ogni evento va trattato con presunzione di gravita finche il triage non dimostra il contrario.

### 1.1 Doppio ruolo di LegMed — due binari di notifica

| Trattamento | Ruolo LegMed | Obbligo in caso di violazione |
|-------------|--------------|-------------------------------|
| Dati sanitari dei pazienti caricati dai periti | **Responsabile** ex Art. 28 (il perito e titolare autonomo) | **Informare il perito-titolare senza ingiustificato ritardo** ex Art. 33(2) e assisterlo nella sua eventuale notifica al Garante e comunicazione agli interessati (i pazienti) |
| Dati degli utenti della piattaforma (account, fatturazione, log) | **Titolare** | Notifica diretta al Garante entro **72 ore** ex Art. 33(1), se ricorrono i presupposti; comunicazione agli interessati ex Art. 34 se rischio elevato |

Quasi tutti gli scenari realistici (compromissione database, leak applicativo, credenziali rubate) coinvolgono **entrambi i binari contemporaneamente**: vanno percorsi in parallelo.

### 1.2 Definizioni

**Violazione dei dati personali** (Art. 4(12) GDPR): violazione di sicurezza che comporta accidentalmente o in modo illecito la distruzione, la perdita, la modifica, la divulgazione non autorizzata o l'accesso ai dati personali. Tre tipologie (Guidelines EDPB 9/2022):

- **Confidenzialita**: divulgazione o accesso non autorizzato (es. leak su link pubblico, account compromesso, esfiltrazione DB);
- **Integrita**: alterazione non autorizzata (es. modifica fraudolenta di eventi clinici o report);
- **Disponibilita**: perdita di accesso o distruzione (es. ransomware, cancellazione accidentale senza backup).

Un evento di sicurezza **senza** accesso/perdita/alterazione di dati personali (es. esposizione di sole credenziali tecniche poi ruotate, vulnerabilita non sfruttata) **non e una violazione** ex Art. 4(12), ma va comunque registrato in via prudenziale nel registro.

---

## 2. Ruoli e responsabilita

**Stato attuale (team di 1)**: il founder ricopre tutti i ruoli. Le caselle sono predisposte per l'assegnazione quando il team crescera. Ogni ruolo va riassegnato per iscritto aggiornando questa tabella.

| Ruolo | Responsabilita | Assegnatario oggi | Assegnatario futuro |
|-------|---------------|-------------------|---------------------|
| **Incident Manager** | Dirige la risposta, decide il contenimento, tiene la timeline, dichiara la chiusura | Founder | [da assegnare] |
| **Responsabile Tecnico** | Esegue il playbook di contenimento (Sez. 5), raccoglie log ed evidenze forensi | Founder | [da assegnare] |
| **DPO / Referente privacy** | Valuta la qualificazione giuridica (e violazione? rischio?), prepara la notifica al Garante e l'informativa ai titolari, aggiorna il registro | Founder (alias privacy@legmed.it) | [da assegnare / DPO esterno] |
| **Comunicazione** | Contatti con periti-titolari, utenti, eventuali interessati e stampa | Founder | [da assegnare] |
| **Consulente legale** | Validazione di notifiche e comunicazioni nei casi gravi o ambigui | [studio legale da convenzionare] | [da assegnare] |

**Regola di reperibilita**: in caso di sospetta violazione la risposta inizia **appena possibile e comunque entro 24 ore** dalla rilevazione. Il termine di 72 ore per la notifica al Garante decorre dal momento in cui il titolare **viene a conoscenza** della violazione (Art. 33(1)): documentare sempre data e ora di rilevazione e di conferma.

---

## 3. Fase 1 — Rilevazione

Canali di rilevazione attivi:

| Canale | Cosa segnala | Dove |
|--------|--------------|------|
| Sentry | Errori applicativi anomali, pattern sospetti | Dashboard Sentry (ingest EU) |
| Log Vercel | Richieste anomale, picchi, metodi HTTP inattesi | Pannello Vercel → Logs / Activity |
| Log e Auth Supabase | Accessi anomali al DB, query con service key, login sospetti | Pannello Supabase → Logs / Auth |
| Audit log applicativo | Azioni utente tracciate (export, view, cancellazioni) | Tabella `audit_log` |
| Comunicazione di sub-responsabile | Incident dei fornitori (precedente: Vercel 21/04/2026) | Email registrate presso i fornitori |
| Segnalazione utente/terzi | Report di vulnerabilita o esposizione | privacy@legmed.it |
| Advisory di sicurezza | CVE su dipendenze (precedente: CVE-2026-42047) | Build Vercel, GitHub advisories, `pnpm audit` |

**Azione immediata di chi rileva**: annotare data/ora esatta, fonte, cosa si e osservato. Aprire subito una scheda `In triage` nel registro (`docs/REGISTRO-DATA-BREACH.md`). Non cancellare nulla: log e evidenze servono all'analisi forense.

---

## 4. Fase 2 — Triage (entro 24 ore dalla rilevazione)

Rispondere per iscritto, nella scheda del registro, a queste domande:

1. **E una violazione ex Art. 4(12)?** C'e evidenza (o probabilita concreta) di accesso, divulgazione, perdita, alterazione o distruzione di dati personali? Oppure e un evento di sicurezza senza impatto sui dati (vulnerabilita non sfruttata, credenziali esposte ma non usate)?
2. **Quali dati?** Dati sanitari Art. 9 (pazienti)? Dati account (periti)? Solo credenziali tecniche o metadati?
3. **Quali sistemi?** Database, Storage, API, sessioni, ambiente di hosting, fornitore terzo?
4. **Quanti interessati?** Un caso, un utente, tutti?
5. **E in corso?** L'attaccante ha ancora accesso? Il leak e ancora esposto?
6. **C'e rischio per i diritti e le liberta degli interessati?** (valutazione preliminare, raffinata in Fase 4)

**Esiti del triage:**

| Esito | Azione |
|-------|--------|
| Evento non rilevante (falso allarme) | Chiudere la scheda con motivazione |
| Evento di sicurezza, non violazione | Eseguire comunque il contenimento utile (Fase 3), valutazione documentata (Fase 4), registrazione prudenziale (Fase 7) — precedente: BREACH-2026-001 |
| Violazione confermata o probabile | Proseguire con TUTTE le fasi. Il countdown delle 72h e partito |

---

## 5. Fase 3 — Contenimento (playbook per lo stack LegMed)

Obiettivo: **fermare l'emorragia prima di capire tutto**. Eseguire solo le azioni pertinenti allo scenario; ogni azione con data/ora nella timeline della scheda.

### 5.1 Azioni applicative immediate (minuti)

| Azione | Come | Quando usarla |
|--------|------|---------------|
| Disattivare la condivisione via link pubblico | `PUBLIC_SHARING_ENABLED = false` in `src/lib/constants.ts` + deploy (gia `false` di default dal 2026-06-10) | Leak su pagine condivise |
| Mettere offline l'applicazione | Pannello Vercel → pausa deployment / Deployment Protection, oppure deploy di una maintenance page | Compromissione attiva dell'app |
| Invalidare tutte le sessioni utente | Pannello Supabase → Auth (sign-out globale); per invalidazione totale: rotazione del JWT signing key (NB: slogga tutti gli utenti) | Sessioni o token compromessi |
| Bloccare un singolo account | Pannello Supabase → Auth → ban utente | Account utente compromesso |

### 5.2 Revoca e rotazione credenziali (ore) — in ordine di criticita

Procedura collaudata: l'intera rotazione e gia stata eseguita il 30/04/2026 con passi dettagliati e tempi reali in `scratchpad/audit-rotazione-credenziali-vercel-incident-2026-04.md` (Sez. 7) — **usarla come guida operativa passo-passo**.

| # | Credenziale | Dove ruotare | Note operative |
|---|-------------|--------------|----------------|
| 1 | Supabase `sb_secret_*` / `sb_publishable_*` | Pannello Supabase → Settings → API Keys | Bypass RLS: la piu critica. Aggiornare poi `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` su Vercel + redeploy |
| 2 | Password Postgres (`DATABASE_URL`) | Pannello Supabase → Settings → Database | Usata solo da drizzle-kit (non runtime), ma da' accesso diretto al DB |
| 3 | `MISTRAL_API_KEY` | console.mistral.ai → API Keys | Creare nuova, aggiornare Vercel, redeploy, revocare la vecchia |
| 4 | `INNGEST_SIGNING_KEY` | Pannello Inngest | Procedura zero-downtime con `INNGEST_SIGNING_KEY_FALLBACK` (vedi audit apr 2026, Sez. 7.5) |
| 5 | `INNGEST_EVENT_KEY` | Pannello Inngest | Creare nuova key, aggiornare Vercel, cancellare la vecchia |
| 6 | `UPSTASH_REDIS_REST_URL` / `_TOKEN` | console.upstash.com | In alternativa creare un nuovo database in eu-central-1 e migrare |
| 7 | `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | dashboard.stripe.com → Developers → API Keys (roll key) | Rigenerare anche il webhook signing secret |
| 8 | `RESEND_API_KEY` | resend.com → API Keys | Revocare e ricreare |
| 9 | `SENTRY_AUTH_TOKEN` | Pannello Sentry → Auth Tokens | Solo build-time (source map) |

**Per ogni rotazione**: aggiornare la variabile su Vercel (flag Sensitive) → redeploy senza cache → verifica funzionale (login + apertura caso + pipeline di test) → revoca della credenziale vecchia.

### 5.3 Preservazione delle evidenze

- Esportare/screenshottare i log rilevanti (Vercel, Supabase, Sentry, Upstash) **prima** che scadano le retention (log tecnici LegMed: 90 giorni; verificare le retention dei fornitori);
- Annotare hash dei commit di eventuali fix;
- Conservare le comunicazioni dei fornitori;
- Non modificare/cancellare dati nel DB oggetto di indagine se non per contenimento.

---

## 6. Fase 4 — Valutazione del rischio per gli interessati

Determina **se** notificare al Garante (rischio non improbabile) e **se** comunicare agli interessati (rischio elevato). Metodologia semplificata da Guidelines EDPB 9/2022 ed ENISA.

### 6.1 Matrice

**Gravita potenziale** (per gli interessati):

| Livello | Criteri indicativi |
|---------|--------------------|
| 1 — Trascurabile | Dati gia pubblici o tecnici, nessun dato personale leggibile (es. cifrati con chiave non compromessa) |
| 2 — Limitata | Dati personali comuni, pochi interessati, basso potenziale di abuso |
| 3 — Significativa | Dati personali su molti interessati, o dati che consentono frode/danno reputazionale |
| 4 — Massima | **Dati sanitari Art. 9** leggibili, anche di un solo paziente: discriminazione, danno reputazionale, impatto su procedimenti giudiziari |

**Probabilita che il rischio si concretizzi:**

| Livello | Criteri indicativi |
|---------|--------------------|
| 1 — Trascurabile | Nessuna evidenza di accesso; esposizione teorica chiusa subito |
| 2 — Bassa | Esposizione breve, nessun indizio di esfiltrazione, dati pseudonimizzati |
| 3 — Media | Accesso accertato ma portata limitata o attore noto/benevolo |
| 4 — Alta | Esfiltrazione accertata, attore malevolo, dati gia in circolazione |

**Rischio = Gravita x Probabilita:**

| Punteggio | Esito | Obblighi |
|-----------|-------|----------|
| 1–2 | Rischio improbabile | Niente notifica (Art. 33(1) ultimo periodo). Solo registrazione con motivazione |
| 3–8 | Rischio | **Notifica al Garante entro 72h** (binario titolare) e/o informativa ai titolari (binario responsabile) |
| 9–16 | Rischio elevato | Notifica al Garante **+ comunicazione agli interessati** ex Art. 34 |

**Regola pratica**: se dati sanitari leggibili sono stati acceduti o esfiltrati da non autorizzati, il rischio e **sempre almeno "rischio"** e quasi sempre "elevato". In dubbio, notificare: la notifica prudenziale non e sanzionata, l'omessa notifica si.

### 6.2 Fattori correttivi

- Pseudonimizzazione efficace (solo iniziali pazienti come campo strutturato) puo ridurre la gravita — ma il testo OCR e i report contengono dati clinici in chiaro: valutare cosa e stato effettivamente esposto;
- Cifratura con chiavi NON compromesse riduce la probabilita a trascurabile;
- Contenimento rapido e attore identificato/affidabile riducono la probabilita.

---

## 7. Fase 5 — Notifica al Garante (entro 72 ore)

### 7.1 Binario "LegMed titolare" (dati account utenti)

- **Canale**: procedura telematica del Garante per la Protezione dei Dati Personali — portale dei servizi online, sezione "Notifica violazione dati personali": `https://servizi.gpdp.it/databreach/s/` (disponibile anche lo strumento di autovalutazione del Garante per decidere se notificare). Verificare l'URL corrente su `https://www.garanteprivacy.it`;
- **Termine**: 72 ore dalla conoscenza della violazione. Se si notifica oltre, motivare il ritardo (Art. 33(1));
- **Notifica per fasi** (Art. 33(4)): se non si hanno tutte le informazioni entro 72h, inviare una notifica preliminare e integrarla appena possibile. **Non aspettare di avere tutto.**

**Contenuto minimo ex Art. 33(3):**

1. Natura della violazione, comprese, ove possibile, le categorie e il numero approssimativo di interessati e di registrazioni coinvolte;
2. Nome e dati di contatto del DPO o altro punto di contatto (privacy@legmed.it);
3. Descrizione delle probabili conseguenze della violazione;
4. Misure adottate o proposte per porre rimedio e attenuare i possibili effetti negativi.

### 7.2 Binario "LegMed responsabile" (dati sanitari dei pazienti)

- **Informare ogni perito-titolare coinvolto senza ingiustificato ritardo** (Art. 33(2)) — obiettivo interno: **entro 24 ore** dalla conferma, per lasciare al titolare margine sulle sue 72 ore;
- **Canale**: email all'indirizzo di registrazione del perito + eventuale telefono; conservare prova dell'invio;
- **Contenuto**: le stesse 4 voci dell'Art. 33(3), piu: quali casi/documenti del perito sono coinvolti, cosa ha gia fatto LegMed (contenimento), cosa deve valutare il titolare (notifica al Garante, comunicazione ai propri pazienti);
- **Assistenza**: LegMed fornisce al titolare ogni informazione necessaria per la sua notifica (obbligo di assistenza ex Art. 28(3)(f) richiamato nel DPA cliente — `docs/DPA-CLIENTE-TEMPLATE.md`).

### 7.3 Notifiche da/verso sub-responsabili

Se la violazione origina da un sub-responsabile (Supabase, Mistral, Vercel, ecc.), pretendere la notifica contrattuale prevista dai rispettivi DPA e incorporarne i contenuti nelle proprie notifiche. Le 72 ore di LegMed decorrono comunque dalla **propria** conoscenza.

---

## 8. Fase 6 — Comunicazione agli interessati (Art. 34)

Dovuta quando la violazione comporta un **rischio elevato** per i diritti e le liberta delle persone fisiche.

**ATTENZIONE — chi sono gli interessati**: per i dati sanitari, gli interessati sono i **pazienti dei periti** (e i terzi citati nella documentazione), NON solo i periti. LegMed **non ha un canale diretto verso i pazienti e non e il loro titolare**: la comunicazione ex Art. 34 ai pazienti **spetta al perito-titolare**. LegMed:

1. Segnala al titolare, nell'informativa ex Art. 33(2), se a proprio giudizio il rischio e elevato e la comunicazione agli interessati appare dovuta;
2. Fornisce al titolare una bozza di comunicazione (linguaggio semplice e chiaro: natura della violazione, contatto, probabili conseguenze, misure adottate — Art. 34(2));
3. Per i dati di cui LegMed e titolare (account periti): comunica direttamente agli utenti via email, senza ingiustificato ritardo.

**Eccezioni** (Art. 34(3)) — la comunicazione non e dovuta se: (a) i dati erano protetti da misure che li rendono incomprensibili (es. cifratura con chiave non compromessa); (b) misure successive hanno scongiurato il rischio elevato; (c) richiederebbe sforzi sproporzionati (in tal caso: comunicazione pubblica). L'eventuale ricorso a un'eccezione va motivato per iscritto nel registro.

---

## 9. Fase 7 — Registrazione

Ogni evento — violazione o meno, notificato o meno — si chiude con la scheda completa in `docs/REGISTRO-DATA-BREACH.md` (Art. 33(5)): natura, interessati, conseguenze, misure, decisioni di notifica/comunicazione **con motivazione**, timeline, riferimenti alle evidenze. La scheda e l'artefatto che il Garante chiedera per primo: scriverla come se dovesse essere letta da un ispettore.

---

## 10. Fase 8 — Post-mortem (entro 14 giorni dalla chiusura)

1. **Root cause analysis**: perche e successo? Perche non e stato rilevato prima?
2. **Azioni preventive**: fix tecnici, nuove misure, monitoring aggiuntivo — con scadenze e responsabile;
3. **Aggiornamento documenti**: DPIA (`docs/DPIA.md` — l'incident e trigger di revisione ex Sez. 8.1), questa procedura se ha mostrato lacune, regole in `.claude/rules/security.md` se pertinenti;
4. **Verifica follow-up**: le azioni restano aperte nella scheda del registro finche completate.

---

## 11. Precedente applicativo — incident aprile 2026

La risposta all'incident Vercel del 21/04/2026 + CVE-2026-42047 (30/04/2026) e il **precedente di riferimento** di questa procedura ed e documentata in modo completo in:

- `scratchpad/audit-rotazione-credenziali-vercel-incident-2026-04.md` — audit trail definitivo (analisi rischio Art. 32, valutazione obbligo di notifica Artt. 33-34, cronologia operativa con tempi reali di ogni rotazione, test post-intervento);
- `scratchpad/plan-rotazione-credenziali-vercel-incident-2026-04.md` — piano operativo;
- Scheda **BREACH-2026-001** in `docs/REGISTRO-DATA-BREACH.md`.

Esito: nessuna violazione confermata ex Art. 4(12), notifica al Garante non dovuta, rotazione completa delle credenziali in ~2 ore di lavoro effettivo. Le sezioni 7.x dell'audit trail fungono da **runbook collaudato** per la Fase 3 (contenimento) di questa procedura.

---

## 12. Test e manutenzione della procedura

- **Revisione annuale** (insieme alla DPIA) e dopo ogni incidente;
- **Tabletop exercise** almeno annuale: simulare a tavolino uno scenario (es. "service key Supabase pubblicata per errore in un repo pubblico") e percorrere le fasi misurando i tempi;
- **Verifica trimestrale dei riferimenti**: contatti dei fornitori, URL del servizio telematico del Garante, validita degli accessi ai pannelli (Supabase, Vercel, Mistral, Inngest, Upstash, Stripe, Resend, Sentry);
- Aggiornare la tabella dei ruoli (Sez. 2) a ogni ingresso nel team.

---

## 13. Riferimenti normativi e tecnici

- Art. 4(12), 33, 34 GDPR; Art. 28(3)(f) GDPR (assistenza del responsabile al titolare)
- Guidelines 9/2022 EDPB on personal data breach notification under GDPR
- ENISA — Recommendations for a methodology of the assessment of severity of personal data breaches
- Garante Privacy — pagina informativa data breach e servizio telematico di notifica (`https://www.garanteprivacy.it`, `https://servizi.gpdp.it/databreach/s/`)
- `docs/DPIA.md` — rischio R6, misure 5.8
- `docs/REGISTRO-DATA-BREACH.md` — registro ex Art. 33(5)
- `docs/DPA-CLIENTE-TEMPLATE.md` — obblighi di notifica verso i titolari
- `docs/DPA-MISTRAL.md` — obblighi di notifica del sub-responsabile Mistral
- `docs/BACKUP-STRATEGY.md` — ripristino disponibilita (violazioni di disponibilita)

---

*Procedura formalizzata il 10 giugno 2026 in attuazione delle misure "Procedura di notifica" e "Incident response plan" previste dalla DPIA (Sez. 5.8).*
