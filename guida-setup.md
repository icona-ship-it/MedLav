# Guida Completa: Setup Cartella Progetto per Claude Opus 4.6 1M

## Sviluppo Autonomo di Applicazioni da Zero con Ottimizzazione Token

---

## 1. Filosofia di Base: Context Engineering

Claude Opus 4.6 con 1M di token è estremamente potente, ma **il contesto è il vero collo di bottiglia, non l'intelligenza**. L'obiettivo è:

- Dare a Claude una **mappa chiara** del progetto, non un manuale enciclopedico
- Usare **Progressive Disclosure**: rivelare informazioni a strati, solo quando servono
- Lasciare che Claude **decida autonomamente** architettura, stack e implementazione
- Minimizzare i token sprecati in contesto irrilevante

> **Regola d'oro:** CLAUDE.md deve funzionare come un onboarding per un developer senior che arriva il primo giorno — non come una documentazione esaustiva.

---

## 2. Struttura Cartella Completa

```
mio-progetto/
│
├── CLAUDE.md                          # [OBBLIGATORIO] File principale — max 150 righe
│
├── docs/                              # Documentazione on-demand (Progressive Disclosure)
│   ├── VISION.md                      # Vision prodotto, obiettivi, target utente
│   ├── REQUIREMENTS.md                # Requisiti funzionali e non funzionali
│   ├── ARCHITECTURE-DECISIONS.md      # Log delle decisioni architetturali (ADR)
│   ├── API-CONTRACTS.md               # Contratti API (se necessari)
│   └── CONSTRAINTS.md                 # Vincoli tecnici, budget, limiti infrastrutturali
│
├── .claude/
│   ├── settings.json                  # Permessi e configurazioni Claude Code
│   ├── rules/                         # Regole modulari per contesto specifico
│   │   ├── code-style.md              # Convenzioni di codice
│   │   ├── testing.md                 # Strategie di testing
│   │   ├── security.md                # Regole di sicurezza
│   │   └── git-workflow.md            # Convenzioni Git
│   │
│   ├── skills/                        # Skill personalizzate (attivate on-demand)
│   │   ├── new-feature/
│   │   │   └── SKILL.md
│   │   ├── debug-mode/
│   │   │   └── SKILL.md
│   │   ├── deploy/
│   │   │   ├── SKILL.md
│   │   │   └── scripts/
│   │   │       └── deploy.sh
│   │   └── research/
│   │       └── SKILL.md
│   │
│   └── commands/                      # Slash commands personalizzati
│       ├── plan.md                    # /plan — pianifica una feature
│       ├── review.md                  # /review — code review
│       └── ship.md                    # /ship — prepara per deploy
│
├── scratchpad/                        # Area di lavoro temporanea per Claude
│   └── .gitkeep                       # Claude usa questa cartella per note e ragionamento
│
└── src/                               # Codice sorgente (vuoto all'inizio)
    └── .gitkeep
```

---

## 3. CLAUDE.md — Il File Più Importante

Questo file viene caricato in **ogni sessione**. Deve essere **conciso** (< 150 righe), **universalmente applicabile** e contenere solo ciò che serve **sempre**.

```markdown
# [Nome Progetto]

[Descrizione in 1-2 righe: cosa fa, per chi, quale problema risolve]

## Stack & Ambiente

- Runtime: [es. Node 22 / Python 3.12 / Go 1.22]
- Framework: [es. Next.js 15 / FastAPI / SvelteKit]
- Database: [es. PostgreSQL 16 / SQLite / Supabase]
- Hosting target: [es. Vercel / AWS / VPS]
- Package manager: [es. pnpm / bun / uv]

## Comandi

- Dev: `pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`
- Type check: `pnpm typecheck`

## Struttura Progetto

- `/src` — Codice sorgente
- `/docs` — Documentazione di progetto (leggere prima di iniziare task complesse)
- `/scratchpad` — Area note temporanee di Claude

## Principi di Decisione

Claude ha piena autonomia su architettura e implementazione. Quando deve decidere:

1. Privilegiare semplicità e manutenibilità
2. Scegliere soluzioni battle-tested (no bleeding edge senza motivo)
3. Scrivere codice che si auto-documenta
4. Ogni decisione rilevante va loggata in `docs/ARCHITECTURE-DECISIONS.md`

## Workflow

1. **Prima di iniziare qualsiasi task complessa**, leggere i file rilevanti in `/docs`
2. Per task nuove, scrivere un piano in `/scratchpad/plan-[nome].md` prima di codificare
3. Committare con messaggi conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`
4. Dopo ogni milestone, aggiornare `docs/ARCHITECTURE-DECISIONS.md`

