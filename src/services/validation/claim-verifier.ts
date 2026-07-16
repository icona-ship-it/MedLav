/**
 * Verifica claim-level anti-"misgrounded" (ricerca 2026-07-04).
 *
 * Il rischio residuo che il verbatim-check non copre: una frase del report che
 * cita il documento giusto ma afferma qualcosa che il documento NON supporta
 * (misurato al 50-90% nei sistemi medici — SourceCheckup, Nature Comm. 2025).
 * Pattern Harvey: decomposizione della sezione in claim fattuali → verifica di
 * ogni claim contro gli eventi consolidati (già hard-verificati contro l'OCR)
 * con un modello DIVERSO dal generatore (mistral-medium vs mistral-large:
 * il self-preference bias dei judge è misurato).
 *
 * NON auto-corregge: i claim non supportati diventano una lista "da
 * verificare" per il perito nel pannello di revisione.
 */

import {
  MISTRAL_MODELS,
  streamMistralChat,
  assertNotTruncated,
  DETERMINISTIC_SEED,
  TIMEOUT_DEFAULT,
  type MistralResponseFormat,
} from '@/lib/mistral/client';
import type { TokenUsage } from '@/services/cost-tracking/cost-calculator';
import { logger } from '@/lib/logger';

/** Sezioni narrative dove il misgrounding si nasconde (la doc-sanitaria è già
 * coperta dall'hard-verify verbatim; qui vanno le sezioni SINTETIZZATE).
 * NB: l'anamnesi RC ha heading "I Dati Anamnestici" → canonicalId slug
 * 'i_dati_anamnestici' (nessun pattern in SECTION_ID_MAP); 'anamnesi' resta
 * per heading generici (review 2026-07-04: senza lo slug era sempre no-op). */
export const CLAIM_VERIFY_SECTION_IDS: readonly string[] = [
  'anamnesi',
  'i_dati_anamnestici',
  'il_fatto_e_storia_clinica',
  'epicrisi',
];

/** Sotto questa lunghezza una sezione non ha abbastanza claim da giustificare una chiamata. */
const MIN_SECTION_CHARS = 200;
/** Cap sul numero di claim per sezione (costo + attenzione del revisore). */
const MAX_CLAIMS_PER_SECTION = 25;

export type ClaimVerdictLevel = 'supportato' | 'non_supportato' | 'non_verificabile';

export interface ClaimVerdict {
  claim: string;
  verdict: ClaimVerdictLevel;
  motivo: string;
}

export interface SectionClaimResult {
  sectionId: string;
  sectionTitle: string;
  verdicts: ClaimVerdict[];
  usage: TokenUsage;
}

export interface ClaimEventDigest {
  orderNumber: number;
  eventDate: string | null;
  title: string;
  description: string;
  sourceText?: string | null;
}

const CLAIM_VERIFY_SCHEMA: MistralResponseFormat = {
  type: 'json_schema',
  jsonSchema: {
    name: 'claim_verification',
    strict: true,
    schemaDefinition: {
      type: 'object',
      properties: {
        claims: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              claim: { type: 'string', description: 'Il claim fattuale, citato brevemente' },
              verdict: {
                type: 'string',
                enum: ['supportato', 'non_supportato', 'non_verificabile'],
              },
              motivo: { type: 'string', description: 'Motivazione in una frase' },
            },
            required: ['claim', 'verdict', 'motivo'],
            additionalProperties: false,
          },
        },
      },
      required: ['claims'],
      additionalProperties: false,
    },
  },
};

