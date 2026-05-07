/**
 * Chain-of-Verification (CoVe) for anti-hallucination on critical sections.
 *
 * Pattern (Dhuliawala et al., 2023; refined for medico-legal use 2026):
 *   1. Generate baseline draft (already done by section-generator)
 *   2. LLM auto-generates 5-8 verification questions about factual claims
 *      in the draft (dates, diagnoses, numerical values, authors, facilities)
 *   3. LLM answers each question SEPARATELY using only the source events + OCR
 *      — no access to the draft, to avoid bias
 *   4. LLM revises the draft, removing/correcting any claim flagged as
 *      "non supportato dalle fonti"
 *
 * Measured 50-70% hallucination reduction in research benchmarks. Applied
 * selectively to the highest-stakes generative section (epicrisi, present
 * in stragiudiziale only — CTU/CTP send synthesis through the placeholder
 * considerazioni_ml which is not LLM-generated). Gated behind
 * LEGMED_COVE_ENABLED env flag (off by default) so the rollout can be staged.
 *
 * Cost overhead: ~3 extra LLM calls per CoVe-enabled section ≈ $0.05 per
 * stragiudiziale case at Mistral Large 3 pricing. Compatible with the user's
 * "quality > cost" preference.
 */

import {
  streamMistralChat,
  MISTRAL_MODELS,
  DETERMINISTIC_SEED,
  TIMEOUT_DEFAULT,
} from '@/lib/mistral/client';
import { logger } from '@/lib/logger';

export type VerificationCategory = 'date' | 'diagnosis' | 'numeric' | 'author' | 'fact';

export interface VerificationQuestion {
  question: string;
  category: VerificationCategory;
}

export interface VerificationAnswer extends VerificationQuestion {
  answer: string;
  /** True if the source events/OCR support this claim. */
  supported: boolean;
}

export interface CoVeResult {
  /** The revised content (== draft if no unsupported facts found). */
  revisedContent: string;
  questions: VerificationQuestion[];
  answers: VerificationAnswer[];
  /** Count of facts the verifier flagged as unsupported. */
  unsupportedFactsFound: number;
  /** True if the revisor actually changed the text. */
  wasRevised: boolean;
}

export interface RunCoVeParams {
  draftContent: string;
  sectionTitle: string;
  /** Pre-formatted events context (chronological, structured). */
  eventsContext: string;
  /** Optional OCR text — capped server-side to avoid timeout. */
  ocrContext?: string;
}

const MAX_OCR_CHARS_FOR_COVE = 60_000;

/**
 * Whether CoVe is enabled for this runtime.
 *
 * Wave 3.1 change: now ENABLED BY DEFAULT for medico-legal documents.
 * Set LEGMED_COVE_ENABLED=false to opt-out (kill switch). Cost is ~$0.10/case
 * which is negligible for documents that get filed in court.
 */
export function isCoVeEnabled(): boolean {
  return process.env.LEGMED_COVE_ENABLED !== 'false';
}

/**
 * Section IDs that get CoVe verification when enabled. Wave 3.1 extends to
 * include documentazione_sanitaria — the section most prone to citation
 * fabrication when the model loses anchor on the source documents.
 *
 * Note: CTU/CTP no longer have an LLM-generated "epicrisi" or
 * "conclusioni_quesiti" — both are merged into the placeholder
 * "considerazioni_ml" filled by the perito. So CoVe effectively applies to
 * stragiudiziale's epicrisi and to every role's documentazione_sanitaria.
 */
export const COVE_ELIGIBLE_SECTION_IDS: ReadonlySet<string> = new Set([
  'epicrisi',
  'documentazione_sanitaria',
]);

