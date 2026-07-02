/**
 * Parere pro veritate + parere scopo riserva section catalogs (Sprint 2.6
 * split of section-catalog.ts).
 *
 * MECHANICAL extraction — string contents are byte-identical to the original
 * to preserve generation_metadata.promptVersion (ADR-011, Sprint 2.3 hash).
 */
import type { SectionSpec } from './section-generation-types';
import {
  TOKENS_TINY,
  TOKENS_SMALL,
  TOKENS_MEDIUM,
  TOKENS_LARGE,
  TOKENS_NONE,
  NO_EVN_RULE,
  ANTI_REPETITION_AND_LENGTH_RULES,
  DOC_SANITARIA_PLACEHOLDER,
  DOC_SANITARIA_INTRO,
  DOC_REPRODUCTION_RULES,
  DOC_SANITARIA_NEUTRALITY,
} from './catalog-shared';

// ── Parere Pro Veritate sections (6) ───────────────────────────────

export const PARERE_PRO_VERITATE_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione_parere',
    title: 'Intestazione',
    maxTokens: TOKENS_TINY,
    dataSources: ['perizia-metadata', 'events-medical'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera l'intestazione formale del parere pro veritate.

REGOLA ASSOLUTA — VIETATO INVENTARE QUALSIASI DATO:
Questo è un parere medico-legale che verrà firmato e potrà essere prodotto in giudizio. Inventare dati è un errore gravissimo. Per ogni campo applica:
1) Cerca nei METADATI PERIZIA del prompt utente.
2) Se assente, cerca nelle intestazioni dei DOCUMENTI/EVENTI sanitari forniti (il nome del paziente è quasi sempre nelle cartelle cliniche).
3) Se ancora assente, scrivi letteralmente \`[da compilare dal perito]\` o ometti il campo.

VIETATO TASSATIVAMENTE: nomi di professionisti inventati, qualifiche/iscrizioni albo non documentate, soggetti richiedenti fittizi, codici fiscali e indirizzi non presenti nei dati forniti.

Campi:
- Nome, qualifica e specializzazione del professionista incaricato (SOLO se nei metadati perizia)
- Data del parere (oggi se non specificata)
- Dicitura "Parere pro veritate"
- Dati identificativi del paziente (cerca nei metadati e nelle intestazioni dei documenti forniti — usa il nome reale se trovato)
- Soggetto richiedente (SOLO se nei metadati perizia)

Stile formale.
${NO_EVN_RULE}`,
  },
  {
    id: 'oggetto_parere',
    title: 'Oggetto del Parere',
    maxTokens: TOKENS_SMALL,
    dataSources: ['perizia-metadata', 'events-medical'],
    contextMaxChars: 300,
    needsOcr: false,
    promptDirective: `Descrivi l'oggetto del parere: cosa e stato richiesto al professionista.
Includi:
- Quesito o richiesta formulata dal committente
- Ambito della valutazione (responsabilita professionale medica)
- Breve inquadramento della vicenda clinica oggetto di analisi
Stile conciso e formale (1-2 paragrafi).
${NO_EVN_RULE}`,
  },
  // Reuse stragiudiziale documentazione_sanitaria spec
  {
    id: 'documentazione_sanitaria',
    title: 'La Documentazione Medica Prodotta',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    // DETERMINISTIC default: verbatim OCR reproduction (no LLM) via the
    // DOC_SANITARIA sentinel; the promptDirective below is the on-demand AI variant.
    isPlaceholder: true,
    placeholderText: DOC_SANITARIA_PLACEHOLDER,
    promptDirective: `${DOC_SANITARIA_INTRO}

${DOC_REPRODUCTION_RULES}

${DOC_SANITARIA_NEUTRALITY}

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}`,
  },
  {
    id: 'analisi_condotta',
    title: 'Analisi della Condotta Sanitaria',
    maxTokens: TOKENS_LARGE,
    dataSources: ['events-medical', 'context-summaries', 'guidelines'],
    contextMaxChars: 800,
    needsOcr: true,
    promptDirective: `Analizza la condotta sanitaria alla luce degli standard di cura applicabili.
Includi:
- Ricostruzione cronologica delle scelte diagnostico-terapeutiche adottate
- Confronto con le linee guida e buone pratiche cliniche vigenti al momento dei fatti
- Identificazione di eventuali scostamenti dagli standard di cura
- Valutazione dell'iter diagnostico: tempestivita, appropriatezza degli accertamenti
- Valutazione dell'iter terapeutico: adeguatezza delle scelte, tempistica degli interventi
- Analisi del consenso informato se documentato
NON esprimere giudizi definitivi sulla responsabilita — il perito li formulera nella sezione successiva.
Scrivi in prosa discorsiva formale, con citazioni puntuali alla documentazione.
${NO_EVN_RULE}`,
  },
  {
    id: 'valutazione_responsabilita',
    title: 'Valutazione dei Profili di Responsabilità',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui la valutazione dei profili di responsabilita professionale:*

*- Sussistenza o insussistenza di condotte censurabili sotto il profilo medico-legale*
*- Nesso di causalita materiale tra condotta e danno (criterio controfattuale)*
*- Nesso di causalita giuridica (criterio del "piu probabile che non")*
*- Quantificazione del danno biologico permanente e temporaneo*
*- Eventuale concorso di cause (preesistenze, concause)*
*- Perdita di chance se applicabile]*`,
    promptDirective: '',
  },
  {
    id: 'conclusioni_parere',
    title: 'Conclusioni',
    maxTokens: TOKENS_TINY,
    dataSources: ['context-summaries', 'calculations'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Genera una breve sintesi conclusiva (1-2 paragrafi).
Riepiloga i fatti principali emersi dall'analisi della documentazione e della condotta sanitaria.
Riporta i dati quantitativi emersi (periodi ITT/ITP, esiti documentati) se disponibili.
NON esprimere giudizi definitivi sulla responsabilita — il perito li formulera autonomamente.
Stile fattuale e conciso.
${NO_EVN_RULE}

*[Il perito completera questa sezione con il proprio parere motivato sulla sussistenza di profili di responsabilita professionale]*`,
  },
];

