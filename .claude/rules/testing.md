---
description: Strategie e convenzioni di testing per MedLav
globs: ["src/**/*.test.*", "src/**/*.spec.*", "tests/**/*", "e2e/**/*"]
---

## Framework

- Unit/Integration: Vitest
- E2E: Playwright
- Coverage minima: 80% su business logic, 100% su auth e sicurezza

## TDD Workflow (OBBLIGATORIO)

1. **RED**: Scrivi il test PRIMA — deve FALLIRE
2. **GREEN**: Scrivi implementazione MINIMA per far passare il test
3. **REFACTOR**: Migliora il codice mantenendo i test verdi
4. Ripeti

## Convenzioni

- Pattern AAA: Arrange, Act, Assert
- Naming: `should [expected behavior] when [condition]`
- Mock SOLO dipendenze esterne (Supabase, Mistral API, Inngest), MAI logica interna
- Ogni test deve essere indipendente — no stato condiviso tra test
- Test file co-locati: `component.tsx` → `component.test.tsx` nella stessa cartella

## Edge Cases da Testare SEMPRE

- Null/Undefined/Empty
- Input invalidi e tipi errati
- Boundary values (date limite, stringhe vuote, array vuoti)
- Error paths (API failure, timeout, rete assente)
- Dati grandi (documenti con centinaia di pagine)
- Caratteri speciali (Unicode, accenti italiani, caratteri medici)
- Concorrenza (upload simultanei, modifiche parallele)

## Anti-Pattern da Evitare

- Testare dettagli implementativi invece del comportamento
- Test che dipendono da altri test (stato condiviso)
- Test fragili che si rompono con refactoring
- Snapshot test su componenti complessi (ok solo per piccoli componenti stabili)
