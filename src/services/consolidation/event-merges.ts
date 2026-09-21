/**
 * Fusioni deterministiche fra eventi (collaudo in produzione 2026-09-18):
 * «un fatto = una voce». Lo stesso accesso in PS raccontato dal verbale, dal
 * certificato del curante e dal referto della visita successiva compariva
 * tre volte nella cronistoria. Qui: stesso giorno, stessa famiglia clinica,
 * stesso nucleo clinico (procedura/distretto/lato) → una voce sola, con la
 * fonte primaria che vince sulla menzione e nessuna informazione persa.
 * Guardie (mai fondere): lati opposti, orari diversi nello stesso giorno,
 * diagnosi discordanti, medici diversi, precisione di data diversa.
 */
import { sourceLabels } from '@/lib/constants';
import { haveOppositeSides } from '@/lib/laterality';
import { temporalScopeRank } from '@/lib/temporal-scope';
import {
  absorb,
  hasConflictingTimeMarker,
  isDiagnosisSubset,
  sideText,
  type WorkEvent,
} from './event-consolidator';

const SENTINEL_DATE = '1900-01-01';

/** Famiglia clinica: tipi diversi che descrivono lo stesso genere di fatto. */
const FAMILY: Record<string, string> = {
  visita: 'episodio', ricovero: 'episodio', referto: 'episodio', diagnosi: 'episodio', 'follow-up': 'episodio',
  esame: 'esame', esame_strumentale: 'esame', esame_ematochimico: 'esame',
  intervento: 'intervento',
  terapia: 'terapia', prescrizione: 'terapia',
  certificato: 'certificato',
  complicanza: 'complicanza',
  altro: 'altro',
};

export function clinicalFamily(eventType: string): string | null {
  return FAMILY[eventType] ?? null;
}

/** Parole che raccontano COME il fatto è narrato, non il fatto. */
const FRAMING_WORDS = new Set([
  'pregress', 'pregresso', 'pregressa', 'riferit', 'riferito', 'riferita', 'anamnesi', 'anamnestic', 'storia', 'esiti', 'esito',
  'valutazion', 'valutato', 'valutata', 'accesso', 'visita', 'controllo', 'rivalutazion', 'programmat', 'previst', 'eseguit',
  'effettuat', 'post', 'dopo', 'seguito', 'causa', 'data', 'odierna', 'presso', 'altro', 'altra', 'sede', 'struttura',
  'documentat', 'visionat', 'referto', 'paziente', 'ambulatorial', 'specialistic', 'evento', 'episodio', 'giorno', 'stesso',
  'residuo', 'residua', 'esame', 'esami', 'intervento', 'terapia', 'prima', 'durante',
]);

const PHRASE_NORMALIZATIONS: ReadonlyArray<[RegExp, string]> = [
  [/pronto soccorso|\bp\.?\s?s\.?\b|\bdea\b/gi, ' ps '],
  [/tibio[-\s]?tarsic[aoi]|tibiotarsic[aoi]|articolazione della caviglia/gi, ' caviglia '],
  [/\bradiograf\w*|\brx\b/gi, ' rx '],
  [/\btomograf\w*|\btac\b|\btc\b/gi, ' tc '],
  [/\brisonanz\w*|\brmn\b|\brm\b/gi, ' rm '],
  [/\becograf\w*|\beco\b/gi, ' eco '],
  [/\bdestr\w*|\bdx\b|\bdex\b/gi, ' dx '],
  [/\bsinistr\w*|\bsx\b|\bsin\b/gi, ' sx '],
];

function stem(word: string): string {
  return word.length >= 5 ? word.replace(/[aeio]$/, '') : word;
}

/** Nucleo clinico di un titolo (+ diagnosi): procedure, distretti, lati, cause. */
export function clinicalCore(text: string): Set<string> {
  let t = text.toLowerCase();
  for (const [re, rep] of PHRASE_NORMALIZATIONS) t = t.replace(re, rep);
  const out = new Set<string>();
  for (const raw of t.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const w = /\d/.test(raw) ? raw : stem(raw);
    // Sigle con cifre (L1, A1, B2, D11, G2) sono decisive: livello, classificazione, grado.
    if (!/\d/.test(w) && (w.length < 2 || (w.length <= 3 && !['ps', 'rx', 'tc', 'rm', 'eco', 'dx', 'sx'].includes(w)))) continue;
    if (FRAMING_WORDS.has(w) || FRAMING_WORDS.has(raw)) continue;
    out.add(w);
  }
  return out;
}

/** True se i due nuclei clinici descrivono lo stesso fatto (Jaccard ≥ 0,6 o uno
 * contenuto nell'altro con almeno 3 elementi). */
export function clinicalCoreMatch(a: string, b: string): boolean {
  const ca = clinicalCore(a);
  const cb = clinicalCore(b);
  if (ca.size === 0 || cb.size === 0) return false;
  // Sigle con cifre diverse da entrambe le parti (A1 vs A3, L1 vs L2, 40 vs 30
  // giorni) = fatti diversi, qualunque sia il resto in comune.
  const da = [...ca].filter((w) => /\d/.test(w)).sort().join(' ');
  const db = [...cb].filter((w) => /\d/.test(w)).sort().join(' ');
  if (da && db && da !== db) return false;
  let inter = 0;
  for (const w of ca) if (cb.has(w)) inter++;
  const union = ca.size + cb.size - inter;
  if (inter / union >= 0.6) return true;
  const min = Math.min(ca.size, cb.size);
  return min >= 3 && inter === min;
}

