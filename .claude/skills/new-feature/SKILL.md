---
name: new-feature
description: Workflow per implementare una nuova feature in MedLav. Usare quando si aggiunge funzionalita al progetto. Include pianificazione, TDD e documentazione.
---

# Workflow Nuova Feature

## Step 1: Analisi
1. Leggere `docs/REQUIREMENTS.md` per trovare i requisiti della feature
2. Leggere `docs/ARCHITECTURE-DECISIONS.md` per contesto sulle scelte passate
3. Leggere `docs/CONSTRAINTS.md` per vincoli tecnici e GDPR
4. Identificare file e moduli impattati

## Step 2: Piano
1. Scrivere un piano in `scratchpad/plan-[feature-name].md`
2. Il piano deve includere:
   - File da creare/modificare
   - Schema database (se necessario)
   - Dipendenze necessarie
   - Strategia di testing
   - Considerazioni GDPR/sicurezza
   - Rischi e mitigazioni

## Step 3: Implementazione (TDD)
1. Creare branch `feature/[nome]`
2. Scrivere test PRIMA dell'implementazione (RED)
3. Implementare il minimo per far passare i test (GREEN)
4. Refactoring mantenendo i test verdi (REFACTOR)
5. Verificare che lint e typecheck passino

## Step 4: Verifica Sicurezza
1. Nessun dato sensibile nei log
2. Auth e RLS verificati
3. Input validato con Zod
4. Nessun `any` nel codice

## Step 5: Documentazione
1. Aggiornare `docs/ARCHITECTURE-DECISIONS.md` se decisioni rilevanti
2. Aggiornare `docs/API-CONTRACTS.md` se nuovi endpoint
3. Eliminare il file piano da `scratchpad/`
4. Committare con `feat: [descrizione]`
