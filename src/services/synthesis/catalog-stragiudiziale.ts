/**
 * Stragiudiziale section catalog (Sprint 2.6 split of section-catalog.ts).
 *
 * MECHANICAL extraction — string contents are byte-identical to the original
 * to preserve generation_metadata.promptVersion (ADR-011, Sprint 2.3 hash).
 */
import type { SectionSpec } from './section-generation-types';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import {
  TOKENS_TINY,
  TOKENS_SMALL,
  TOKENS_MEDIUM,
  TOKENS_NONE,
  NO_EVN_RULE,
  ANTI_REPETITION_AND_LENGTH_RULES,
  DOC_SANITARIA_PLACEHOLDER,
  DOC_SANITARIA_INTRO,
  DOC_REPRODUCTION_RULES,
  DOC_SANITARIA_NEUTRALITY,
} from './catalog-shared';
import {
  EPICRISI_FORMULATIONS,
  EPICRISI_EXAMPLE,
} from './peritale-formulations';

// ── Stragiudiziale sections (8, shorter structure) ──────────────────

export const STRAGIUDIZIALE_SECTIONS: SectionSpec[] = [
  {
    id: 'intestazione_stragiudiziale',
    title: 'Intestazione',
    maxTokens: TOKENS_TINY,
    dataSources: ['perizia-metadata', 'events-medical', 'events-non-medical'],
    contextMaxChars: 200,
    needsOcr: false,
    promptDirective: `Genera l'intestazione della perizia medico-legale stragiudiziale, replicando il FORMATO BENCHMARK Antoniazzi:

STRUTTURA OBBLIGATORIA (in quest'ordine):

1) RIGA 1 — NOME E TITOLO DEL PERITO (in alto, in grassetto, font grande):
   Esempio (FITTIZIO): "**Esempi dott. Mario**"

2) RIGHE SUCCESSIVE — SPECIALIZZAZIONI (una per riga, in grassetto corsivo):
   Esempi: "*Specialista in Ortopedia e Traumatologia*"
           "*Specialista in Terapia Fisica e Riabilitazione*"
           "*Specialista in Medicina Legale*"

3) RIGA INTRODUTTIVA — "In data DD MMMM YYYY ho sottoposto ad accertamenti clinici [in presenza di X, se documentato]"

4) BLOCCO DATI PAZIENTE (paragrafo unico, allineato a sinistra):
   - **Nome COGNOME** (in grassetto)
   - "Nato/a a LUOGO il DD/MM/YYYY e residente a LUOGO in INDIRIZZO"
   - "C.F. XXXXXXXXXXXXXXXX"
   - "MAIL: ..." (se documentato)
   - "TEL: ..." (se documentato)
   - "Avvocato di parte: ..." (se documentato)

5) RIGA SCOPO — "Al fine di valutare le lesioni patite in occasione di [EVENTO INDICE] occorso in data [DATA] in ambito di responsabilita civile."
   Adatta l'ambito al tipo caso: responsabilita civile / responsabilita professionale medica / infortunio sul lavoro / infortunio domestico / etc.

REGOLA ASSOLUTA — VIETATO INVENTARE DATI:
- Cerca PRIMA nei METADATI PERIZIA, POI nelle intestazioni dei DOCUMENTI/EVENTI sanitari (cartelle cliniche, referti).
- Se un dato non e' presente da nessuna parte, scrivi letteralmente \`[da compilare dal perito]\` o ometti la riga.
- VIETATO TASSATIVAMENTE: nomi inventati, codici fiscali fittizi, indirizzi, telefoni, date di nascita.

REGOLA ASSOLUTA — NESSUN RIFERIMENTO AL TRIBUNALE (segnalata dal perito 2026-05-11):
- La perizia medico-legale stragiudiziale NON c'entra con il tribunale.
- VIETATO menzionare: Giudice, Tribunale, Sezione, R.G. (Ruolo Generale), Quesiti del Giudice, ordinanza di conferimento, procedimento, udienza, parti processuali (ricorrente/resistente), CTU/CTP.
- L'incarico e' di parte (assicurazione, avvocato, paziente, medico di base) — non giudiziale.

Stile formale e conciso. Massimo 8-10 righe totali.
${NO_EVN_RULE}`,
  },
  {
    id: 'anamnesi',
    // Titolo con articolo come nei gold ("I DATI ANAMNESTICI").
    title: 'I Dati Anamnestici',
    maxTokens: TOKENS_SMALL,
    dataSources: ['events-medical'],
    contextMaxChars: 400,
    needsOcr: false,
    // Formato gold (Antoniazzi/Regnoto): scheda a righe telegrafiche etichettate,
    // non prosa. Dominanza e negazioni esplicite solo se documentate.
    promptDirective: `Genera i dati anamnestici del periziando come SCHEDA a righe brevi etichettate (formato dei benchmark depositati), NON in prosa:
"Paziente [destrimane/mancino/ambidestro]" (solo se documentato)
"In passato: [patologie pregresse e interventi rilevanti, separati da virgola]"
"Peso: Kg [N]" / "Altezza: [N]" (solo se documentati)
"Terapia cronica: [farmaci]" / "Terapia attuale: [farmaci]" (solo se documentate)
"Anamnesi familiare: [solo se pertinente e documentata]"
Una voce per riga; ometti le righe senza dato documentato. Riporta SOLO fatti documentati.
${NO_EVN_RULE}`,
  },
  {
    id: 'il_fatto_e_storia_clinica',
    title: 'Il Fatto e la Storia Clinica',
    maxTokens: TOKENS_MEDIUM,
    dataSources: ['events-medical', 'perizia-metadata'],
    contextMaxChars: 600,
    needsOcr: false,
    promptDirective: `Narrazione UNICA e COMPATTA dell'evento indice e dell'iter diagnostico-terapeutico successivo. 2-4 paragrafi totali (NON una sezione per fase). Allineato al benchmark Antoniazzi "IL FATTO E LA STORIA CLINICA" per perizia medico-legale RC.

ESEMPIO DI STILE (benchmark Antoniazzi):
"Mentre stava attraversando la strada sulla striscia pedonali di fronte alla Scuola Cangrande In Corso porta nuova 66, Verona, in data 12/09/2025 verso le ore 17.40 veniva investita da motociclo delle poste italiane. Cadeva a terra. Non ricorda svenimento. Ma ricorda il capannello di persone che si sono radunate attorno. Dopo essersi alzata una astante ha chiamato la mamma che e' intervenuta e sulle prime, un po' agitata, veniva portata a casa che dista pochi passi dal luogo dell'incidente. Successivamente, aumentando il dolore a livello del gomito destro, i genitori hanno contattato telefonicamente conoscente specialista ortopedico che consigliava di eseguire Rx dell'area dolente."

⚠ ATTENZIONE — GUARDRAIL ANTI-COPIA (regola assoluta):
L'esempio sopra serve SOLO a illustrare il REGISTRO LINGUISTICO (imperfetto/passato remoto, dettagli concreti, terza persona, prosa scorrevole). TUTTI i dati specifici (nomi di persona, date, luoghi, vie, numeri civici, scuole, mezzi coinvolti, parenti, ore precise) DEVONO derivare ESCLUSIVAMENTE dagli eventi clinici e dai metadati perizia forniti per IL CASO IN ELABORAZIONE. **VIETATO TASSATIVAMENTE** riportare nomi/date/luoghi dell'esempio (Antoniazzi, Scuola Cangrande, Corso Porta Nuova, 12/09/2025, motociclo Poste, "mamma", ecc.) nel report finale: sarebbe hallucination grave su perizia depositabile.

Includi in ordine cronologico:
- Data e circostanze dell'evento indice (luogo, ora, dinamica, modalita)
- Prime cure prestate (pronto soccorso, primo accesso medico) e diagnosi iniziale
- Visite e controlli successivi (data + specialista, raggruppati se ravvicinati)
- Interventi e terapie principali (data + tipo)
- Evoluzione clinica fino alla stabilizzazione

Stile narrativo in terza persona ("la paziente / il paziente"), ricostruzione fedele, dettagli concreti (luoghi, ore, persone presenti se documentate). Imperfetto/passato remoto.

LIMITI (anti-ridondanza):
- NON riprodurre integralmente i documenti — e' oggetto di "La Documentazione Medica Prodotta"
- NON anticipare la sintesi finale, le valutazioni e i dati ITT/ITP — sono oggetto dell'Epicrisi
- NON includere la parte SOGGETTIVA (cio' che il paziente riferisce oggi in visita) — quella e' nel placeholder "Visita Clinica" che compilera' il perito.
${NO_EVN_RULE}`,
  },
  {
    id: 'documentazione_sanitaria',
    title: 'La Documentazione Medica Prodotta',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    // Lavini (perizia RC "semplice"): gli esami ematochimici/di laboratorio NON
    // vanno riprodotti. Il flag si propaga alla variante selettiva/integrale
    // (buildDocSanitaria*Spec fa lo spread di ...spec).
    excludeLabTests: true,
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
    id: 'visita_clinica',
    // Titolo con articolo come nei gold ("LA VISITA CLINICA").
    title: 'La Visita Clinica',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    isPlaceholder: true,
    placeholderText: `*[Inserire qui i risultati della visita medico-legale:*

*SOGGETTIVAMENTE — Il/La periziando/a riferisce:*
*- Sintomatologia attuale*
*- Limitazioni funzionali*

*OBIETTIVAMENTE — All'esame obiettivo:*
*- Esame obiettivo generale e locale*
*- Eventuali esami strumentali]*`,
    promptDirective: '',
  },
  {
    // Ordine benchmark gold 2026-06-10 (Antoniazzi/Regnoto): la visita segue
    // direttamente la documentazione; le spese stanno in coda, prima
    // dell'Epicrisi che ne valuta la congruità (scheletro punto 7).
    id: 'spese_mediche',
    title: 'Spese Mediche',
    maxTokens: TOKENS_NONE,
    dataSources: [],
    contextMaxChars: 0,
    needsOcr: false,
    condition: 'has-expense-events',
    // DETERMINISTIC (B-pillar): table rendered from spesa_medica events at read
    // time — every voce inclusa (anche senza data → '—'), bollo come riga
    // separata, nessuna voce persa. Niente dipendenza dalla compliance LLM.
    isPlaceholder: true,
    placeholderText: `Le spese mediche documentate sono riepilogate nella tabella seguente, calcolata automaticamente dalle voci di spesa del fascicolo.

${DETERMINISTIC_MARKERS.SPESE}`,
    promptDirective: '',
  },
  {
    id: 'epicrisi',
    title: 'Epicrisi',
    maxTokens: TOKENS_MEDIUM,
    // NIENTE 'calculations': iniettava la tabella ITT/ITP graduata PROPOSTA
    // (formatCalculationsForPrompt) → l'LLM emetteva numeri ITT auto-inventati e spesso
    // errati ("57/57/58 [stima non supportata]" su Antoniazzi, gold 30+30). Contraddice C4
    // ("ITT graduata = scaffold del perito") e la direttiva qui sotto. I giorni di ricovero e
    // la durata complessiva (fatti) sono aggiunti DETERMINISTICAMENTE in coda via il marker
    // ITT_RICOVERO_FACTS; le fasce graduate restano scaffold che compila il perito.
    dataSources: ['context-summaries'],
    contextMaxChars: 0,
    needsOcr: false,
    promptDirective: `Epicrisi come SINTESI CONCLUSIVA della vicenda clinica. È la sezione finale del parere stragiudiziale (allineato al benchmark Antoniazzi).

Includi:
1. Sintesi cronologica essenziale dei fatti principali (1-2 paragrafi compatti)
2. Esiti clinici documentati rilevanti per il danno biologico. NON calcolare né scrivere tu i giorni di ricovero o la durata della malattia, e NON scrivere "non desumibile": i dati medico-legali calcolati (giorni di ricovero, durata complessiva del periodo di malattia) sono inseriti AUTOMATICAMENTE in coda alla sezione.
3. Eventuali spese mediche giudicate congrue (1 riga)

NON esprimere percentuali di invalidità né giudizi sul nesso causale — il perito li formulerà nello spazio dedicato in fondo.

LIMITI DELLA SEZIONE (anti-ridondanza):
- NON ri-narrare l'evento indice in dettaglio — è oggetto di "Il Fatto e la Storia Clinica"
- NON riprodurre i documenti — è oggetto della "Documentazione Medica Prodotta"
Qui SOLO sintesi essenziale + dati medico-legali calcolati.

Scrivi in prosa formale e densa.
${NO_EVN_RULE}
Quando disponibili, cita evidenze scientifiche pertinenti [Autore, Rivista, Anno].

${EPICRISI_FORMULATIONS}

${EPICRISI_EXAMPLE}`,
  },
];