function normalizedDoctor(d: string | null | undefined): string {
  return (d ?? '').toLowerCase().replace(/\b(dott|dr|prof|dott\.ssa|dr\.ssa)\.?(ssa)?\b\.?/g, '').replace(/[^\p{L}]+/gu, ' ').trim();
}

function isMention(e: WorkEvent): boolean {
  return e.temporalScope === 'retrospettivo' || e.temporalScope === 'programmato';
}

/** Priorità della fonte primaria per famiglia (più basso = vince). */
function sourceRank(family: string, sourceType: string): number {
  if (family === 'esame') {
    return sourceType === 'esame_strumentale' || sourceType === 'esame_ematochimico' ? 0 : sourceType === 'cartella_clinica' ? 1 : 2;
  }
  return sourceType === 'cartella_clinica' ? 0 : sourceType === 'referto_controllo' ? 1 : 2;
}

function coreText(e: WorkEvent): string {
  return `${e.title} ${e.diagnosis ?? ''}`;
}

/** True se a e b sono lo stesso fatto raccontato da due documenti diversi. */
export function isSameFactAcrossDocuments(a: WorkEvent, b: WorkEvent): boolean {
  if (a.documentId === b.documentId) return false;
  if (!a.eventDate || !b.eventDate || a.eventDate !== b.eventDate || a.eventDate === SENTINEL_DATE) return false;
  if ((a.datePrecision ?? 'giorno') !== (b.datePrecision ?? 'giorno')) return false;
  const fa = clinicalFamily(a.eventType);
  const fb = clinicalFamily(b.eventType);
  if (!fa || !fb || fa !== fb) return false;
  if (hasConflictingTimeMarker(a, b)) return false;
  if (haveOppositeSides(sideText(a), sideText(b))) return false;
  // Diagnosi discordanti = mai fondere; ma «Trauma distorsico tibio-tarsico destro»
  // (refuso OCR, genere) e «Trauma distorsivo tibio-tarsica destra» sono la stessa
  // diagnosi: vale il nucleo clinico, non il confronto letterale.
  if (
    a.diagnosis && b.diagnosis &&
    !isDiagnosisSubset(a.diagnosis, b.diagnosis) && !isDiagnosisSubset(b.diagnosis, a.diagnosis) &&
    !clinicalCoreMatch(a.diagnosis, b.diagnosis)
  ) return false;
  const da = normalizedDoctor(a.doctor);
  const db = normalizedDoctor(b.doctor);
  if (da && db && da !== db) return false;
  return clinicalCoreMatch(coreText(a), coreText(b));
}

function label(e: WorkEvent): string {
  return e.documentLabel ?? sourceLabels[e.sourceType] ?? e.sourceType.replace(/_/g, ' ');
}

function appendNote(e: WorkEvent, note: string): void {
  const prev = e.reliabilityNotes ?? '';
  if (prev.includes(note)) return;
  e.reliabilityNotes = prev ? `${prev} | ${note}` : note;
  e.mutated = true;
}

/** `s` (sopravvissuto) assorbe `a`: nessuna informazione persa. */
function mergeInto(s: WorkEvent, a: WorkEvent): void {
  absorb(s, a);
  s.mutated = true;
  const sMention = isMention(s);
  const aMention = isMention(a);
  if (aMention && !sMention) {
    appendNote(s, `Citato anche in: ${label(a)} («${a.title}»)`);
  } else if (aMention && sMention) {
    appendNote(s, `Riferito anche in: ${label(a)}`);
    if ((a.description ?? '').length > (s.description ?? '').length) s.description = a.description;
  } else {
    appendNote(s, `Documentato anche in: ${label(a)}`);
    if (!s.description.includes(a.description) && a.description.trim().length > 0) {
      s.description = `${s.description}\n\n[${label(a)}] ${a.description}`;
    }
  }
  if (!s.diagnosis && a.diagnosis) s.diagnosis = a.diagnosis;
  if (!s.doctor && a.doctor) s.doctor = a.doctor;
  if (!s.facility && a.facility) s.facility = a.facility;
  if (a.requiresVerification && !s.requiresVerification) s.requiresVerification = true;
  if (!aMention && (a.confidence ?? 0) > (s.confidence ?? 0)) s.confidence = a.confidence;
}

function survivorWins(s: WorkEvent, a: WorkEvent): boolean {
  const rs = temporalScopeRank(s.temporalScope);
  const ra = temporalScopeRank(a.temporalScope);
  if (rs !== ra) return rs < ra;
  const family = clinicalFamily(s.eventType) ?? '';
  const ss = sourceRank(family, s.sourceType);
  const sa = sourceRank(family, a.sourceType);
  if (ss !== sa) return ss < sa;
  return (s.confidence ?? 0) >= (a.confidence ?? 0);
}

/**
 * Fonde gli eventi che sono lo stesso fatto in documenti diversi. L'input è
 * ordinato per data; l'ordine relativo dei sopravvissuti è conservato.
 */
export function mergeCrossDocumentDuplicates(events: WorkEvent[]): WorkEvent[] {
  const dropped = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    if (dropped.has(i)) continue;
    for (let j = i + 1; j < events.length; j++) {
      if (dropped.has(j)) continue;
      const a = events[i];
      const b = events[j];
      if (b.eventDate !== a.eventDate) break;
      if (!isSameFactAcrossDocuments(a, b)) continue;
      if (survivorWins(a, b)) {
        mergeInto(a, b);
        dropped.add(j);
      } else {
        mergeInto(b, a);
        dropped.add(i);
        break;
      }
    }
  }
  return events.filter((_, i) => !dropped.has(i));
}
