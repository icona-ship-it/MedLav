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

/** Il nucleo si legge dal TITOLO: la diagnosi ha la sua guardia a parte (un
 * refuso OCR nella diagnosi non deve diluire il confronto dei titoli). */
function coreText(e: WorkEvent): string {
  return e.title;
}

/** True se a e b sono lo stesso fatto raccontato da due documenti diversi. */
export function isSameFactAcrossDocuments(a: WorkEvent, b: WorkEvent): boolean {
  if (a.documentId === b.documentId) return false;
  if (!a.eventDate || !b.eventDate || a.eventDate !== b.eventDate || a.eventDate === SENTINEL_DATE) return false;
  if ((a.datePrecision ?? 'giorno') !== (b.datePrecision ?? 'giorno')) return false;
  const fa = clinicalFamily(a.eventType);
  const fb = clinicalFamily(b.eventType);
  if (!fa || !fb) return false;
  // Famiglie diverse solo quando una MENZIONE generica (altro/complicanza/diagnosi:
  // «Incidente stradale con trauma distorsivo…» nel certificato) cita il fatto
  // documentato da una fonte primaria: la menzione rientra nella fonte.
  if (fa !== fb && !mentionCanJoinPrimary(a, b) && !mentionCanJoinPrimary(b, a)) return false;
  if (hasConflictingTimeMarker(a, b)) return false;
  if (haveOppositeSides(sideText(a), sideText(b))) return false;
  // Un accesso in PS e l'ammissione in reparto sono due fatti (come per i calcoli):
  // il «Ricovero in Ortopedia» della lettera non rientra nell'accesso del verbale.
  if ((isWardAdmissionTitle(a) && mentionsPs(b)) || (isWardAdmissionTitle(b) && mentionsPs(a))) return false;
  // Diagnosi discordanti = mai fondere. Fra due fonti PRIMARIE basta una parola
  // («composta» vs «scomposta», «peroneale» vs «tibiale») per restare separate e
  // lasciare la ⚠ a markDiscrepancies (giro avversariale 2026-09-21). Con una
  // MENZIONE (che spesso ha refusi OCR: «distorsico») vale il nucleo clinico.
  if (a.diagnosis && b.diagnosis && !diagnosesCompatible(a, b)) return false;
  // Medici diversi bloccano solo fra due fonti PRIMARIE: il «medico» di una
  // menzione è di regola l'autore del documento che cita (il curante che scrive
  // il certificato), non chi ha fatto l'atto.
  if (!isMention(a) && !isMention(b)) {
    const da = normalizedDoctor(a.doctor);
    const db = normalizedDoctor(b.doctor);
    if (da && db && da !== db) return false;
  }
  return clinicalCoreMatch(coreText(a), coreText(b));
}

const GENERIC_MENTION_FAMILIES = new Set(['altro', 'complicanza', 'diagnosi']);

function sameCore(a: string, b: string): boolean {
  const ca = clinicalCore(a);
  const cb = clinicalCore(b);
  if (ca.size !== cb.size || ca.size === 0) return false;
  for (const w of ca) if (!cb.has(w)) return false;
  return true;
}

/** True se le due diagnosi possono descrivere lo stesso fatto. */
export function diagnosesCompatible(a: WorkEvent, b: WorkEvent): boolean {
  const da = a.diagnosis ?? '';
  const db = b.diagnosis ?? '';
  if (!da || !db) return true;
  if (isDiagnosisSubset(da, db) || isDiagnosisSubset(db, da)) return true;
  if (isMention(a) || isMention(b)) return clinicalCoreMatch(da, db);
  return sameCore(da, db);
}

/** «Mai perdere una diagnosi»: la diagnosi di un evento assorbito, se diversa e non
 * contenuta, resta nella descrizione del sopravvissuto; se i nuclei divergono, la
 * voce va in coda «da verificare» con il motivo. */
