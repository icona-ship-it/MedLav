---
description: Code review completa del codice modificato. Verifica sicurezza, qualita, GDPR compliance e best practices.
---

Esegui una code review completa delle modifiche recenti.

## Checklist

### CRITICO (Sicurezza / GDPR)
- [ ] Nessun secret hardcodato
- [ ] Nessun dato sensibile nei log (nomi pazienti, diagnosi, dati clinici)
- [ ] SQL injection: query parametrizzate (Drizzle ORM)
- [ ] XSS: output sanitizzato
- [ ] CSRF: protection attiva
- [ ] Auth: verificata su ogni route protetta
- [ ] RLS: attivo su query Supabase
- [ ] Rate limiting: presente su endpoint esposti

### ALTO (Qualita Codice)
- [ ] Nessun `any` in TypeScript
- [ ] Funzioni < 50 righe
- [ ] File < 300 righe
- [ ] Nesting < 4 livelli
- [ ] Error handling completo
- [ ] No mutazione diretta (usa spread/immutabilita)
- [ ] No `console.log`
- [ ] Test presenti per la logica business

### MEDIO (Best Practices)
- [ ] Nomi descrittivi
- [ ] Validazione Zod su confini di sistema
- [ ] Loading/error/empty states gestiti nei componenti
- [ ] Dependency array completi in useEffect

## Output

Per ogni issue trovata:
```
[SEVERITA] Titolo
File: src/path/file.ts:riga
Problema: Descrizione
Fix: Soluzione suggerita
```

$ARGUMENTS