export async function runCoVe(params: RunCoVeParams): Promise<CoVeResult> {
  const { draftContent, sectionTitle, eventsContext, ocrContext } = params;
  const startMs = Date.now();

  // Step 1: generate verification questions
  const questions = await generateVerificationQuestions(draftContent, sectionTitle);

  if (questions.length === 0) {
    logger.warn('cove', `${sectionTitle}: no verification questions generated, skipping CoVe`);
    return {
      revisedContent: draftContent,
      questions: [],
      answers: [],
      unsupportedFactsFound: 0,
      wasRevised: false,
    };
  }

  // Step 2: answer all questions in one batched call (independent reasoning
  // per the prompt; batching is a cost optimization vs the canonical
  // per-question call).
  const answers = await answerVerificationQuestions(questions, eventsContext, ocrContext);

  const unsupported = answers.filter((a) => !a.supported);

  // Step 3: revise only if needed
  let revisedContent = draftContent;
  let wasRevised = false;
  if (unsupported.length > 0) {
    revisedContent = await reviseDraft(draftContent, unsupported, sectionTitle);
    wasRevised = revisedContent.trim() !== draftContent.trim();
  }

  logger.info(
    'cove',
    `${sectionTitle} done in ${Date.now() - startMs}ms: ${questions.length} questions, ${unsupported.length} unsupported, revised=${wasRevised}`,
  );

  return {
    revisedContent,
    questions,
    answers,
    unsupportedFactsFound: unsupported.length,
    wasRevised,
  };
}

// ── Step 1: generate verification questions ────────────────────────────

const QUESTION_GENERATION_SYSTEM_PROMPT = `Sei un verificatore di fatti per perizie medico-legali. Il tuo lavoro è prevenire fabbricazioni in un documento che il perito firmerà e depositerà in Tribunale.

Riceverai il DRAFT di una sezione di un report. Il tuo compito: generare 6-10 domande di verifica fattuale puntuali, ciascuna mirata a controllare se il draft contiene affermazioni non supportate dalle fonti.

PRIORITÀ DI VERIFICA (in ordine decrescente — copri OBBLIGATORIAMENTE le prime 3):

1. **IDENTITÀ DEL PERIZIANDO** — verifica che ogni nome, cognome, data di nascita, codice fiscale, indirizzo citato nel draft sia presente nelle fonti. Se nel draft compare "Mario Bianchi" o un CF, chiedi: "Il nome 'Mario Bianchi' / il CF 'XXX' è effettivamente presente nei documenti sorgente?".
2. **STRUTTURE SANITARIE E PROFESSIONISTI** — verifica che ogni ospedale/clinica/professionista citato (es. "Ospedale Niguarda", "Dott. Marco Rossi") provenga dalle fonti. Strutture inventate sono il segno-spia più frequente di fabbricazione.
3. **EVENTO INDICE E LESIONE** — verifica che l'evento (sinistro stradale, caduta, intervento) e la lesione descritta (frattura tibia, frattura femore) coincidano con gli eventi clinici forniti, sia per tipo che per data.

Aggiuntivamente:
- DATE specifiche citate (sono fra gli eventi documentati?)
- DIAGNOSI e PATOLOGIE menzionate (sono effettivamente nei documenti?)
- VALORI NUMERICI (giorni ITT/ITP, dosaggi, parametri vitali, valori lab)
- AFFERMAZIONI sul decorso clinico (complicanze, esiti, terapie)
- CITAZIONI VIRGOLETTATE — il testo tra "..." è copia-incolla letterale dai documenti?

Le domande devono essere chiuse e verificabili (es. "Il documento del 03.05.2024 conferma il dosaggio di enoxaparina 4000 UI?", non "il decorso è stato regolare?").

OUTPUT: oggetto JSON con campo "questions": array di { "question": string, "category": "date" | "diagnosis" | "numeric" | "author" | "fact" }.`;