function buildJudgeSystemPrompt(): string {
  return `Sei un verificatore fattuale INDIPENDENTE per perizie medico-legali. Ricevi una sezione di report e la FONTE DI VERITÀ: l'elenco degli EVENTI CLINICI documentati e, quando presenti, i RIASSUNTI DEI DOCUMENTI del fascicolo (entrambi fanno fede: un claim attestato da uno qualsiasi dei due è supportato).

COMPITO: scomponi la sezione nei suoi claim fattuali (fatti clinici, date, diagnosi, terapie, dinamiche — NON giudizi valutativi o formule di stile) e per ciascuno emetti un verdetto.
REGOLA ASSOLUTA: estrai i claim ESCLUSIVAMENTE da frasi presenti nel testo della «SEZIONE DA VERIFICARE». Gli eventi e i riassunti/OCR sono SOLO l'evidenza per il verdetto — MAI una fonte di claim. Se la sezione è telegrafica, fatta di placeholder o non contiene affermazioni fattuali, restituisci una lista VUOTA.
Verdetti possibili:
- "supportato": il claim è attestato dagli eventi (anche con parafrasi)
- "non_supportato": il claim afferma qualcosa che gli eventi non attestano O contraddicono (date diverse, diagnosi diverse, fatti assenti)
- "non_verificabile": deciderlo richiederebbe i documenti originali

REGOLE:
- Massimo ${MAX_CLAIMS_PER_SECTION} claim: privilegia quelli clinicamente rilevanti (diagnosi, date, lateralità, terapie, esiti).
- Un claim con negazione invertita o lateralità/valore diverso dagli eventi è "non_supportato", non "non_verificabile".
- I placeholder tra parentesi quadre e le sezioni dichiaratamente da compilare NON sono claim.
- Rispondi SOLO col JSON richiesto.`;
}

/** Cap sull'evidenza aggiuntiva: i riassunti di ~80 documenti non devono
 * dominare il prompt del judge (mistral-medium, 4K output). */
const MAX_EXTRA_EVIDENCE_CHARS = 30_000;

function buildJudgeUserPrompt(sectionTitle: string, sectionContent: string, events: ClaimEventDigest[], extraEvidence?: string): string {
  const digest = events
    .map((e) => `- [${e.eventDate ?? 'data sconosciuta'}] ${e.title}: ${e.description}${e.sourceText ? ` («${e.sourceText}»)` : ''}`)
    .join('\n');
  // Riassunti-documento come SECONDA fonte di verità (audit 2026-07-16, Motta):
  // il generatore li riceve legittimamente nel contesto → fatti veri narrati da
  // lì venivano flaggati "non supportato" perché il judge vedeva solo gli eventi
  // (6 falsi errori rossi su 222 = fiducia del medico bruciata).
  const extra = extraEvidence?.trim()
    ? `\n\nRIASSUNTI DEI DOCUMENTI (fonte di verità aggiuntiva):\n${extraEvidence.slice(0, MAX_EXTRA_EVIDENCE_CHARS)}${extraEvidence.length > MAX_EXTRA_EVIDENCE_CHARS ? '\n[…riassunti troncati…]' : ''}`
    : '';
  return `EVENTI CLINICI DOCUMENTATI (fonte di verità):\n${digest}${extra}\n\nSEZIONE DA VERIFICARE — «${sectionTitle}»:\n${sectionContent}`;
}

/**
 * Verifica i claim di UNA sezione contro gli eventi. Ritorna [] senza chiamare
 * l'LLM per sezioni troppo corte o senza eventi (niente da verificare contro).
 */
