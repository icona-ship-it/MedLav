# Elenco dei sub-responsabili del trattamento

> ⚠️ **BOZZA — da validare con consulenza legale prima della pubblicazione.**
>
> Elenco destinato alla pubblicazione (pagina pubblica e Allegato C del DPA con i
> clienti). Prima della pubblicazione: verificare ogni riga marcata
> **[DA VERIFICARE]**, controllare che i link ai DPA dei fornitori siano correnti e
> allineare l'elenco con `docs/DPIA.md` (sezione 2.6) e con il DPA cliente.

**Data bozza**: 2026-07-04 · **Versione**: 0.1-draft

---

LegMed S.r.l. agisce come **responsabile del trattamento** (Art. 28 GDPR) per conto dei propri clienti (medici legali, titolari del trattamento). Per erogare il servizio, LegMed si avvale dei seguenti **sub-responsabili**. I dati clinici (categoria particolare, Art. 9 GDPR) sono trattati esclusivamente dai fornitori indicati nella prima tabella; i fornitori della seconda tabella trattano solo dati tecnici, di contatto o di fatturazione.

## Sub-responsabili che trattano dati clinici

| Fornitore | Servizio | Sede del trattamento | Garanzie | DPA pubblico |
|-----------|----------|----------------------|----------|--------------|
| Supabase Inc. | Database PostgreSQL, storage documenti, autenticazione | Francoforte, Germania (eu-central-1) | DPA; SCC per la sede legale extra-UE; ISO 27001, SOC 2 Type II | <https://supabase.com/legal/dpa> |
| Mistral AI SAS | Elaborazione AI: OCR (`mistral-ocr-latest`), estrazione e sintesi (`mistral-large-2512`), embedding (`mistral-embed`), analisi immagini (`mistral-large-2512`) | Francia (EU) — società di diritto francese, nessun trasferimento extra-UE | DPA; ISO 27001, ISO 27701, SOC 2 Type II; no training sui dati (opt-out verificato in console 2026-07-05); retention operativa secondo DPA — ZDR non disponibile sul piano corrente, non dichiarare "zero retention" | <https://mistral.ai/terms/#data-processing-agreement> |
| Vercel Inc. | Hosting applicazione web e funzioni serverless | Francoforte, Germania (regione fra1) | DPA; SCC per la sede legale extra-UE; ISO 27001, SOC 2 Type II | <https://vercel.com/legal/dpa> |
| Cloudflare Inc. | Backup off-site cifrati (R2, giurisdizione EU) — i dati sono cifrati lato LegMed (GPG AES-256) prima dell'upload | EU (bucket con giurisdizione EU vincolata) **[DA VERIFICARE: servizio in attivazione — confermare prima della pubblicazione]** | DPA; SCC | <https://www.cloudflare.com/cloudflare-customer-dpa/> |

## Sub-responsabili che NON trattano dati clinici

| Fornitore | Servizio | Dati trattati | Sede del trattamento | Garanzie | DPA pubblico |
|-----------|----------|---------------|----------------------|----------|--------------|
| Inngest Inc. | Orchestrazione elaborazioni asincrone | Solo metadati tecnici: ID caso, stato dell'elaborazione | **[DA VERIFICARE: regione — control plane presumibilmente USA]** | DPA **[DA VERIFICARE]**; SCC se extra-UE | **[DA VERIFICARE: link DPA Inngest]** |
| Upstash Inc. | Rate limiting (Redis) | Solo identificativi tecnici e contatori | EU **[DA VERIFICARE: regione del database Redis]** | DPA **[DA VERIFICARE]**; SCC se extra-UE | <https://upstash.com/trust> **[DA VERIFICARE]** |
| Resend (Plus Five Five Inc.) | Email transazionali (notifiche di completamento) | Indirizzo email del professionista, codice caso — nessun contenuto clinico | **[DA VERIFICARE: regione — presumibilmente USA/AWS]** | DPA **[DA VERIFICARE]**; SCC se extra-UE | **[DA VERIFICARE: link DPA Resend]** |
| Functional Software Inc. (Sentry) | Monitoraggio errori applicativi | Stacktrace ed errori tecnici, log sanitizzati — nessun dato clinico | EU **[DA VERIFICARE: data residency EU dell'organizzazione Sentry]** | DPA; SCC se extra-UE | <https://sentry.io/legal/dpa/> |
| Stripe Payments Europe Ltd. / Stripe Inc. | Pagamenti e fatturazione | Dati di fatturazione del professionista — nessun dato clinico | Irlanda/EU e USA **[DA VERIFICARE: entità contrattuale e flussi]** | DPA; SCC; PCI-DSS | <https://stripe.com/legal/dpa> |

---

## Procedura di aggiornamento dell'elenco

In linea con l'Art. 28(2) GDPR e con le indicazioni dell'EDPB (Opinion 22/2024 sui responsabili e sub-responsabili):

1. **Elenco pubblico e specifico**: questo elenco identifica ogni sub-responsabile per nome, servizio svolto e sede del trattamento. È referenziato dal DPA con i clienti (autorizzazione scritta generale con lista allegata).
2. **Notifica preventiva**: ogni aggiunta o sostituzione di un sub-responsabile è comunicata ai clienti **con almeno 30 giorni di preavviso [DA COMPLETARE CON LEGALE: termine da allineare al DPA]** via email all'indirizzo dell'account, prima che il nuovo fornitore tratti dati per conto dei clienti.
3. **Diritto di obiezione**: il cliente può opporsi per iscritto entro il termine di preavviso, per motivi ragionevoli e documentati attinenti alla protezione dei dati. In caso di obiezione non risolvibile, il cliente può recedere dal servizio per la parte interessata, con cancellazione o restituzione dei dati secondo il DPA.
4. **Stesse garanzie a cascata**: LegMed impone a ogni sub-responsabile, per contratto, obblighi di protezione dati equivalenti a quelli assunti verso i propri clienti (Art. 28(4) GDPR), e resta pienamente responsabile verso il cliente dell'operato dei sub-responsabili.
5. **Verifica periodica**: le garanzie (DPA, SCC, certificazioni) sono riverificate almeno una volta l'anno e a ogni rinnovo contrattuale; la data dell'ultima verifica è riportata in coda a questo documento.

**Ultima verifica dell'elenco**: [DA COMPLETARE — data della prima verifica formale]

**Registro modifiche**

| Data | Modifica |
|------|----------|
| 2026-07-04 | Prima bozza (0.1-draft) |