## IMPORTANTE: Cosa NON fare

- NON leggere file non necessari al task corrente
- NON generare codice boilerplate quando un generatore/CLI esiste
- NON chiedere permesso per decisioni tecniche — decidere e documentare
- NON duplicare logica — se qualcosa esiste già, riusarla
```

### Perché max 150 righe?

I modelli frontier riescono a seguire con consistenza circa 150-200 istruzioni. Ogni riga in più in CLAUDE.md è contesto che compete per attenzione su **ogni singola richiesta**, anche quelle non correlate.

---

## 4. docs/VISION.md — Il Brief Strategico

Questo file viene letto **solo quando Claude deve prendere decisioni di alto livello**. Non viene caricato automaticamente.

```markdown
# Vision: [Nome Progetto]

## Problema

[Descrivi il problema che risolvi — 3-5 righe max]

## Soluzione

[Come lo risolvi — 3-5 righe max]

## Utente Target

- Persona primaria: [chi è, cosa fa, cosa gli serve]
- Persona secondaria: [opzionale]

## Obiettivi Misurabili (MVP)

1. [Obiettivo 1 — concreto e misurabile]
2. [Obiettivo 2]
3. [Obiettivo 3]

## Differenziazione

[Cosa ti rende diverso dalla concorrenza — 2-3 righe]

## Vincoli di Business

- Timeline: [es. MVP in 4 settimane]
- Budget infra: [es. < €50/mese per MVP]
- Team: [es. solo Claude + 1 developer umano per review]
```

---

## 5. docs/REQUIREMENTS.md — Requisiti Funzionali

```markdown
# Requisiti: [Nome Progetto]

## Feature Core (MVP)

### F1: [Nome Feature]
- **Descrizione**: [Cosa deve fare — 1-2 righe]
- **Criterio di accettazione**: [Quando è "fatto"]
- **Priorità**: P0 (must-have)

### F2: [Nome Feature]
- **Descrizione**: [...]
- **Criterio di accettazione**: [...]
- **Priorità**: P0

## Feature Post-MVP

### F3: [Nome Feature]
- **Priorità**: P1 (nice-to-have)

## Requisiti Non Funzionali

- **Performance**: [es. TTFB < 200ms, LCP < 2.5s]
- **Sicurezza**: [es. Auth con JWT, input sanitization]
- **Accessibilità**: [es. WCAG 2.1 AA]
- **SEO**: [es. SSR/SSG per pagine pubbliche]
- **Scalabilità**: [es. supportare 1000 utenti concorrenti]
```

---

## 6. docs/ARCHITECTURE-DECISIONS.md — Decision Log

Questo file è **scritto e aggiornato da Claude** durante lo sviluppo. Serve come memoria persistente tra sessioni.

```markdown
# Architecture Decision Records

## ADR-001: [Titolo Decisione]
- **Data**: YYYY-MM-DD
- **Contesto**: [Perché è stata necessaria questa decisione]
- **Decisione**: [Cosa è stato deciso]
- **Alternative considerate**: [Cosa è stato scartato e perché]
- **Conseguenze**: [Impatto della decisione]

---

(Claude aggiunge nuovi ADR man mano che sviluppa)
```

---

## 7. docs/CONSTRAINTS.md — Vincoli Tecnici

```markdown
# Vincoli Tecnici

## Infrastruttura
- [es. Deploy su Vercel — no Docker in produzione]
- [es. Database gestito — no self-hosted DB]
- [es. Budget hosting: max €50/mese]

