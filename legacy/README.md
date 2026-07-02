# legacy/ — codice parcheggiato (hide, don't delete)

Branch `rc-mvp` (pivot MVP RC-only, 2026-07-02): il codice fuori dallo scope
"perizia RC stragiudiziale + Documentazione Sanitaria + Spese Mediche" viene
SPOSTATO qui con `git mv`, conservando il path originale:

```
src/services/pubmed/*  →  legacy/src/services/pubmed/*
```

Regole:
- Questa directory è ESCLUSA da typecheck (tsconfig `exclude`), lint
  (eslint `globalIgnores`) e test (vitest include solo `src/**`). Non compila,
  non gira, non pesa.
- NIENTE viene eliminato: il ripristino di un modulo è `git mv` inverso
  + ricablaggio degli import (i punti esatti sono in
  `scratchpad/port-list-rc-mvp.md`, sezione CONDIVISO-ACCOPPIATO).
- L'app completa pre-pivot resta su `main` (PROD) e nel tag
  `full-app-2026-07-02` (locale + GitHub).
- Non aggiungere codice nuovo qui: solo parcheggi dal prune.
