---
description: Regole di sicurezza e GDPR per MedLav — dati sanitari sensibili
globs: ["src/**/*", "*.config.*", "*.env*"]
---

## CRITICO — Dati Sanitari sotto GDPR Art. 9

MedLav tratta dati sanitari (categoria speciale). Ogni violazione puo comportare sanzioni fino al 4% del fatturato globale. Seguire SEMPRE queste regole.

## Regole Assolute

1. **MAI loggare dati sensibili**: nomi pazienti, diagnosi, dati clinici nei log. Usare SOLO codici caso e ID
2. **MAI hardcodare secrets**: API keys, password, token. SEMPRE `process.env.NOME_VARIABILE`
3. **MAI esporre dettagli errore**: messaggi user-friendly all'utente, dettagli tecnici solo nei log server
4. **SEMPRE validare input**: Zod su ogni endpoint API, ogni form, ogni dato esterno
5. **SEMPRE parametrizzare query**: MAI concatenare stringhe per SQL (Drizzle ORM gestisce questo)
6. **SEMPRE verificare auth**: middleware su ogni route protetta, controllare user_id su ogni query
7. **SEMPRE RLS attivo**: Row Level Security su Supabase — ogni query filtrata per user_id

## OWASP Top 10 Checklist

- [ ] SQL Injection: query parametrizzate (Drizzle ORM)
- [ ] XSS: sanitizzare output HTML, usare React (escape automatico), CSP headers
- [ ] CSRF: token su ogni form mutation
- [ ] Broken Auth: session management sicuro, password hashing con argon2/bcrypt
- [ ] Broken Access Control: RLS + middleware + verifica ownership su ogni operazione
- [ ] Security Misconfiguration: headers sicuri, no default credentials
- [ ] Sensitive Data Exposure: crittografia, no dati in chiaro in URL/log
- [ ] Rate Limiting: su tutti gli endpoint, specialmente auth e upload

## Headers di Sicurezza (Next.js)

```
Content-Security-Policy: default-src 'self'; script-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
```

## Se Trovi una Vulnerabilita

STOP IMMEDIATO. Correggi prima di continuare qualsiasi altro lavoro.

## Dati reali in codice, prompt ed esempi — VIETATO (GDPR Art. 9 + AI Act)

- **Prompt ed esempi few-shot**: SEMPRE dati interamente fittizi e dichiarati tali. Universo fittizio di riferimento: "via degli Esempi", "Cittàdemo", "Ospedale Civile di Cittàdemo", cognomi tipo "Demprova". MAI nomi, date di nascita, luoghi, strutture o diagnosi provenienti da casi/gold reali (incidenti: "Scuola Cangrande" e "REGNOTO VALERIA" trovati nei prompt il 2026-07-17 e bonificati).
- **Fixture di test**: stessi vincoli — mai date di nascita, CF o combinazioni identificanti derivate da casi reali.
- **Slug, ID e nomi file committati**: mai cognomi dei periziandi; usare codici neutri (es. `gold-a-semplice`) o i codici caso (`CASO-2026-NNN`).
- **Commenti nel codice**: preferire i codici caso ai cognomi; i cognomi-codename legacy nei commenti sono tollerati ma da non aggiungere.
- I file in `benchmark/` (dati sanitari reali) restano SEMPRE gitignored.