## Compatibilità
- [es. Browser: Chrome 90+, Safari 16+, Firefox 100+]
- [es. Mobile-first responsive]

## Dipendenze Vietate
- [es. No jQuery, no Moment.js (usare date-fns)]
- [es. No ORM pesanti — preferire query builder o raw SQL]

## Dipendenze Preferite
- [es. Zod per validazione]
- [es. TanStack Query per data fetching]
- [es. Tailwind CSS per styling]
```

---

## 8. .claude/rules/ — Regole Modulari

Le rules vengono caricate **solo quando Claude lavora su file che matchano il path**. Questo è il meccanismo chiave per il risparmio token.

### .claude/rules/code-style.md

```markdown
---
description: Convenzioni di codice del progetto
globs: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js"]
---

- TypeScript strict mode, mai usare `any`
- Named exports, non default exports
- Funzioni pure dove possibile
- Error handling esplicito (Result pattern o try/catch con tipi)
- File < 300 righe — se più lungo, splittare
- Nomi descrittivi: `getUserById` non `getUser`
```

### .claude/rules/testing.md

```markdown
---
description: Strategie e convenzioni di testing
globs: ["src/**/*.test.*", "tests/**/*"]
---

- Test unitari con Vitest
- Pattern AAA: Arrange, Act, Assert
- Mock solo dipendenze esterne (API, DB), mai logica interna
- Naming: `should [expected behavior] when [condition]`
- Coverage minima: 80% su business logic
```

### .claude/rules/git-workflow.md

```markdown
---
description: Convenzioni Git
globs: ["**/*"]
---

- Conventional Commits: feat|fix|refactor|docs|test|chore
- Branch naming: feature/[nome], fix/[nome], refactor/[nome]
- Commit atomici: un commit = un cambiamento logico
- Mai committare file .env, secrets, o node_modules
```

---

## 9. .claude/skills/ — Capacità On-Demand

Le skill si attivano **solo quando il task le richiede**. Il SKILL.md deve restare sotto 500 righe.

### .claude/skills/new-feature/SKILL.md

```markdown
---
name: new-feature
description: Workflow per implementare una nuova feature. Usare quando si aggiunge
  funzionalità al progetto. Include pianificazione, implementazione e testing.
---

# Workflow Nuova Feature

## Step 1: Analisi
1. Leggere `docs/REQUIREMENTS.md` per trovare i requisiti della feature
2. Leggere `docs/ARCHITECTURE-DECISIONS.md` per contesto sulle scelte passate
3. Identificare file e moduli impattati

## Step 2: Piano
1. Scrivere un piano in `scratchpad/plan-[feature-name].md`
2. Il piano deve includere:
   - File da creare/modificare
   - Dipendenze necessarie
   - Strategia di testing
   - Rischi e mitigazioni

## Step 3: Implementazione
1. Creare branch `feature/[nome]`
2. Implementare seguendo il piano
3. Scrivere test durante l'implementazione (non dopo)
4. Verificare che lint e typecheck passino

## Step 4: Documentazione
1. Aggiornare `docs/ARCHITECTURE-DECISIONS.md` se ci sono state decisioni rilevanti
2. Eliminare il file piano da `scratchpad/`
3. Committare con `feat: [descrizione]`
```

### .claude/skills/research/SKILL.md

```markdown
---
name: research
description: Ricerca e valutazione di librerie, framework o approcci tecnici.
  Usare quando bisogna scegliere tra alternative tecniche.
---

# Research Workflow

1. Definire i criteri di valutazione (performance, bundle size, manutenzione, DX)
2. Identificare 2-3 alternative
3. Per ciascuna:
   - Verificare ultimo commit e frequenza rilasci
   - Controllare issue aperte e chiuse
   - Valutare dimensione community
   - Testare con un proof-of-concept minimale se necessario