// ── Parere Scopo Riserva sections (6) ──────────────────────────────

export const PARERE_SCOPO_RISERVA_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione_parere',
    title: 'Intestazione',
    maxTokens: TOKENS_TINY,
    dataSources: ['perizia-metadata', 'events-medical'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera l'intestazione formale del parere scopo riserva.

REGOLA ASSOLUTA — VIETATO INVENTARE QUALSIASI DATO:
Questo parere serve alla compagnia per la riserva tecnica. Dati anagrafici inventati possono causare errori contabili e responsabilità professionale. Per ogni campo:
1) Cerca nei METADATI PERIZIA del prompt utente.
2) Se assente, cerca nelle intestazioni dei DOCUMENTI/EVENTI sanitari forniti.
3) Se ancora assente, scrivi letteralmente \`[da compilare dal perito]\` o ometti il campo.

VIETATO TASSATIVAMENTE: nomi di professionisti, periziandi, compagnie assicurative inventati. Codici fiscali, indirizzi, date di nascita fittizi.

Campi:
- Nome, qualifica e specializzazione del professionista incaricato (SOLO se nei metadati perizia)
- Data del parere (oggi se non specificata)
- Dicitura "Parere a scopo riserva"
- Dati identificativi del periziando (cerca nei metadati e nelle intestazioni dei documenti forniti)
- Soggetto richiedente (SOLO se nei metadati perizia)

Stile formale.
${NO_EVN_RULE}`,
  },
  // Reuse stragiudiziale documentazione_sanitaria spec
  {
    id: 'documentazione_sanitaria',
    title: 'La Documentazione Medica Prodotta',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    // DETERMINISTIC default: verbatim OCR reproduction (no LLM) via the
    // DOC_SANITARIA sentinel; the promptDirective below is the on-demand AI variant.
    isPlaceholder: true,
    placeholderText: DOC_SANITARIA_PLACEHOLDER,
    promptDirective: `${DOC_SANITARIA_INTRO}

${DOC_REPRODUCTION_RULES}

${DOC_SANITARIA_NEUTRALITY}

${ANTI_REPETITION_AND_LENGTH_RULES}
${NO_EVN_RULE}`,
  },
  {
    id: 'quadro_clinico',
    title: 'Quadro Clinico Attuale',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-medical', 'context-summaries'],
    contextMaxChars: 600,
    needsOcr: true,
    promptDirective: `Descrivi il quadro clinico attuale del periziando basandoti sulla documentazione piu recente.
Includi:
- Diagnosi attuali documentate
- Esiti degli ultimi accertamenti diagnostici e strumentali
- Terapie in corso
- Limitazioni funzionali documentate
- Stato clinico complessivo al momento dell'ultima documentazione disponibile
Stile descrittivo e fattuale. Riporta SOLO dati documentati.
NON includere la parte SOGGETTIVA (sintomatologia che il periziando riferisce in visita): quella la redige il perito. Riporta solo il quadro OGGETTIVO documentato.
${NO_EVN_RULE}`,
  },
  {
    id: 'prognosi',
    title: 'Valutazione Prognostica',
    maxTokens: TOKENS_MEDIUM,
    // No 'calculations' here: the graduated ITT/ITP table is rendered once, in
    // conclusioni_parere (mirrors parere_pro_veritate). Listing 'calculations'
    // on both sections made formatCalculationsForPrompt emit the reproduce-table
    // directive twice → duplicated table in the same report.
    dataSources: ['events-medical', 'context-summaries', 'guidelines'],
    contextMaxChars: 600,
    needsOcr: false,
    promptDirective: `Genera una valutazione prognostica basata sulla documentazione clinica disponibile.
Includi:
- Decorso clinico atteso sulla base della patologia documentata e della letteratura
- Tempistiche prevedibili di guarigione o stabilizzazione
- Eventuali necessita terapeutiche future prevedibili (interventi, riabilitazione, terapie)
- Esiti permanenti prevedibili sulla base del quadro attuale
NON quantificare percentuali di invalidita permanente — il perito le determinera.
Stile prudente e basato su evidenze documentali.
${NO_EVN_RULE}`,
  },
  {
    id: 'stima_riserva',
    title: 'Stima della Riserva',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui la stima della riserva tecnica, includendo:*

*- Danno biologico permanente stimato (range percentuale)*
*- Danno biologico temporaneo: periodi ITT e ITP con relative percentuali*
*- Spese mediche future prevedibili*
*- Eventuali costi per assistenza o protesi*
*- Riserva complessiva consigliata (range min-max)*
*- Note e avvertenze sulla stima]*`,
    promptDirective: '',
  },
  {
    id: 'conclusioni_parere',
    title: 'Conclusioni',
    maxTokens: TOKENS_TINY,
    dataSources: ['context-summaries', 'calculations'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Genera una breve sintesi conclusiva del parere scopo riserva (1-2 paragrafi).
Riepiloga:
- Il quadro clinico attuale in sintesi
- La prognosi attesa
- I dati quantitativi disponibili (periodi ITT/ITP, esiti documentati)
NON indicare importi o percentuali di invalidita — il perito li determinera.
Stile sintetico e formale.
${NO_EVN_RULE}`,
  },
];
