---
description: Convenzioni di codice TypeScript/React del progetto MedLav
globs: ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx"]
---

## TypeScript

- TypeScript strict mode, MAI usare `any` — usare `unknown` + type guard se necessario
- Named exports, non default exports
- Funzioni pure dove possibile
- Immutabilita: creare SEMPRE nuovi oggetti con spread `{ ...obj, field }`, MAI mutare
- Error handling esplicito con try/catch tipizzato
- File < 300 righe — se piu lungo, splittare in moduli
- Funzioni < 50 righe — se piu lunga, estrarre sotto-funzioni
- Nesting max 4 livelli — se di piu, estrarre funzioni o usare early return
- Nomi descrittivi: `getUserById` non `getUser`, `isDocumentProcessed` non `isProcessed`
- Validazione input con Zod a ogni confine di sistema (API, form, dati esterni)

## React / Next.js

- Componenti funzionali con TypeScript interfaces per props
- Server Components di default, Client Components (`'use client'`) solo quando necessario
- Separare logica da presentazione con custom hooks
- Sempre gestire stati: loading, error, empty, success
- useEffect: SEMPRE specificare dependency array completo
- Keys in liste: usare ID stabili, MAI indici
- No prop drilling oltre 2 livelli — usare Context o composizione

## Stile Codice

- Punto e virgola (semicolons) alla fine delle istruzioni
- Single quotes per stringhe
- 2 spazi per indentazione
- Trailing comma in oggetti e array multi-riga

## Risposta API Standard

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: { total: number; page: number; limit: number };
}
```