4. Documentare la scelta in `docs/ARCHITECTURE-DECISIONS.md`
5. Scrivere risultati in `scratchpad/research-[topic].md`
```

---

## 10. scratchpad/ — Memoria di Lavoro

La cartella `scratchpad/` è l'equivalente della RAM per Claude. Serve per:

- **Piani**: `plan-auth-system.md` — prima di implementare feature complesse
- **Research**: `research-orm-comparison.md` — quando valuta alternative
- **Note**: `notes-session-2024-01.md` — stato del lavoro in corso
- **Todo**: `todo-current.md` — task in corso e prossimi step

**Strategia chiave**: Invece di rileggere file multipli ogni sessione, Claude legge un file una volta, scrive le note rilevanti nello scratchpad, e poi referenzia lo scratchpad. Questo risparmia enormi quantità di token.

---

## 11. Strategie di Risparmio Token

### 11.1 Progressive Disclosure (il più importante)

Non mettere tutto in CLAUDE.md. Invece, **punta a file esterni**:

```markdown
## IMPORTANTE: Prima di iniziare task complesse, leggere i doc rilevanti in /docs
```

Claude caricherà i doc **solo quando servono**, non ad ogni sessione.

### 11.2 Regole con Glob Pattern

Le rules in `.claude/rules/` con `globs` si attivano **solo quando Claude lavora su file che matchano il pattern**. Una regola con `globs: ["src/**/*.test.*"]` non consuma token quando Claude sta lavorando su un componente UI.

### 11.3 Scratchpad come Cache

```
Primo accesso: Claude legge docs/REQUIREMENTS.md (2000 token)
→ Scrive scratchpad/notes-requirements.md (500 token, solo le parti rilevanti)

Accessi successivi: Claude legge solo lo scratchpad (500 token)
→ Risparmio: 75% sui token di input
```

### 11.4 File Piccoli e Focalizzati

Ogni file di codice < 300 righe. Claude deve poter leggere solo il file rilevante, non un monolite di 2000 righe per trovare la funzione che gli serve.

### 11.5 Compaction Automatica

Con Opus 4.6, la compaction è automatica: quando la conversazione si avvicina al limite, il sistema riassume i messaggi precedenti. Ma puoi anche forzarla:

- **`/compact`**: Comprimi la conversazione, liberando ~50% del contesto
- **`/clear`**: Quando cambi task completamente — non trascinare contesto irrilevante

### 11.6 Scelta Modello Strategica (per Claude Code)

Per risparmiare ulteriormente:

- **Opus**: Solo per pianificazione, decisioni architetturali, debug complessi
- **Sonnet**: Per 80% del lavoro — implementazione, refactoring, test
- **`opusplan`**: Usa automaticamente Opus per pianificare e Sonnet per eseguire

### 11.7 Prompt Caching

Il caching è attivo di default su Claude Code. Il contenuto statico (system prompt, CLAUDE.md, file letti più volte) viene cachato, riducendo i costi di input fino al 90% sulle porzioni cachate.

### 11.8 Istruzioni Specifiche nei Prompt

Più il prompt è specifico, meno file Claude deve esplorare:

```
❌ "Fixa il bug nell'autenticazione"
✅ "Fix il 401 error in src/auth/login.ts — gli utenti con credenziali valide
   ricevono errore dopo il commit abc123. File correlati: src/middleware/auth.ts"
```

---

## 12. Come Fare il Primo Prompt

Quando la cartella è pronta, il **primo prompt** a Claude deve essere strutturato così:

```
Leggi CLAUDE.md e i file in docs/ per avere il contesto completo del progetto.

Poi:
1. Analizza vision, requisiti e vincoli
2. Proponi l'architettura completa (stack, struttura cartelle, pattern principali)
3. Scrivi il tuo piano dettagliato in scratchpad/plan-architecture.md
4. Logga tutte le decisioni in docs/ARCHITECTURE-DECISIONS.md
5. Inizia l'implementazione dal setup base (package.json, config, struttura cartelle)

