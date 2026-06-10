# Registro costanti normative — quantificazione del danno

Costanti hardcoded nel codice che derivano da fonti normative/giurisprudenziali e
**invecchiano**: ogni voce ha fonte primaria, valore, dove vive nel codice e data
dell'ultima verifica. Processo: ri-verifica **trimestrale** (i decreti MIMIT di
adeguamento ISTAT escono tipicamente in estate; le edizioni Milano a inizio anno).
La costante `NORMATIVE_DATA_VERIFIED_ON` in `bareme-tables.ts` governa l'avviso di
staleness mostrato nelle note di calcolo dopo 8 mesi senza verifica.

Ricerca completa con fonti: `scratchpad/ricerca-normativa-2026-06-10.json`
(2 ricercatori indipendenti + verifica incrociata su fonti primarie, confidenza alta).

**Ultima verifica: 2026-06-10** · Prossima verifica: entro **2026-09** (atteso decreto FOI aprile 2026)

| Costante | Valore | Fonte primaria | Codice | Note |
|---|---|---|---|---|
| Punto base micropermanenti (art. 139 c.1 lett. a CAP) | **963,40 €** | D.M. MIMIT 18/07/2025, GU n. 176 del 31/07/2025 (cod. 25A04218) — [GU](https://www.gazzettaufficiale.it/eli/id/2025/07/31/25A04218/sg) | `bareme-tables.ts` `MICROPERMANENTI_BASE_POINT_VALUE` | +1,7% FOI apr24→apr25, decorrenza aprile 2025. Decreto 2026 NON pubblicato al 10/06/2026 |
| Diaria ITT (art. 139 c.1 lett. b CAP) | **56,18 €/die** | D.M. MIMIT 18/07/2025 (idem) | `bareme-tables.ts` `ITT_DAILY_RATE_ART139` | Esportata, non ancora usata negli export |
| Punto base TUN (agganciato ex art. 2 DPR 12/2025) | **963,40 €** | D.M. MIMIT 10/12/2025, GU n. 299 del 27/12/2025, S.O. 41 (cod. 25A06873) — [GU](https://www.gazzettaufficiale.it/eli/id/2025/12/27/25A06873/sg) | `bareme-tables.ts` `TUN_BASE_POINT_VALUE` | Primo adeguamento ISTAT TUN: aggiorna tavola 1.B All. I e tabelle 1-2 All. II |
| Entrata in vigore TUN (DPR 13/01/2025 n. 12) | **2025-03-05** | GU n. 40 del 18/02/2025, S.O. 4 (cod. 25G00019) — [GU](https://www.gazzettaufficiale.it/eli/id/2025/02/18/25G00019/SG) | `damage-estimator.ts` `TUN_EFFECTIVE_DATE` | La vecchia costante 2025-03-25 era ERRATA di 20 giorni. Confermata da Cass. 8630/2026 |
| Routing TUN ↔ Milano | TUN sempre parametro privilegiato (diretta ≥5/3/2025 RCA/sanitaria; indiretta altrove); Milano residuale con motivazione puntuale | **Cass. civ., Sez. III, 07/04/2026, n. 8630** (rinvio pregiudiziale ex art. 363-bis c.p.c., Trib. Milano ord. 18/07/2025) — [PDF ufficiale](https://www.cortedicassazione.it/resources/cms/documents/8630_03_2026_civ_noindex.pdf) | `damage-estimator.ts` `buildTableSelectionNote` | Pres. Frasca, Est. Vincenti. Pubblicata 07/04/2026 (la data 15/04 di alcuni commentari è errata) |
| Tabelle Milano | **Edizione 2024** (vigente) | [Pagina ufficiale Trib. Milano](https://tribunale-milano.giustizia.it/it/tabelle_milano.page) | `tabelle-milano.ts` | Nessuna ed. 2025/2026 al 10/06/2026. Restano riferimento per parentale/terminale/premorienza/capitalizzazione |
| Nesso causale civile | "più probabile che non" — **Cass. civ. SU 576/2008 e 581/2008** (conf. Cass. 21619/2007) | sentenze gemelle emotrasfusioni 576-585/2008 | `domain-knowledge/causal-nexus.ts` | Corretta il 2026-06-10: prima citava erroneamente la 30328/2002 come civile |
| Nesso causale penale | "oltre ogni ragionevole dubbio" / alta probabilità logica — **Cass. pen. SU 30328/2002 (Franzese)** | dep. 11/09/2002 | `domain-knowledge/causal-nexus.ts` | |
| Barème % IP macropermanenti | La tabella menomazioni ex art. 138 c.1 lett. a) NON è mai stata adottata → per la % di IP riferimento: **buona pratica SIMLA su SNLG-ISS (pubbl. 26/03/2025)** | [ISS](https://www.iss.it/en/-/valutazione-med-legale-menomazioni-integrita-psicofisica) | (prompt/domain-knowledge) | Il DPR 12/2025 attua solo la lett. b (valore punto) |
| Polizze infortuni private | Nessun aggiornamento 2025-26 verificabile; fa fede la tabella richiamata in polizza (ANIA / All.1 DPR 1124/1965 / D.M. 12/07/2000) | — | prompt considerazioni | La TUN NON si applica alle polizze infortuni (indennitarie). NON citare la presunta circolare INAIL 37/2025 (non verificata) |

## Procedura di aggiornamento
1. Verificare GU/MIMIT per nuovi decreti (FOI aprile) e la pagina del Tribunale di Milano per nuove edizioni.
2. Aggiornare le costanti nel codice + i commenti FONTE + questa tabella.
3. Aggiornare `NORMATIVE_DATA_VERIFIED_ON` in `bareme-tables.ts` (spegne l'avviso di staleness).
4. Aggiornare i test di guardia (`bareme-tables.test.ts`, `damage-estimator.test.ts`).
