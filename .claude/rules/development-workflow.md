---
description: Workflow di sviluppo MedLav
globs: ["**/*"]
---

## Workflow Standard per Ogni Task

```
1. LEGGERE docs/ rilevanti
2. PIANIFICARE in scratchpad/plan-[nome].md
3. TDD: scrivere test PRIMA (RED)
4. IMPLEMENTARE (GREEN)
5. REFACTOR
6. VERIFICARE sicurezza (no dati sensibili nei log, auth ok, RLS ok)
7. COMMITTARE con conventional commits
8. AGGIORNARE docs/ARCHITECTURE-DECISIONS.md se decisioni rilevanti
```

## Prima di Ogni Feature Complessa

1. Leggere `docs/REQUIREMENTS.md` per i requisiti
2. Leggere `docs/ARCHITECTURE-DECISIONS.md` per contesto
3. Scrivere piano in `scratchpad/plan-[feature].md`
4. Implementare seguendo il piano

## Principi

- Semplicita > Complessita
- Codice che funziona > Codice perfetto
- Test > Documentazione
- Piccoli commit frequenti > Grandi commit rari
- Risolvere il problema attuale > Anticipare problemi futuri