Hai piena autonomia decisionale su ogni aspetto tecnico. Documenta le scelte.
```

Questo prompt:
- Fa leggere tutto il contesto **una sola volta**
- Obbliga Claude a pianificare **prima** di codificare
- Crea una traccia scritta che persiste tra le sessioni
- Dà autonomia esplicita per evitare ping-pong di domande

---

## 13. Checklist Pre-Lancio

Prima di dare la cartella a Claude, verifica:

- [ ] `CLAUDE.md` è < 150 righe e contiene solo info universali
- [ ] `docs/VISION.md` ha obiettivi chiari e misurabili
- [ ] `docs/REQUIREMENTS.md` ha feature con criteri di accettazione
- [ ] `docs/CONSTRAINTS.md` elenca tutti i vincoli non negoziabili
- [ ] `docs/ARCHITECTURE-DECISIONS.md` esiste (vuoto — lo riempie Claude)
- [ ] `.claude/rules/` ha regole con glob pattern specifici
- [ ] `.claude/skills/` ha workflow per i task ricorrenti
- [ ] `scratchpad/` esiste come area di lavoro
- [ ] Nessun file supera le 500 righe
- [ ] Non ci sono istruzioni contraddittorie tra i file

---

## 14. Anti-Pattern da Evitare

| Anti-Pattern | Problema | Soluzione |
|---|---|---|
| CLAUDE.md di 2000 righe | Ogni sessione spreca token, le istruzioni si perdono | Max 150 righe, tutto il resto in `/docs` |
| Snippet di codice in CLAUDE.md | Diventano obsoleti, consumano token | Usare riferimenti a file: "vedi `src/auth/types.ts:15`" |
| Tutte le regole nello stesso file | Caricate sempre, anche quando irrilevanti | Rules separate con `globs` specifici |
| Nessuno scratchpad | Claude rilegge gli stessi file ad ogni sessione | Scratchpad come cache di note |
| Istruzioni vaghe | Claude esplora file inutili, spreca token | Prompt specifici con path e contesto |
| Codice pre-esistente mal strutturato | Claude perde tempo a capire codice legacy | Partire da zero = massima autonomia |
| `@file` per includere doc pesanti | Incorpora l'intero file ad ogni esecuzione | Puntatore: "Per dettagli, leggi `docs/x.md`" |
| Regole in negativo senza alternativa | Claude si blocca: "non fare X" senza dire cosa fare | "Non usare `--foo`, usa `--bar` invece" |

---

## 15. Template Pronto all'Uso

Per partire immediatamente, esegui questo script bash nella root del tuo progetto:

```bash
#!/bin/bash
mkdir -p docs scratchpad src .claude/rules .claude/skills/new-feature .claude/skills/research .claude/skills/debug-mode .claude/commands

# Crea file vuoti con struttura
touch src/.gitkeep scratchpad/.gitkeep

cat > docs/ARCHITECTURE-DECISIONS.md << 'EOF'
# Architecture Decision Records

(Claude aggiungerà le decisioni qui durante lo sviluppo)
EOF

# Crea .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
.env.local
dist/
build/
.next/
scratchpad/*.tmp
EOF
```

Poi compila CLAUDE.md, VISION.md, REQUIREMENTS.md e CONSTRAINTS.md seguendo i template nelle sezioni 3-7 di questa guida.

---

## 16. Risorse e Riferimenti

- **Anthropic — Context Engineering**: `anthropic.com/engineering/effective-context-engineering-for-ai-agents`
- **Anthropic — Claude Code Best Practices**: `anthropic.com/engineering/claude-code-best-practices`
- **Anthropic — Skill Authoring Best Practices**: `platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices`
- **HumanLayer — Writing a Good CLAUDE.md**: `humanlayer.dev/blog/writing-a-good-claude-md`
- **Builder.io — CLAUDE.md Guide**: `builder.io/blog/claude-md-guide`
- **Progressive Disclosure per AI**: `alexop.dev/posts/stop-bloating-your-claude-md-progressive-disclosure-ai-coding-tools`
- **Context Management Best Practices**: `aledlie.com/ai/development/claude/claude-context-management-best-practices`

---

*Guida compilata il 23 Febbraio 2026 — Basata sulle best practice ufficiali Anthropic e sulla community di Claude Code.*
