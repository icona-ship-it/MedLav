/**
 * Stragiudiziale section catalog (Sprint 2.6 split of section-catalog.ts).
 *
 * MECHANICAL extraction — string contents are byte-identical to the original
 * to preserve generation_metadata.promptVersion (ADR-011, Sprint 2.3 hash).
 */
import type { SectionSpec } from './section-generation-types';
import { DETERMINISTIC_MARKERS } from '@/services/calculations/deterministic-tables';
import { VISITA_CLINICA_PLACEHOLDER } from './visita-template';
import {
  TOKENS_TINY,
  TOKENS_SMALL,
  TOKENS_MEDIUM,
  TOKENS_NONE,
  NO_EVN_RULE,
  REGISTRO_ANAGRAFICO_RULE,
  ANTI_DISTORSIONE_RULE,
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
${NO_EVN_RULE}
${REGISTRO_ANAGRAFICO_RULE}
${ANTI_DISTORSIONE_RULE}`,
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
${NO_EVN_RULE}
${REGISTRO_ANAGRAFICO_RULE}
${ANTI_DISTORSIONE_RULE}`,
  },
  {
    id: 'il_fatto_e_storia_clinica',
    title: 'Il Fatto e la Storia Clinica',
    maxTokens: TOKENS_SMALL,
    dataSources: ['events-medical', 'perizia-metadata'],
    contextMaxChars: 600,
    needsOcr: false,
    // Lavini 2026-07-05: questa sezione era troppo lunga → deve essere un
    // RIASSUNTO breve (l'evento indice + primo soccorso condensato). Il decorso
    // clinico dettagliato (controlli, interventi, terapie, evoluzione) si sposta
    // nell'Epicrisi. Il Pronto Soccorso va condensato alle cose importanti.
    promptDirective: `RIASSUNTO breve e denso dell'evento indice e del primo soccorso. 1-2 paragrafi totali, MAI più di 2. Allineato al benchmark Antoniazzi "IL FATTO E LA STORIA CLINICA" per perizia medico-legale RC.

ESEMPIO DI STILE (dati INTERAMENTE FITTIZI — solo per il registro):
"Mentre stava attraversando la strada sulle strisce pedonali in via degli Esempi 1, Cittàdemo, in data 03/02/2020 verso le ore 11.15 veniva urtato da un velocipede. Cadeva a terra. Non ricorda svenimento, ma ricorda i passanti radunatisi attorno. Dopo essersi rialzato veniva accompagnato a casa da un familiare. Successivamente, aumentando il dolore a livello del polso sinistro, contattava il proprio medico curante che consigliava di eseguire Rx dell'area dolente."

⚠ ATTENZIONE — GUARDRAIL ANTI-COPIA (regola assoluta):
L'esempio sopra è INVENTATO e serve SOLO a illustrare il REGISTRO LINGUISTICO (imperfetto/passato remoto, dettagli concreti, terza persona, prosa scorrevole). TUTTI i dati specifici (nomi, date, luoghi, vie, mezzi coinvolti, parenti, ore, lati del corpo) DEVONO derivare ESCLUSIVAMENTE dagli eventi clinici e dai metadati perizia forniti per IL CASO IN ELABORAZIONE. **VIETATO TASSATIVAMENTE** riportare qualsiasi dettaglio dell'esempio (via degli Esempi, Cittàdemo, 03/02/2020, velocipede, polso sinistro) nel report: sarebbe hallucination grave su perizia depositabile. Un dettaglio di contesto (es. il luogo esatto) va scritto SOLO se attestato nei documenti del caso.

CONTENUTO (solo questo, in ordine cronologico):
- Data e circostanze dell'evento indice (luogo, ora, dinamica, modalità)
- Passaggio in Pronto Soccorso / primo accesso medico CONDENSATO alle cose importanti: la diagnosi principale e i provvedimenti-chiave. NON elencare ogni singolo accertamento, parametro o esame del PS — solo l'essenziale.

Stile narrativo in terza persona ("la paziente / il paziente"), ricostruzione fedele, dettagli concreti dell'evento (luoghi, ore, persone presenti se documentate). Imperfetto/passato remoto.

LIMITI (anti-ridondanza — TASSATIVI):
- FERMATI al primo soccorso. Il decorso clinico successivo (visite di controllo, interventi, terapie, evoluzione fino alla stabilizzazione) NON va qui: è oggetto dell'Epicrisi.
- Se l'evento indice È esso stesso un ricovero d'urgenza con intervento immediato (es. politrauma operato in emergenza), "il primo soccorso" include l'accesso, il ricovero iniziale e l'intervento in urgenza (menzionato in una riga: tipo + data); il decorso post-operatorio e i controlli successivi restano all'Epicrisi.
- NON riprodurre integralmente i documenti — è oggetto di "La Documentazione Medica Prodotta"
- NON anticipare la sintesi finale, le valutazioni e i dati ITT/ITP — sono oggetto dell'Epicrisi
- NON includere la parte SOGGETTIVA (ciò che il paziente riferisce oggi in visita) — quella è nel placeholder "Visita Clinica" che compilerà il perito.
${NO_EVN_RULE}
${REGISTRO_ANAGRAFICO_RULE}
${ANTI_DISTORSIONE_RULE}`,
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
${NO_EVN_RULE}
${REGISTRO_ANAGRAFICO_RULE}
${ANTI_DISTORSIONE_RULE}`,
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
    // Facsimile modificabile (feedback beta 2026-07-20): traccia completa di
    // esame obiettivo con slot, non più uno scheletro a 4 righe. Il campo
    // "Esame obiettivo" del form perizia, se compilato, sostituisce il blocco
    // a export-time (report-assembler).
    placeholderText: VISITA_CLINICA_PLACEHOLDER,
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
    // SEMPRE presente (CASO-2026-219, 2026-07-14): prima era condizionata a
    // 'has-expense-events' → nei casi senza spese out-of-pocket la sezione
    // spariva del tutto (il perito la cercava e non c'era, sembrava un pezzo
    // mancante). Ora c'è sempre; se vuota mostra lo stato onesto "nessuna spesa
    // documentata" (EMPTY_FALLBACK.SPESE) — struttura del report coerente.
    // DETERMINISTIC (B-pillar): table rendered from spesa_medica events at read
    // time — every voce inclusa (anche senza data → '—'), bollo come riga
    // separata, nessuna voce persa. Niente dipendenza dalla compliance LLM.
    isPlaceholder: true,
    // Registro peritale, non da software (audit 2026-07-16): "calcolata
    // automaticamente" rivelava lo strumento dentro l'atto depositabile.
    placeholderText: `Si riepilogano di seguito le spese mediche documentate in atti.

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
    // 'events-medical' (Lavini 2026-07-05): l'Epicrisi ora narra il DECORSO CLINICO
    // (spostato qui da "Il Fatto") → deve ricevere gli eventi medici, non solo i
    // riassunti delle sezioni precedenti, altrimenti il decorso sparirebbe o sarebbe inventato.
    dataSources: ['events-medical', 'context-summaries'],
    contextMaxChars: 0,
    needsOcr: false,
    // excludeLabTests (review 2026-07-06): l'Epicrisi riceve gli eventi medici
    // per il decorso, ma NON i lab di routine (rumore che gonfia il prompt e
    // aggrava il rischio di troncamento su macrodanno; un lab T1 load-bearing
    // resta comunque). Il decorso è fatto di visite/interventi/terapie, non di lab.
    excludeLabTests: true,
    promptDirective: `Epicrisi come SINTESI CONCLUSIVA della vicenda clinica. È la sezione finale del parere stragiudiziale (allineato al benchmark Antoniazzi).

Includi:
1. Breve richiamo dei fatti principali (1 paragrafo compatto) — SENZA ri-narrare la dinamica dell'evento in dettaglio (è ne "Il Fatto e la Storia Clinica").
2. DECORSO CLINICO successivo al primo soccorso, in forma di sintesi cronologica: visite e controlli specialistici (data + specialista, raggruppati se ravvicinati), interventi e terapie principali (data + tipo), evoluzione clinica fino alla stabilizzazione. Quando il decorso è documentato è la parte SOSTANZIALE della sezione; su un caso SEMPLICE con decorso minimo (poche visite di controllo, nessun ricovero) sintetizzalo in poche righe SENZA gonfiarlo né ri-narrare l'evento.
3. Esiti clinici documentati rilevanti per il danno biologico. NON calcolare né scrivere tu i giorni di ricovero o la durata della malattia, e NON scrivere "non desumibile": i dati medico-legali calcolati (giorni di ricovero, durata complessiva del periodo di malattia) sono inseriti AUTOMATICAMENTE in coda alla sezione.
4. NON scrivere importi o totali di spesa: la riga con il totale documentato è aggiunta AUTOMATICAMENTE in coda alla sezione (stesso valore della tabella Spese). La congruità la valuta il perito.

NON esprimere percentuali di invalidità né giudizi sul nesso causale — il perito li formulerà nello spazio dedicato in fondo.

FEDELTÀ DELLE DATE (prevenzione errori):
- Riporta la data di un esame SOLO se l'esame è effettivamente tra i fatti forniti, e con la SUA data esatta.
- NON attribuire un'unica data a più esami diversi (es. una RX e una RM svolte in giorni diversi): se hanno date diverse, indicale distintamente; se di un esame non hai la data tra i fatti, non inferirla.

LIMITI DELLA SEZIONE (anti-ridondanza):
- NON ri-narrare l'evento indice e il primo soccorso in dettaglio — sono oggetto di "Il Fatto e la Storia Clinica". Qui il decorso PARTE dopo il primo soccorso.
- NON riprodurre i documenti — è oggetto della "Documentazione Medica Prodotta"

Scrivi in prosa formale e densa.
${NO_EVN_RULE}
${REGISTRO_ANAGRAFICO_RULE}
${ANTI_DISTORSIONE_RULE}
NON citare letteratura o evidenze scientifiche: questa sezione non riceve fonti bibliografiche, quindi qualsiasi riferimento [Autore, Rivista, Anno] sarebbe inventato. Attieniti ai fatti clinici documentati.

${EPICRISI_FORMULATIONS}

${EPICRISI_EXAMPLE}`,
  },
];
