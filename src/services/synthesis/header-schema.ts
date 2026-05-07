/**
 * Schema strutturato per l'intestazione del report medico-legale.
 *
 * **Why**: la generazione in prosa libera ha permesso al LLM di inventare un
 * intero paziente ("Mario Bianchi") al posto di quello reale ("Regnoto
 * Valeria") quando i metadati perizia erano vuoti. Forzando l'output in JSON
 * strutturato e validando con Zod, il modello non può creare campi che non
 * sono nei dati di input — al massimo li lascia null/omessi, che il template
 * traduce in "[da compilare dal perito]".
 */

import { z } from 'zod';

/**
 * Schema dei dati dell'intestazione. Tutti i campi sono nullable o opzionali
 * tranne minimal `paziente.nome` (deve essere noto o esplicitamente vuoto).
 */
export const HeaderDataSchema = z.object({
  /** Dati del professionista che firma il report. Null se non in metadati. */
  perito: z
    .object({
      nome: z.string().nullable(),
      qualifica: z.string().nullable(),
      specializzazione: z.string().nullable(),
      iscrizioneAlbo: z.string().nullable(),
    })
    .nullable(),

  /** Dati identificativi del periziando. */
  paziente: z.object({
    nome: z.string().nullable(),
    dataNascita: z.string().nullable(), // DD/MM/YYYY o ISO
    luogoNascita: z.string().nullable(),
    residenza: z.string().nullable(),
    codiceFiscale: z.string().nullable(),
    telefono: z.string().nullable(),
  }),

  /** Oggetto dell'incarico — descrizione neutra dell'evento e delle lesioni. */
  oggetto: z.object({
    eventoIndice: z.string().nullable(), // "Caduta accidentale" / "Sinistro stradale"
    dataEvento: z.string().nullable(), // DD/MM/YYYY
    lesione: z.string().nullable(), // "Frattura del collo femorale sinistro"
    struttura: z.string().nullable(), // "Ospedale Borgo Trento"
    ambito: z
      .enum([
        'rc_civile',
        'rc_auto',
        'penale',
        'previdenziale',
        'infortuni',
        'malpractice',
        'polizza_infortuni',
        'altro',
      ])
      .nullable(),
  }),

  /** Data della visita medico-legale (se prevista e nota). */
  dataVisitaMedicoLegale: z.string().nullable(),

  /** Soggetto richiedente (compagnia, studio legale, paziente). */
  soggettoRichiedente: z.string().nullable(),

  /** Tribunale, sezione, n. R.G. (per CTU/CTP). */
  giudiziale: z
    .object({
      tribunale: z.string().nullable(),
      sezione: z.string().nullable(),
      numeroRG: z.string().nullable(),
      giudice: z.string().nullable(),
      dataConferimento: z.string().nullable(),
      dataGiuramento: z.string().nullable(),
      ricorrente: z.string().nullable(),
      resistente: z.string().nullable(),
      ctpRicorrente: z.string().nullable(),
      ctpResistente: z.string().nullable(),
    })
    .nullable(),
});

export type HeaderData = z.infer<typeof HeaderDataSchema>;

/**
 * JSON-schema description embedded in the LLM prompt. Keep it short and
 * unambiguous — Mistral follows nullable patterns well when modeled as
 * `string | null`.
 */
export const HEADER_JSON_SCHEMA_DESCRIPTION = `Genera un oggetto JSON con questa struttura ESATTA. Per ogni campo, segui la regola assoluta: se il dato non è nei metadati né negli eventi/documenti forniti, scrivi \`null\`. MAI inventare valori plausibili.

\`\`\`json
{
  "perito": {
    "nome": string | null,
    "qualifica": string | null,
    "specializzazione": string | null,
    "iscrizioneAlbo": string | null
  } | null,
  "paziente": {
    "nome": string | null,
    "dataNascita": string | null,
    "luogoNascita": string | null,
    "residenza": string | null,
    "codiceFiscale": string | null,
    "telefono": string | null
  },
  "oggetto": {
    "eventoIndice": string | null,
    "dataEvento": string | null,
    "lesione": string | null,
    "struttura": string | null,
    "ambito": "rc_civile" | "rc_auto" | "penale" | "previdenziale" | "infortuni" | "malpractice" | "polizza_infortuni" | "altro" | null
  },
  "dataVisitaMedicoLegale": string | null,
  "soggettoRichiedente": string | null,
  "giudiziale": {
    "tribunale": string | null,
    "sezione": string | null,
    "numeroRG": string | null,
    "giudice": string | null,
    "dataConferimento": string | null,
    "dataGiuramento": string | null,
    "ricorrente": string | null,
    "resistente": string | null,
    "ctpRicorrente": string | null,
    "ctpResistente": string | null
  } | null
}
\`\`\`

REGOLE:
1. Per il "paziente": cerca il nome nei metadati. Se assente, leggilo dalle intestazioni dei documenti sanitari forniti negli eventi (es. "REGNOTO VALERIA"). Se ancora assente, \`null\`.
2. Per "oggetto": l'eventoIndice, dataEvento, lesione e struttura DEVONO provenire dagli eventi clinici (es. "frattura collo femore sx" del 13/12/2025 a "Borgo Trento"). MAI inventare lesioni o circostanze.
3. Per "perito": SOLO se nei metadati perizia. Se mancanti, l'intero oggetto \`perito\` deve essere \`null\`.
4. Per "giudiziale": SOLO per CTU/CTP. Per stragiudiziale o pareri privati, \`null\`.
5. Date: formato preferito DD/MM/YYYY. Se non presente, \`null\`.
6. NESSUN campo deve essere "[da compilare dal perito]" — usa \`null\`. Il marker testuale viene aggiunto dal template di rendering.

Restituisci ESCLUSIVAMENTE l'oggetto JSON, senza testo prima o dopo.`;

/**
 * Safely parse and validate raw JSON text from the LLM.
 * Returns null + error message if parse/validation fails.
 */
export function parseHeaderData(
  rawJson: string,
): { data: HeaderData; error: null } | { data: null; error: string } {
  let parsed: unknown;
  try {
    // Strip markdown code fence if present
    const cleaned = rawJson.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (e) {
    return { data: null, error: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  const result = HeaderDataSchema.safeParse(parsed);
  if (!result.success) {
    return { data: null, error: `Schema validation failed: ${result.error.message}` };
  }
  return { data: result.data, error: null };
}