export async function verifySectionClaims(params: {
  sectionId: string;
  sectionTitle: string;
  sectionContent: string;
  events: ClaimEventDigest[];
  /** Evidenza aggiuntiva (riassunti-documento): fatti veri narrati da lì non
   * devono risultare "non supportato". Opzionale, retro-compatibile. */
  extraEvidence?: string;
}): Promise<SectionClaimResult> {
  const empty: SectionClaimResult = {
    sectionId: params.sectionId,
    sectionTitle: params.sectionTitle,
    verdicts: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };

  if (params.sectionContent.trim().length < MIN_SECTION_CHARS) return empty;
  if (params.events.length === 0) return empty;

  const result = await streamMistralChat({
    model: MISTRAL_MODELS.MISTRAL_MEDIUM,
    messages: [
      { role: 'system', content: buildJudgeSystemPrompt() },
      { role: 'user', content: buildJudgeUserPrompt(params.sectionTitle, params.sectionContent, params.events, params.extraEvidence) },
    ],
    temperature: 0,
    maxTokens: 4096,
    responseFormat: CLAIM_VERIFY_SCHEMA,
    randomSeed: DETERMINISTIC_SEED,
    timeoutMs: TIMEOUT_DEFAULT,
    label: `claim-verify:${params.sectionId}`,
  });
  assertNotTruncated(result, `claim-verify:${params.sectionId}`);

  const parsed = parseClaimVerdicts(result.content);
  // Scarta i claim SENZA riscontro testuale nella sezione: sono fabbricazioni
  // del judge (mai mostrare al perito un "errore" su una frase che non esiste).
  const grounded = parsed.filter((v) => isClaimGroundedInSection(v.claim, params.sectionContent));
  if (grounded.length < parsed.length) {
    logger.warn('claim-verifier', `Sezione ${params.sectionId}: ${parsed.length - grounded.length}/${parsed.length} claim del judge senza riscontro nel testo — scartati come fabbricazioni`);
  }
  return {
    sectionId: params.sectionId,
    sectionTitle: params.sectionTitle,
    verdicts: grounded.slice(0, MAX_CLAIMS_PER_SECTION),
    usage: result.usage,
  };
}

/**
 * I PLACEHOLDER del report ("[da compilare dal perito]", "[inserire...]") non
 * sono claim fattuali: il prompt lo dice ma il judge li flagga comunque come
 * non_verificabile (visto sul primo run reale, Motta: 5 finding-rumore su 7).
 * Filtro deterministico, non affidato al prompt.
 */
export function isPlaceholderClaim(claim: string): boolean {
  return /\[(?:da compilare|inserire|a cura del perito|dato mancante)/i.test(claim);
}

/**
 * ANCORAGGIO del claim al testo della sezione (caso 224 v2, 2026-07-17): con una
 * sezione quasi vuota (anamnesi telegrafica) e molta evidenza nel prompt, il judge
 * ha FABBRICATO 8 claim pescandoli dall'evidenza ("ricoverata 3 giorni", "triage
 * giallo") — frasi che nel report NON esistevano. Un claim vale solo se ha
 * riscontro testuale nella sezione: almeno metà delle sue parole-contenuto deve
 * comparire nel testo (radici a 6 caratteri: tollera "eseguito/eseguita").
 * Deterministico: i claim inventati (sovrapposizione ~zero) cadono sempre.
 */
export function isClaimGroundedInSection(claim: string, sectionContent: string): boolean {
  const norm = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const content = norm(sectionContent);
  const words = norm(claim).match(/[a-z0-9]{4,}/g) ?? [];
  if (words.length === 0) return true; // nessuna parola-contenuto: non giudicabile → tieni (conservativo)
  const found = words.filter((w) => content.includes(w.slice(0, 6))).length;
  return found / words.length >= 0.5;
}

/** Parsing difensivo del JSON del judge (mai far fallire la pipeline per il verifier). */
export function parseClaimVerdicts(content: string): ClaimVerdict[] {
  try {
    const parsed = JSON.parse(content) as { claims?: unknown };
    if (!Array.isArray(parsed.claims)) return [];
    const valid: ClaimVerdict[] = [];
    for (const raw of parsed.claims) {
      if (!raw || typeof raw !== 'object') continue;
      const c = raw as Record<string, unknown>;
      const verdict = c.verdict;
      if (verdict !== 'supportato' && verdict !== 'non_supportato' && verdict !== 'non_verificabile') continue;
      if (typeof c.claim !== 'string' || c.claim.trim().length === 0) continue;
      if (isPlaceholderClaim(c.claim)) continue;
      valid.push({
        claim: c.claim.slice(0, 300),
        verdict,
        motivo: typeof c.motivo === 'string' ? c.motivo.slice(0, 300) : '',
      });
    }
    return valid;
  } catch (err) {
    logger.warn('claim-verifier', `JSON judge non parsabile: ${err instanceof Error ? err.message : 'unknown'}`);
    return [];
  }
}
