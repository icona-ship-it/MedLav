---
description: Convenzioni Git per MedLav
globs: ["**/*"]
---

## Conventional Commits

Formato: `<type>: <description>`

Tipi ammessi:
- `feat`: nuova funzionalita
- `fix`: correzione bug
- `refactor`: refactoring senza cambi funzionali
- `docs`: documentazione
- `test`: aggiunta/modifica test
- `chore`: manutenzione, config, dipendenze
- `perf`: miglioramento performance
- `ci`: configurazione CI/CD
- `style`: formattazione (no logic change)

## Branch Naming

- `feature/[nome-kebab-case]` — nuove funzionalita
- `fix/[nome-kebab-case]` — bug fix
- `refactor/[nome-kebab-case]` — refactoring

## Regole

- Commit atomici: un commit = un cambiamento logico
- MAI committare: `.env`, `.env.local`, secrets, `node_modules/`, file temporanei
- MAI fare force push su main/master
- Descrivere il "perche" nel messaggio, non il "cosa"
- Se il commit risolve un issue: `feat: add document upload (#12)`
