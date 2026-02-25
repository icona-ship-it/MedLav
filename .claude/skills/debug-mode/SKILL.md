---
name: debug-mode
description: Workflow per debug di problemi in MedLav. Usare quando si indaga un bug, errore o comportamento inatteso.
---

# Debug Workflow

## Step 1: Riprodurre
1. Capire esattamente il problema (cosa succede vs cosa dovrebbe succedere)
2. Identificare i passi per riprodurre
3. Verificare se ci sono errori nei log

## Step 2: Isolare
1. Identificare il file/funzione dove il problema si manifesta
2. Controllare il flusso dati: input → elaborazione → output
3. Verificare lo stato del database (Supabase)
4. Controllare le risposte API (Mistral, Inngest)

## Step 3: Diagnosticare
1. Leggere il codice coinvolto
2. Verificare i tipi TypeScript
3. Controllare le edge case: null, undefined, array vuoti, date invalide
4. Verificare le policy RLS di Supabase

## Step 4: Correggere
1. Scrivere un test che riproduce il bug (RED)
2. Applicare la fix (GREEN)
3. Verificare che tutti i test esistenti passino
4. Committare con `fix: [descrizione del bug]`

## Attenzione GDPR
- Durante il debug, MAI copiare dati reali di pazienti nei log o nello scratchpad
- Usare SOLO codici caso e ID per riferirsi ai dati
