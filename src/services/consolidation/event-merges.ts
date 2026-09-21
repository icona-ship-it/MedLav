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

// ---------------------------------------------------------------------------
// Accesso in Pronto Soccorso = UNA voce (collaudo 2026-09-18: il verbale di PS
// dava 5 schede lo stesso giorno — accesso, triage, visita ortopedica, RX,
// dimissione). Triage, valutazioni, terapie e dimissione dell'episodio finiscono
// nella descrizione dell'accesso; gli esami strumentali restano voci proprie.
// ---------------------------------------------------------------------------

const PS_LEXICON_RE = /(pronto soccorso|\bp\.?\s?s\.?\b|\bdea\b|\bobi\b|osservazione breve)/i;
const WARD_ADMISSION_RE = /(ricoverat[oa] (in|presso|nel)|ricovero (in|presso|nel|ordinario)|trasferit[oa] (in|presso|nel)|si ricovera|viene ricoverat|regime ordinario|degenza in)/i;
const ACCESS_TITLE_RE = /(accesso|ricover|accettazion|ingresso|giunge|arriv|triage)/i;
const EPISODE_MEMBER_TYPES = new Set(['visita', 'ricovero', 'referto', 'diagnosi', 'follow-up', 'terapia', 'prescrizione']);

function timeMinutes(e: WorkEvent): number | null {
  const m = `${e.title} ${e.description}`.match(/\b(?:ore|alle)\s*(\d{1,2})(?:[:.](\d{2}))?\b/i);
  if (!m) return null;
  const h = Number(m[1]);
  if (h > 23) return null;
  return h * 60 + Number(m[2] ?? 0);
}

function mentionsPs(e: WorkEvent): boolean {
  return PS_LEXICON_RE.test(`${e.title} ${e.facility ?? ''}`);
}

function isEpisodeMember(e: WorkEvent): boolean {
  if (e.temporalScope !== 'corrente') return false;
  if (EPISODE_MEMBER_TYPES.has(e.eventType)) return true;
  return e.eventType === 'altro' && PS_LEXICON_RE.test(e.title);
}

function unionPages(a: ReadonlyArray<number> | undefined, b: ReadonlyArray<number> | undefined): number[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])].sort((x, y) => x - y);
}

function mergeNotes(a: string | null | undefined, b: string | null | undefined): string | null {
  const segs = [...(a ?? '').split(' | '), ...(b ?? '').split(' | ')].map((s) => s.trim()).filter(Boolean);
  const uniq = [...new Set(segs)];
  return uniq.length > 0 ? uniq.join(' | ') : null;
}

function collapseGroup(members: WorkEvent[]): WorkEvent {
  const anchors = members.filter(mentionsPs);
  const byAccess = anchors.filter((e) => ACCESS_TITLE_RE.test(e.title));
  const pool = byAccess.length > 0 ? byAccess : anchors;
  const survivor = [...pool].sort((x, y) => {
    const tx = timeMinutes(x);
    const ty = timeMinutes(y);
    if (tx !== null && ty !== null && tx !== ty) return tx - ty;
    return (y.confidence ?? 0) - (x.confidence ?? 0);
  })[0];
  const others = members.filter((e) => e !== survivor).sort((x, y) => {
    const tx = timeMinutes(x);
    const ty = timeMinutes(y);
    if (tx !== null && ty !== null) return tx - ty;
    if (tx !== null) return -1;
    if (ty !== null) return 1;
    return 0;
  });
  const merged: WorkEvent = { ...survivor, absorbedRowIds: [...(survivor.absorbedRowIds ?? [])], mutated: true };
  for (const o of others) {
    absorb(merged, o);
    if (o.description.trim() && !merged.description.includes(o.description)) {
      merged.description = `${merged.description}\n\n${o.title}: ${o.description}`;
    }
    merged.sourcePages = unionPages(merged.sourcePages, o.sourcePages);
    merged.reliabilityNotes = mergeNotes(merged.reliabilityNotes, o.reliabilityNotes);
    if (o.requiresVerification) merged.requiresVerification = true;
    if ((o.confidence ?? 0) > (merged.confidence ?? 0)) merged.confidence = o.confidence;
    if (!merged.doctor && o.doctor) merged.doctor = o.doctor;
    if (!merged.facility && o.facility) merged.facility = o.facility;
  }
  // La diagnosi: quella di dimissione se c'è, altrimenti la prima disponibile.
  const discharge = others.find((o) => /dimission/i.test(o.title) && o.diagnosis);
  merged.diagnosis = discharge?.diagnosis ?? survivor.diagnosis ?? others.find((o) => o.diagnosis)?.diagnosis ?? null;
  const fullText = `${merged.title} ${merged.description}`;
  merged.eventType = WARD_ADMISSION_RE.test(fullText) ? 'ricovero' : 'visita';
  if (!/accesso in pronto soccorso/i.test(merged.title)) {
    merged.title = merged.diagnosis
      ? `Accesso in Pronto Soccorso: ${merged.diagnosis}`
      : `Accesso in Pronto Soccorso — ${survivor.title.replace(/^(accesso|ricovero|visita|valutazione)\s+(in\s+|al\s+|presso\s+(il\s+)?)?(pronto soccorso|p\.?s\.?)\s*(per\s+)?/i, '')}`;
  }
  return merged;
}

/**
 * Nello stesso documento e nello stesso giorno, gli eventi «correnti» di un
 * accesso in PS (accesso/ricovero PS, triage, visite e consulenze, diagnosi,
 * terapie, dimissione) collassano in UNA voce. Tipo: 'ricovero' solo se il
 * testo attesta il ricovero in reparto, altrimenti 'visita' (un passaggio in PS
 * non è una degenza). Serve un evento-àncora con «Pronto Soccorso»/PS nel
 * titolo o nella struttura. Gli esami restano fuori.
 */
export function collapsePsEpisodes(events: WorkEvent[]): WorkEvent[] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e.eventDate || e.eventDate === SENTINEL_DATE || (e.datePrecision ?? 'giorno') !== 'giorno') continue;
    if (!isEpisodeMember(e)) continue;
    const key = `${e.documentId}|${e.eventDate}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  const dropped = new Set<number>();
  const replacement = new Map<number, WorkEvent>();
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const members = indices.map((i) => events[i]);
    if (!members.some(mentionsPs)) continue;
    const merged = collapseGroup(members);
    replacement.set(indices[0], merged);
    for (const i of indices.slice(1)) dropped.add(i);
  }
  if (replacement.size === 0) return events;
  return events.map((e, i) => replacement.get(i) ?? e).filter((_, i) => !dropped.has(i));
}