export function carryDiagnosis(target: WorkEvent, member: WorkEvent, memberLabel: string, opts: { strict: boolean } = { strict: true }): void {
  const d = (member.diagnosis ?? '').trim();
  if (!d) return;
  const t = (target.diagnosis ?? '').trim();
  if (!t) { target.diagnosis = d; target.mutated = true; return; }
  if (isDiagnosisSubset(d, t) || isDiagnosisSubset(t, d) || t.toLowerCase() === d.toLowerCase()) return;
  const line = `Diagnosi (${memberLabel}): ${d}`;
  if (!target.description.includes(line)) target.description = `${target.description}\n\n${line}`;
  target.mutated = true;
  // Fra fonti primarie (stesso documento, due referti) basta una parola («composta»
  // vs «scomposta») per andare in coda; con una menzione (refusi OCR) vale il nucleo.
  const compatible = opts.strict ? sameCore(t, d) : clinicalCoreMatch(t, d);
  if (!compatible) {
    target.requiresVerification = true;
    appendNote(target, `⚠ Diagnosi discordanti nella stessa voce: «${t}» vs «${d}» (${memberLabel}) — verificare sul documento`);
  }
}

function mentionCanJoinPrimary(mention: WorkEvent, primary: WorkEvent): boolean {
  return isMention(mention) && !isMention(primary) && GENERIC_MENTION_FAMILIES.has(clinicalFamily(mention.eventType) ?? '');
}

function label(e: WorkEvent): string {
  return e.documentLabel ?? sourceLabels[e.sourceType] ?? e.sourceType.replace(/_/g, ' ');
}

