# MedLav — TODO per Prodotto World-Class

Ultimo aggiornamento: 2026-03-13

## PRIORITA CRITICA (blocca revenue o compliance)

### Legale & Pagamenti
- [ ] **Terms of Service** — testo da avvocato italiano specializzato in SaaS sanitario
- [ ] **Privacy Policy** — testo GDPR-compliant con informativa Art. 13/14
- [ ] **Stripe live** — configurare account, decidere pricing, testare checkout end-to-end
- [ ] **Decisione pricing** — suggerito: trial 14gg gratuito, poi EUR 49/mese illimitato o EUR 9.99/mese + EUR 2.99/caso

### Validazione prodotto
- [ ] **Beta tester** — trovare 5-10 medici legali reali, dare accesso gratuito
- [ ] **Processare 20+ perizie reali** — calibrare prompt, soglie anomalie, tono report
- [ ] **Head-to-head con Docsy** — processare stesso caso su entrambi, confrontare output
- [ ] **Raccolta feedback qualitativo** — interviste con utenti su: usabilità, qualità report, feature mancanti

### Database migration
- [ ] **Eseguire migration** — `pnpm db:generate && pnpm db:migrate` per colonna `generation_metadata` su reports

---

## PRIORITA ALTA (differenziante competitivo)

### Report Quality
- [ ] **Calibrazione prompt su casi reali** — dopo beta testing, iterare su prompt in base a feedback
- [ ] **Validazione LLM post-generazione** — secondo pass con Mistral che verifica: tutti gli eventi coperti? fatti inventati? conclusioni supportate?
- [ ] **Diff view per rigenerazione sezioni** — mostrare cosa è cambiato rispetto alla versione precedente
- [ ] **Copertura eventi visibile all'utente** — mostrare % eventi citati nel report (già calcolato, non esposto in UI)

### UX Professionale
- [ ] **WYSIWYG editor** — TipTap o Novel al posto di markdown textarea (richiede dipendenza esterna)
- [ ] **Onboarding wizard migliorato** — video tutorial, tooltip contestuali, help in-app
- [ ] **Paginazione lista casi** — per utenti con 100+ casi
- [ ] **Date picker italiano** — DD/MM/YYYY nel form perizia (ora usa default browser)
- [ ] **Calcoli ITT/ITP editabili** — UI per correzione manuale delle date che il sistema ha sbagliato

### Export
- [ ] **Intestazione personalizzabile** — logo studio, indirizzo, recapiti nel DOCX/HTML
- [ ] **Interruzioni di pagina** — tra sezioni principali nel DOCX
- [ ] **Interlinea 1.5** — requisito tribunali per perizie CTU
- [ ] **Font Times New Roman 12pt** — standard per documenti giudiziari nel DOCX
- [ ] **Firma digitale** — integrazione con SPID o certificato qualificato (richiede servizio terzo)

---

## PRIORITA MEDIA (fidelizzazione utenti)

### Domain Features
- [ ] **Mapping quesiti → sezioni report (automatico)** — l'API /api/cases/[id]/quesito esiste, manca l'integrazione automatica nella generazione report
- [ ] **Barème SIMLA digitalizzato** — tabelle danno biologico integrate nei calcoli
- [ ] **Esame obiettivo strutturato** — UI dedicata per inserimento esame obiettivo per distretto anatomico
- [ ] **Template intestazione per studio** — salvare intestazione predefinita nelle settings
- [ ] **Ricerca full-text cross-casi** — cercare parole chiave in tutti i casi dell'utente

### Sicurezza & Compliance
- [ ] **RLS policies versionati** — esportare SQL da Supabase, committare in `db/rls/`
- [ ] **Audit log per operazioni admin** — tracciare ogni query admin con user, timestamp, azione
- [ ] **2FA/MFA** — secondo fattore di autenticazione per account premium
- [ ] **HSTS header** — Strict-Transport-Security nel middleware
- [ ] **Validazione magic bytes file** — non fidarsi solo dell'estensione, controllare i primi byte del file
- [ ] **Soft deletes su casi** — `deleted_at` timestamp, recupero entro 30gg, poi hard delete

### Testing
- [ ] **E2E test completo** — upload PDF → OCR → estrazione → report → export DOCX (Playwright)
- [ ] **Integration test pipeline Inngest** — usare inngest-testing per testare il flusso completo
- [ ] **Test scenari errore** — API failure, timeout, rate limit, risposte malformate
- [ ] **Visual regression test export** — screenshot DOCX/HTML, confronto pixel

---

## PRIORITA BASSA (post product-market fit)

### Crescita
- [ ] **Team/studio management** — inviti, ruoli (admin/membro), case sharing tra utenti
- [ ] **API pubblica** — per integrazioni B2B (studi legali, assicurazioni)
- [ ] **SSO enterprise** — OAuth/SAML per ospedali e grandi studi
- [ ] **Multi-lingua documenti** — supporto casi cross-border
- [ ] **Fine-tuning Mistral** — quando ci sono 500+ casi reali processati
- [ ] **Redazione documenti pre-upload** — anonimizzazione automatica per ospedali

### Certificazioni
- [ ] **ISO 27001** — certificazione sicurezza informazioni
- [ ] **Penetration testing** — audit esterno da azienda specializzata
- [ ] **Partnership SIMLA/AIMEF** — validazione scientifica
- [ ] **Integrazione PCT** — invio telematico tribunali
- [ ] **White-label per assicurazioni** — multi-tenant avanzato

---

## COMPLETATI (sessione corrente, 2026-03-13)

- [x] Fix bug post-conferma classificazione (processing_status)
- [x] Upload UX: label "Tipo documento", dropdown più grande, hint "altro"
- [x] Classificazione AI su tutti i doc per metadata + mismatch warning
- [x] Warning "altro" e mismatch nella classification review
- [x] Prompt versioning con SHA-256 hash (generation_metadata su reports)
- [x] Quesiti del giudice nel form perizia (input + salvataggio + integrazione prompt)
- [x] Perizia form con descrizioni campi (helper text)
- [x] DOCX export: blocco firma, margini 1", numerazione pagine standard
- [x] Editor report side-by-side (markdown + preview live)
- [x] Anteprima export nel dropdown
- [x] Skeleton loaders (ReportSkeleton, EventsSkeleton, DocumentsSkeleton)
- [x] User-friendly error messages (toUserMessage)
- [x] Test aggiornati (361 pass)
- [x] Documentazione aggiornata (ROADMAP, ADR-011)
