# Piano implementazione — 6 Feature MedLav

## Overview

Sei feature indipendenti: section-level editing, mobile drawer, export history tracking, signature/watermark, autosave draft recovery, template quesiti. Tutte client-side o API-level, nessuna migrazione DB (usiamo audit_log + profiles JSONB esistenti). Ordine scelto per minimizzare conflitti tra feature.

---

## Feature 1: Section-Level Editing nel Report

### Obiettivo
Ogni sezione (## heading) nel report ha il suo bottone "Modifica" → apre editor solo per quella sezione → salvataggio individuale.

### File da modificare
- `src/app/(dashboard)/cases/[id]/report-a4-viewer.tsx` — aggiungere bottone edit per sezione
- `src/app/(dashboard)/cases/[id]/report-step.tsx` — gestire stato editing sezione
- `src/app/(dashboard)/cases/[id]/report-section-editor.tsx` — **NUOVO** — dialog editor per singola sezione
- `src/app/(dashboard)/actions/report-actions.ts` — nuova action `updateReportSection`
- `src/lib/section-parser-client.ts` — aggiungere `replaceSectionContent()` utility

### Strategia
1. `parseSections()` già splitta per `## heading` → conosciamo posizione di ogni sezione
2. Aggiungere `replaceSectionContent(fullMarkdown, sectionId, newContent)` in section-parser-client
3. `updateReportSection` server action: legge report attuale, chiama replaceSectionContent, salva
4. `ReportSectionEditor`: dialog con RichTextEditor, riceve solo il content della sezione
5. In `ReportA4Viewer`: bottone Pencil accanto al bottone regenerate (hover)

### Test
- `section-parser-client.test.ts` — test per `replaceSectionContent()`

---

## Feature 2: Mobile Navigation Drawer

### Obiettivo
La mobile sidebar ESISTE GIÀ (`src/components/mobile-sidebar.tsx`) con Sheet component. Verificare che sia completa e funzionale.

### Stato attuale
- `mobile-sidebar.tsx` (108 righe) — già implementata con Sheet, hamburger, nav items
- `layout.tsx` — già include MobileSidebar con header mobile
- **La feature è già implementata!** Solo possibili miglioramenti cosmetici.

### File da verificare/migliorare
- `src/components/mobile-sidebar.tsx` — aggiungere search se mancante, verificare parità con desktop
- Eventuale animazione/transizione migliorata

### Valutazione: SKIP o minor polish
La mobile sidebar con hamburger e drawer esiste già. Se l'utente conferma, possiamo saltare o fare solo polish.

---

## Feature 3: Track Export History

### Obiettivo
Quando l'utente esporta, salvare in audit_log con dettagli (formato, anonimizzato, report version). Mostrare "Ultimo export: DOCX, 2 ore fa" nella UI.

### File da modificare
- `src/app/api/cases/[id]/export/html/route.ts` — arricchire metadata in logAccess
- `src/app/api/cases/[id]/export/docx/route.ts` — arricchire metadata
- `src/app/api/cases/[id]/export/csv/route.ts` — arricchire metadata
- `src/app/api/cases/[id]/export/pct/route.ts` — AGGIUNGERE logAccess (bug fix: mancante!)
- `src/app/(dashboard)/actions/report-actions.ts` — nuova action `getLastExport(caseId)`
- `src/app/(dashboard)/cases/[id]/report-action-bar.tsx` — mostrare ultimo export

### Schema
Nessuna migrazione. Usiamo `audit_log.metadata` JSONB esistente con campi extra:
```json
{ "format": "docx", "anonymized": false, "reportVersion": 2, "reportStatus": "bozza" }
```

### Action `getLastExport`
Query audit_log WHERE action = 'report.exported' AND entity_id = caseId ORDER BY created_at DESC LIMIT 1.

### Test
- Unit test per `getLastExport` (mock Supabase)

---

## Feature 4: Signature/Watermark Support

### Obiettivo
1. Settings: upload immagine firma digitale → salvata su Supabase Storage
2. Export DOCX/HTML: firma in fondo + watermark "BOZZA" se non definitivo

### File da modificare
- `src/db/schema/profiles.ts` — aggiungere campo `signatureImagePath text`
- `src/app/(dashboard)/settings/page.tsx` — sezione upload firma
- `src/app/(dashboard)/settings/actions.ts` — nuove action uploadSignature, deleteSignature
- `src/services/export/html-export.ts` — includere firma + watermark "BOZZA"
- `src/services/export/docx-export.ts` — includere firma + watermark "BOZZA"

### Storage
Supabase Storage bucket: `signatures/{userId}/signature.png` (max 500KB, solo immagini)

### Watermark
- HTML: CSS watermark "BOZZA" (position: fixed, rotato, opacity 0.1)
- DOCX: header con testo "BOZZA" (già parzialmente supportato — da verificare)
- Condizione: report_status !== 'definitivo'

### DB migration
Aggiungere colonna `signature_image_path` a profiles. Drizzle migration.

### Test
- Test per logica watermark condizionale nell'export

---

## Feature 5: Autosave con Draft Recovery

### Obiettivo
Editor report: autosave ogni 30s in localStorage. Al riapertura, se draft > DB, proporre ripristino.

### File da modificare
- `src/app/(dashboard)/cases/[id]/report-dialog.tsx` — autosave logic + recovery prompt
- `src/lib/draft-storage.ts` — **NUOVO** — utility localStorage per draft

### Strategia
1. `draft-storage.ts`: `saveDraft(caseId, content, timestamp)`, `getDraft(caseId)`, `clearDraft(caseId)`
2. Key: `medlav-draft-${caseId}`
3. In ReportDialog: useEffect con setInterval 30s → saveDraft
4. Al mount, confronta draft.timestamp vs report.updated_at → se draft più recente, mostra banner
5. Banner: "Hai modifiche non salvate del [data]. Ripristinare?" con Sì/No
6. Su Salva: clearDraft

### Test
- `draft-storage.test.ts` — unit test per save/get/clear

---

## Feature 6: Template Quesiti per Specialità

### Obiettivo
Nel perizia form, sezione Quesiti, bottone "Carica template" → dropdown per specialità → precompila quesiti.

### File da modificare
- `src/lib/domain-knowledge/types.ts` — aggiungere `commonQuesiti?: readonly string[]` a CaseTypeKnowledge
- `src/lib/domain-knowledge/case-type/*.ts` — aggiungere commonQuesiti a tutti i 13 tipi
- `src/lib/domain-knowledge/index.ts` — esportare `getQuestiTemplates(caseType)`
- `src/app/(dashboard)/cases/[id]/perizia-form.tsx` — bottone "Carica template" + dropdown

### Template quesiti per tipo
Ogni tipo di caso avrà 3-5 quesiti standard del giudice. Esempio ortopedica:
1. "Accerti il CTU, visitato il periziando, esaminata la documentazione..."
2. "Indichi se vi sia stato un comportamento colposo..."
3. "Quantifichi il danno biologico permanente..."

### Test
- Test per `getQuestiTemplates` in domain-knowledge
- Verificare che tutti i 13 tipi abbiano commonQuesiti

---

## Ordine di implementazione

1. **Feature 6** — Template quesiti (indipendente, domain-knowledge)
2. **Feature 1** — Section-level editing (core editor)
3. **Feature 5** — Autosave draft recovery (dipende da editor)
4. **Feature 3** — Track export history (API + UI)
5. **Feature 4** — Signature/watermark (settings + export + DB migration)
6. **Feature 2** — Mobile drawer (verifica/polish, già esistente)

## Rischi

- **Section editing**: ricostruzione markdown deve preservare whitespace/newline esatte
- **Signature upload**: GDPR — firma è dato personale, storage sicuro
- **Autosave**: race condition tra autosave e salvataggio manuale
- **Export tracking**: non rallentare l'export (logAccess è già fire-and-forget)

## GDPR
- Firma digitale: dato personale, storage EU, cancellabile su richiesta
- Audit log export: no dati clinici nei metadata (solo formato, versione)
- Draft localStorage: dati clinici client-side, ma effimeri e su dispositivo utente