function mergeNotes(a: string | null | undefined, b: string | null | undefined): string | null {
  const segs = [...(a ?? '').split(' | '), ...(b ?? '').split(' | ')].map((s) => s.trim()).filter(Boolean);
  const uniq = [...new Set(segs)];
  return uniq.length > 0 ? uniq.join(' | ') : null;
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
  carryDiagnosis(s, a, label(a), { strict: !aMention });
  if (aMention && !sMention) {
    // Il medico/struttura di una menzione è di regola l'autore del documento che
    // cita (il curante del certificato): non diventa il medico dell'atto.
    if (a.doctor) appendNote(s, `${label(a)} firmato da ${a.doctor}`);
  } else {
    if (!s.doctor && a.doctor) s.doctor = a.doctor;
    if (!s.facility && a.facility) s.facility = a.facility;
  }
  if (a.requiresVerification && !s.requiresVerification) s.requiresVerification = true;
  // La ragione di un «da verificare» viaggia con il flag: le note del perdente restano.
  const merged = mergeNotes(s.reliabilityNotes, a.reliabilityNotes);
  if (merged !== (s.reliabilityNotes ?? null)) s.reliabilityNotes = merged;
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
/** Esito di ammissione in reparto attestato dal testo. */
const ADMISSION_OUTCOME_RE = /(esito\s*:?\s*ricover|viene ricoverat|si ricovera|ricoverat[oa] (in|presso|nel)|ricovero (in|presso|nel|ordinario)|trasferit[oa] (in|presso|nel)|destinazione\s*:?\s*(reparto|ricovero)|regime ordinario|degenza in)/i;
/** Ricovero solo proposto, consigliato, rifiutato o negato: NON è un'ammissione. */
const ADMISSION_REFUSAL_RE = /(rifiut|propost[oa] (il )?ricover|consigli\w* (il |di |un )?ricover|contro (il )?parere|non necessit|non (si |viene )?ricover|senza ricovero|non ricoverat|dimission[ei] volontari|lascia (il|lo) (ps|pronto soccorso)|abbandon)/i;
const DISCHARGE_HOME_RE = /(dimission\w* (a|al|verso il) domicilio|dimess[oa] (a|al) domicilio|dimess[oa] a casa|si dimette|rientra a domicilio)/i;
/** Titolo di ammissione in REPARTO (non un passaggio in PS). */
const WARD_TITLE_RE = /(\breparto\b|\bu\.?\s?o\.?\s?c?\b|degenza|ricovero ordinario|(ricover\w*|trasferi\w*|ammission\w*|ammess[oa])\s+(in|presso|nel|nella|al|alla)\b|(ricover\w*|trasferi\w*|ammess[oa])[^.\n]{0,25}(ortoped|chirurg|medicina|geriatr|neurolog|cardiolog|rianimazion|terapia intensiva))/i;
/** Àncora di un accesso: PS nel titolo/struttura SENZA parole di cornice (una visita di
 * controllo «post accesso in PS» non è un accesso). */
const FRAMING_BEFORE_PS_RE = /(controllo|post|dopo|successiv|esiti|pregress|riferit|per esiti|in seguito a|a seguito di|conseguent)\S*\s+(?:\S+\s+){0,4}(pronto soccorso|\bp\.?\s?s\.?\b)/i;

function isWardAdmissionTitle(e: WorkEvent): boolean {
  return WARD_TITLE_RE.test(e.title) && !PS_LEXICON_RE.test(e.title);
}
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

/** Vero accesso in PS: PS nel titolo/struttura, tipo di episodio, senza cornice
 * («Visita di controllo post accesso in PS» NON è un'àncora). */
function isPsAnchor(e: WorkEvent): boolean {
  if (!mentionsPs(e)) return false;
  if (!['visita', 'ricovero', 'referto', 'diagnosi'].includes(e.eventType)) return false;
  if (FRAMING_BEFORE_PS_RE.test(e.title)) return false;
  return true;
}

function isEpisodeMember(e: WorkEvent): boolean {
  if (e.temporalScope !== 'corrente') return false;
  // L'ammissione in reparto («Ricovero in Ortopedia») è un altro fatto: resta fuori.
  if (isWardAdmissionTitle(e)) return false;
  if (EPISODE_MEMBER_TYPES.has(e.eventType)) return true;
  return e.eventType === 'altro' && PS_LEXICON_RE.test(e.title);
}

function unionPages(a: ReadonlyArray<number> | undefined, b: ReadonlyArray<number> | undefined): number[] {
  return [...new Set([...(a ?? []), ...(b ?? [])])].sort((x, y) => x - y);
}


function collapseGroup(members: WorkEvent[]): WorkEvent {
  const anchors = members.filter(isPsAnchor);
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
  // La diagnosi principale: quella di dimissione se c'è, altrimenti quella del
  // sopravvissuto; le altre diagnosi dei membri restano nella descrizione (mai
  // perdere una diagnosi) e, se discordanti, mandano la voce in coda.
  const discharge = others.find((o) => /dimission/i.test(o.title) && o.diagnosis);
  merged.diagnosis = discharge?.diagnosis ?? survivor.diagnosis ?? null;
  for (const o of [survivor, ...others]) carryDiagnosis(merged, o, o.title);
  for (const o of others) {
    if (o.doctor && merged.doctor && normalizedDoctor(o.doctor) !== normalizedDoctor(merged.doctor)) {
      appendNote(merged, `${o.title}: ${o.doctor}`);
    }
  }
  const fullText = `${merged.title} ${merged.description}`;
  const modelSaidAdmission = members.some((m) => m.eventType === 'ricovero');
  const refusal = ADMISSION_REFUSAL_RE.test(fullText);
  const outcome = !refusal && ADMISSION_OUTCOME_RE.test(fullText);
  const home = DISCHARGE_HOME_RE.test(fullText);
  // Tipo: «ricovero» solo se il testo attesta l'ammissione (esito/ricoverato in…) o
  // il modello l'ha tipizzata così senza rifiuto né dimissione a domicilio; un
  // ricovero proposto/rifiutato non apre mai una degenza (giro avversariale 2026-09-21).
  if (refusal) {
    merged.eventType = 'visita';
    if (modelSaidAdmission) {
      merged.requiresVerification = true;
      appendNote(merged, 'Ricovero proposto o rifiutato secondo il testo: registrato come accesso in PS senza degenza, da confermare');
    }
  } else if (outcome) {
    merged.eventType = 'ricovero';
  } else {
    // Senza esito di ammissione nel testo un accesso in PS non apre una degenza,
    // anche se il modello l'aveva tipizzato «ricovero» (la degenza vera la porta
    // la cartella di reparto).
    merged.eventType = 'visita';
    if (modelSaidAdmission && !home) {
      appendNote(merged, 'Tipizzato «ricovero» dal modello senza esito di ammissione nel testo: registrato come accesso in PS senza degenza');
    }
  }
  if (!/accesso in pronto soccorso/i.test(merged.title)) {
    const rest = merged.diagnosis ?? survivor.title.replace(/^(accesso|ricovero|visita|valutazione)\s+(in\s+|al\s+|presso\s+(il\s+)?)?(pronto soccorso|p\.?s\.?)\s*(per\s+)?/i, '');
    // Con ricovero: «reparto» nel titolo, così i calcoli lo leggono come ammissione e non come passaggio in PS.
    merged.title = merged.eventType === 'ricovero'
      ? `Accesso in Pronto Soccorso con ricovero in reparto${merged.diagnosis ? ': ' : ' — '}${rest}`
      : `Accesso in Pronto Soccorso${merged.diagnosis ? ': ' : ' — '}${rest}`;
  }
  return merged;
}

/** Più accessi in PS nello stesso giorno (ritorno in PS): un episodio per àncora,
 * i membri vanno all'àncora con l'orario immediatamente precedente. */
function splitEpisodes(members: WorkEvent[]): WorkEvent[][] {
  const anchors = members.filter(isPsAnchor).filter((a) => ACCESS_TITLE_RE.test(a.title));
  const timed = anchors.map((a) => ({ a, t: timeMinutes(a) })).filter((x): x is { a: WorkEvent; t: number } => x.t !== null).sort((x, y) => x.t - y.t);
  const distinct = timed.filter((x, i) => i === 0 || x.t - timed[i - 1].t >= 60);
  if (distinct.length < 2) return [members];
  const groups: WorkEvent[][] = distinct.map(() => []);
  for (const m of members) {
    const t = timeMinutes(m);
    let idx = 0;
    if (distinct.some((d) => d.a === m)) idx = distinct.findIndex((d) => d.a === m);
    else if (t !== null) { for (let i = 0; i < distinct.length; i++) if (distinct[i].t <= t) idx = i; }
    groups[idx].push(m);
  }
  return groups.filter((g) => g.length > 0);
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
  const replacement = new Map<number, WorkEvent[]>();
  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const members = indices.map((i) => events[i]);
    if (!members.some(isPsAnchor)) continue;
    const episodes = splitEpisodes(members).map((g) => (g.length >= 2 && g.some(isPsAnchor) ? [collapseGroup(g)] : g)).flat();
    replacement.set(indices[0], episodes);
    for (const i of indices.slice(1)) dropped.add(i);
  }
  if (replacement.size === 0) return events;
  return events.flatMap((e, i) => (dropped.has(i) ? [] : (replacement.get(i) ?? [e])));
}