async function generateVerificationQuestions(
  draft: string,
  sectionTitle: string,
): Promise<VerificationQuestion[]> {
  try {
    const { content } = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        { role: 'system', content: QUESTION_GENERATION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `DRAFT (sezione "${sectionTitle}"):\n\n${draft}\n\nGenera le domande di verifica in JSON.`,
        },
      ],
      temperature: 0,
      maxTokens: 2000,
      responseFormat: { type: 'json_object' },
      randomSeed: DETERMINISTIC_SEED,
      timeoutMs: TIMEOUT_DEFAULT,
      label: `cove:questions:${sectionTitle}`,
    });

    const parsed = JSON.parse(content) as { questions?: VerificationQuestion[] };
    if (!Array.isArray(parsed.questions)) return [];

    return parsed.questions
      .filter((q) => typeof q.question === 'string' && q.question.length > 5)
      .slice(0, 8);
  } catch (err) {
    logger.warn('cove', `Question generation failed for ${sectionTitle}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Step 2: answer questions from sources ──────────────────────────────

const ANSWER_SYSTEM_PROMPT = `Sei un revisore fattuale rigoroso. Riceverai una lista di domande di verifica e i dati sorgente (eventi clinici strutturati + eventuale testo OCR).

Per ciascuna domanda:
- Rispondi ESCLUSIVAMENTE basandoti sui dati sorgente forniti.
- "supported": true se i dati sorgente confermano l'affermazione; false se non si trova o se i dati contraddicono.
- "answer": breve risposta fattuale ("Si, confermato dal documento X del DD.MM.YYYY" oppure "Non trovato nelle fonti").
- NON usare conoscenza medica esterna ai dati sorgente.
- Rigoroso: in dubbio, marca come non supportato (precisione > recupero).

OUTPUT: oggetto JSON con campo "answers": array di { "question": string, "category": string, "answer": string, "supported": boolean } — uno per ogni domanda ricevuta, in stesso ordine.`;

async function answerVerificationQuestions(
  questions: VerificationQuestion[],
  eventsContext: string,
  ocrContext?: string,
): Promise<VerificationAnswer[]> {
  if (questions.length === 0) return [];

  const cappedOcr = ocrContext && ocrContext.length > MAX_OCR_CHARS_FOR_COVE
    ? `${ocrContext.slice(0, MAX_OCR_CHARS_FOR_COVE)}\n[... OCR troncato per CoVe]`
    : ocrContext ?? '';

  try {
    const { content } = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        { role: 'system', content: ANSWER_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `DOMANDE:\n${JSON.stringify({ questions }, null, 2)}\n\nEVENTI:\n${eventsContext}${cappedOcr ? `\n\nTESTO OCR:\n${cappedOcr}` : ''}\n\nRispondi a ogni domanda in JSON.`,
        },
      ],
      temperature: 0,
      maxTokens: 4000,
      responseFormat: { type: 'json_object' },
      randomSeed: DETERMINISTIC_SEED,
      timeoutMs: TIMEOUT_DEFAULT,
      label: 'cove:answers',
    });

    const parsed = JSON.parse(content) as { answers?: VerificationAnswer[] };
    if (!Array.isArray(parsed.answers)) return [];

    return parsed.answers.filter(
      (a) => typeof a.question === 'string' && typeof a.answer === 'string' && typeof a.supported === 'boolean',
    );
  } catch (err) {
    logger.warn('cove', `Answer phase failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ── Step 3: revise draft removing unsupported facts ────────────────────

const REVISION_SYSTEM_PROMPT = `Sei un revisore di report medico-legali. Riceverai un draft e una lista di fatti NON supportati dalle fonti.

Il tuo compito: produrre una versione revisionata del draft.

Regole:
- Mantieni la struttura, la prosa e tutti i fatti supportati.
- Per OGNI fatto non supportato: o rimuovilo, o sostituiscilo con "[non documentato]" o con formulazione cautelativa ("dato non risultante dalla documentazione in atti").
- NON inventare nuovi fatti per riempire i vuoti.
- NON cambiare lo stile o il tono medico-legale.
- NON aggiungere paragrafi. Mantieni la lunghezza simile al draft (con eventuali rimozioni puntuali).

OUTPUT: il testo revisionato in markdown plaintext, senza preamboli o JSON.`;

async function reviseDraft(
  draft: string,
  unsupported: VerificationAnswer[],
  sectionTitle: string,
): Promise<string> {
  if (unsupported.length === 0) return draft;

  const unsupportedListed = unsupported
    .map((u, i) => `${i + 1}. [${u.category}] ${u.question}\n   Risposta verifica: ${u.answer}`)
    .join('\n');

  try {
    const { content } = await streamMistralChat({
      model: MISTRAL_MODELS.MISTRAL_LARGE,
      messages: [
        { role: 'system', content: REVISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `DRAFT ORIGINALE (sezione "${sectionTitle}"):\n\n${draft}\n\nFATTI NON SUPPORTATI (rimuovere o cautelarsi):\n${unsupportedListed}\n\nProduci la versione revisionata.`,
        },
      ],
      temperature: 0,
      maxTokens: 8000,
      randomSeed: DETERMINISTIC_SEED,
      timeoutMs: TIMEOUT_DEFAULT,
      label: `cove:revise:${sectionTitle}`,
    });

    return content.trim();
  } catch (err) {
    logger.warn('cove', `Revision failed for ${sectionTitle}, returning original draft: ${err instanceof Error ? err.message : String(err)}`);
    return draft;
  }
}
