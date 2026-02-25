---
description: Pianifica l'implementazione di una feature o task complessa. Analizza requisiti, identifica rischi, crea piano dettagliato. ATTENDE conferma prima di procedere.
---

Analizza la richiesta dell'utente e crea un piano di implementazione dettagliato.

## Processo

1. **Leggi i requisiti**: `docs/REQUIREMENTS.md` e `docs/CONSTRAINTS.md`
2. **Analizza l'architettura attuale**: `docs/ARCHITECTURE-DECISIONS.md`
3. **Identifica impatto**: quali file, moduli, tabelle DB sono coinvolti
4. **Valuta rischi**: sicurezza GDPR, performance, complessita
5. **Scrivi il piano** in `scratchpad/plan-[nome].md` con:
   - Overview (2-3 frasi)
   - File da creare/modificare (con path esatti)
   - Schema DB changes (se necessari)
   - Step di implementazione ordinati
   - Strategia di testing
   - Considerazioni GDPR
   - Rischi e mitigazioni

**CRITICO**: NON procedere con l'implementazione finche l'utente non conferma il piano.

$ARGUMENTS