// ---------------------------------------------------------------------------
// Voci «spesa» senza importo né lessico fiscale ma con lessico di prestazione
// (collaudo 2026-09-18, P-1): sono prestazioni (sedute, trattamenti, visite),
// non spese. Tornano nella cronistoria clinica col tipo giusto.
// ---------------------------------------------------------------------------

const AMOUNT_RE = /((€|\beur\b|\beuro\b)\s*\d|\d\s*(€|\beur\b|\beuro\b)|\d{1,3}(?:[ .]\d{3})*,\d{2}\b|\bimporto\b|\btotale\b)/i;
const FISCAL_LEXICON_RE = /(fattur|ricevut|scontrin|pagat|pagamento|\biva\b|bollo|parcell|ticket|quietanz|onorari|rimbors)/i;
const THERAPY_LEXICON_RE = /(sedut[ae]|fisioterap|fisiochinesi|riabilitaz|trattament[oi] manual|massoterap|tecar|laser|ultrasuon|magnetoterap|kinesi|osteopat|esercizi|infiltrazion|medicazion)/i;
const VISIT_LEXICON_RE = /(visita|controllo|valutazione|consulenza)/i;

export const RECLASSIFIED_EXPENSE_NOTE =
  'Riclassificato dal sistema: nessun importo né riferimento fiscale nel testo — è una prestazione, non una spesa';

export function reclassifyPricelessExpenseEvents(events: WorkEvent[]): WorkEvent[] {
  return events.map((e) => {
    if (e.eventType !== 'spesa_medica') return e;
    // Una «spesa» senza data né importo è troppo ambigua per cambiarle tipo
    // (regola Lavini: le voci di spesa senza data non si perdono mai).
    if (!e.eventDate || e.eventDate === SENTINEL_DATE) return e;
    const text = `${e.title} ${e.description} ${e.sourceText ?? ''}`;
    if (AMOUNT_RE.test(text) || FISCAL_LEXICON_RE.test(text)) return e;
    const newType = THERAPY_LEXICON_RE.test(text) ? 'terapia' : VISIT_LEXICON_RE.test(text) ? 'visita' : null;
    if (!newType) return e;
    const prev = e.reliabilityNotes ?? '';
    return {
      ...e,
      eventType: newType,
      // Una spesa non ha ambito temporale: lo storico che elenca le prestazioni ne è la fonte.
      temporalScope: 'corrente',
      reliabilityNotes: prev.includes(RECLASSIFIED_EXPENSE_NOTE) ? prev : prev ? `${prev} | ${RECLASSIFIED_EXPENSE_NOTE}` : RECLASSIFIED_EXPENSE_NOTE,
      mutated: true,
    };
  });
}

