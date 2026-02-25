---
name: research
description: Ricerca e valutazione di librerie, framework o approcci tecnici per MedLav. Usare quando bisogna scegliere tra alternative.
---

# Research Workflow

## Step 1: Definire Criteri
1. Performance e bundle size
2. Manutenzione (ultimo commit, frequenza rilasci, community)
3. Developer Experience
4. Compatibilita con lo stack (Next.js 15, React 19, TypeScript)
5. Compliance GDPR (dove transitano i dati?)

## Step 2: Identificare Alternative
1. Trovare 2-3 alternative per ogni necessita
2. Verificare compatibilita versioni

## Step 3: Valutare
Per ciascuna alternativa:
- Ultimo commit e frequenza rilasci
- Issue aperte vs chiuse (rapporto)
- Dimensione community (stars, downloads)
- Documentazione
- TypeScript support nativo
- Se tratta dati: dove sono i server? EU-compliant?

## Step 4: Documentare
1. Scrivere risultati in `scratchpad/research-[topic].md`
2. Loggare la scelta in `docs/ARCHITECTURE-DECISIONS.md`
3. Formato ADR con alternative considerate e motivazione