// ---------------------------------------------------------------------------
// La prognosi di un certificato non è un evento a sé (collaudo 2026-09-18,
// P-11): «Prognosi di 40 giorni» datata all'inizio del periodo faceva scrivere
// all'Epicrisi «certificato del 18.04» per un certificato del 20.04. La riga
// entra nella descrizione del certificato dello stesso documento.
// ---------------------------------------------------------------------------

const PROGNOSIS_TITLE_RE = /(prognosi|inabilit|giorni di malattia|\bs\.c\.|salvo complicaz)/i;

export function foldPrognosisIntoCertificate(events: WorkEvent[]): WorkEvent[] {
  const dropped = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const x = events[i];
    if (x.eventType !== 'altro' || !PROGNOSIS_TITLE_RE.test(x.title)) continue;
    const candidates = events
      .map((e, j) => ({ e, j }))
      .filter(({ e, j }) => j !== i && !dropped.has(j) && e.documentId === x.documentId && e.eventType === 'certificato' && e.eventDate >= x.eventDate);
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => a.e.eventDate.localeCompare(b.e.eventDate));
    const cert = candidates[0].e;
    const line = (x.sourceText?.trim() || x.description.trim());
    const key = line.slice(0, 30).toLowerCase();
    if (line && !cert.description.toLowerCase().includes(key)) {
      cert.description = `${cert.description}\n\nPrognosi: ${line}`;
    }
    if (!cert.diagnosis && x.diagnosis) cert.diagnosis = x.diagnosis;
    if (x.requiresVerification) cert.requiresVerification = true;
    cert.sourcePages = unionPages(cert.sourcePages, x.sourcePages);
    absorb(cert, x);
    cert.mutated = true;
    dropped.add(i);
  }
  return dropped.size === 0 ? events : events.filter((_, i) => !dropped.has(i));
}

// ---------------------------------------------------------------------------
// Le prescrizioni date in visita stanno nella visita (misura sulle foto vere
// 2026-09-21: una visita + «Prescrizione …» + «Prescrizione terapia …» lo
// stesso giorno nello stesso referto = tre schede per un atto). Nello stesso
// documento e giorno, con UNA sola visita corrente, gli eventi prescrizione/
// terapia con lessico di prescrizione entrano nella descrizione della visita.
// ---------------------------------------------------------------------------

const PRESCRIPTION_LEXICON_RE = /(prescri|consigli|indicazion|si programma|si suggerisce|terapia domiciliare|posologia|da assumere|raccomand)/i;
const VISIT_CONTAINER_TYPES = new Set(['visita', 'follow-up']);

export function foldPrescriptionsIntoVisit(events: WorkEvent[]): WorkEvent[] {
  const groups = new Map<string, number[]>();
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e.eventDate || e.eventDate === SENTINEL_DATE || (e.datePrecision ?? 'giorno') !== 'giorno' || e.temporalScope !== 'corrente') continue;
    const key = `${e.documentId}|${e.eventDate}`;
    const g = groups.get(key);
    if (g) g.push(i);
    else groups.set(key, [i]);
  }
  const dropped = new Set<number>();
  for (const indices of groups.values()) {
    const visits = indices.filter((i) => VISIT_CONTAINER_TYPES.has(events[i].eventType));
    if (visits.length !== 1) continue;
    const visit = events[visits[0]];
    const rx = indices.filter((i) => {
      const e = events[i];
      return (e.eventType === 'prescrizione' || e.eventType === 'terapia') && PRESCRIPTION_LEXICON_RE.test(`${e.title} ${e.description.slice(0, 120)}`);
    });
    if (rx.length === 0) continue;
    for (const i of rx) {
      const p = events[i];
      absorb(visit, p);
      if (p.description.trim() && !visit.description.includes(p.description)) {
        visit.description = `${visit.description}\n\n${p.title}: ${p.description}`;
      }
      visit.sourcePages = unionPages(visit.sourcePages, p.sourcePages);
      visit.reliabilityNotes = mergeNotes(visit.reliabilityNotes, p.reliabilityNotes);
      if (p.requiresVerification) visit.requiresVerification = true;
      visit.mutated = true;
      dropped.add(i);
    }
  }
  return dropped.size === 0 ? events : events.filter((_, i) => !dropped.has(i));
}
