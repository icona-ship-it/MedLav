/**
 * Renderizza l'oggetto HeaderData (JSON validato) in markdown formale.
 *
 * **Contratto**: questa funzione è l'UNICO modo in cui i campi anagrafici
 * arrivano nel report. Se il LLM omette un campo (null), il template lo
 * sostituisce con il marker `[da compilare dal perito]` o lo nasconde,
 * SENZA ricorrere a fallback inventati. Questo è il fix strutturale che
 * impedisce hallucinazioni come quella del caso Regnoto.
 *
 * rc-mvp fase 7: restano SOLO la variante stragiudiziale (carta intestata
 * stile MOTTA/Antoniazzi, decisioni Lavini 2026-06-23). Le varianti
 * ctu/ctp/parere (renderGiudizialeHeader, blocco operativo, conferimento,
 * overlay giudiziale) vivono su main e nel tag full-app-2026-07-02.
 */

import type { HeaderData } from './header-schema';

const TBD = '[da compilare dal perito]';

/**
 * Genere del periziando dal CODICE FISCALE (dato certo, non inferenza dal nome):
 * nei CF italiani il giorno di nascita (posizioni 10-11) è aumentato di 40 per
 * le donne. Ritorna 'f' | 'm' | null (CF assente/malformato → null).
 */
export function genderFromCodiceFiscale(cf: string | null | undefined): 'f' | 'm' | null {
  if (!cf) return null;
  const clean = cf.trim().toUpperCase();
  if (!/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z0-9]{4}[A-Z]$/.test(clean)) return null;
  const day = parseInt(clean.slice(9, 11), 10);
  if (isNaN(day)) return null;
  return day > 40 ? 'f' : 'm';
}

/**
 * "in presenza di padre:" → "in presenza del padre:" (audit 2026-07-16): l'LLM
 * riempie lo slot col sostantivo nudo e la prima frase dell'atto esce sgrammaticata.
 * Aggiunge l'articolo solo ai gradi di parentela noti al singolare; se il valore
 * ha già articolo/possessivo o è un nome proprio, resta com'è. Pura.
 */
export function normalizeAccompagnatore(value: string): string {
  const v = value.trim();
  if (/^(del|della|dei|delle|di |il |la |un |una |su[oa] )/i.test(v)) return v;
  const ARTICLE: Record<string, string> = {
    padre: 'del padre', madre: 'della madre', marito: 'del marito', moglie: 'della moglie',
    figlio: 'del figlio', figlia: 'della figlia', fratello: 'del fratello', sorella: 'della sorella',
    tutore: 'del tutore', tutrice: 'della tutrice', nonno: 'del nonno', nonna: 'della nonna',
    zio: 'dello zio', zia: 'della zia', compagno: 'del compagno', compagna: 'della compagna',
  };
  const key = v.toLowerCase();
  return ARTICLE[key] ? ARTICLE[key] : v;
}

/**
 * Render header markdown from validated JSON. Pure function.
 */
export function renderHeaderMarkdown(data: HeaderData): string {
  // Stragiudiziale: carta intestata stile Antoniazzi/MOTTA (benchmark gold
  // 2026-06-10, decisioni Lavini 2026-06-23).
  return `## Intestazione\n\n${renderStragiudizialeHeader(data)}`.trim();
}

/**
 * Intestazione stragiudiziale in stile carta intestata (benchmark Antoniazzi /
 * Regnoto, gold 2026-06-10): nome del perito in grassetto + specializzazioni in
 * corsivo una per riga, riga "In data X ho sottoposto ad accertamenti clinici e
 * valutazione medico legale, con il suo consenso", dati del periziando riga per
 * riga, riga-scopo "Al fine di valutare le lesioni patite...". NESSUN
 * riferimento al tribunale: l'incarico è di parte. Campi mancanti →
 * "[da compilare dal perito]", mai inventati. Pura.
 */
function renderStragiudizialeHeader(data: HeaderData): string {
  const lines: string[] = [];
  const p = data.paziente;

  // Carta intestata del perito: testo PIANO come nei benchmark (MOTTA/Antoniazzi),
  // senza grassetto/corsivo markdown (decisione Lavini 2026-06-23, #7).
  if (data.perito?.nome) {
    lines.push(data.perito.nome);
    if (data.perito.specializzazione) {
      for (const spec of data.perito.specializzazione.split(/\n|;|\s\/\s/).map((s) => s.trim()).filter(Boolean)) {
        lines.push(spec);
      }
    }
    if (data.perito.iscrizioneAlbo) lines.push(`Iscrizione Albo: ${data.perito.iscrizioneAlbo}`);
    if (data.perito.email) lines.push(`E-mail: ${data.perito.email}`);
    if (data.perito.pec) lines.push(`PEC: ${data.perito.pec}`);
  } else {
    lines.push(TBD);
  }
  lines.push('');

  // Riga visita. Niente "con il suo consenso": MOTTA/Antoniazzi non lo scrivono
  // (decisione Lavini 2026-06-23, #2 — allineare ai benchmark di riferimento).
  // Accompagnatore alla VISITA MEDICO-LEGALE: la visita del perito avviene DOPO
  // i documenti in atti, quindi non può risultare da essi — il modello lo
  // deduceva dall'accompagnatore in Pronto Soccorso (gate gold 2026-09-04, caso
  // A, P1 fedeltà). Lo scrive il perito, come la data della visita: la riga
  // resta senza clausola. `normalizeAccompagnatore` resta per usi futuri (campo
  // del perito nei metadati).
  lines.push(`In data ${data.dataVisitaMedicoLegale ?? TBD} ho sottoposto ad accertamenti clinici e valutazione medico legale:`);
  lines.push('');

  // Dati del periziando, riga per riga (gold Antoniazzi).
  lines.push(`**${p.nome ?? TBD}**`);
  if (p.luogoNascita || p.dataNascita) {
    // Genere dal CF quando disponibile (audit 2026-07-16): "Nato/a" non risolto
    // in un atto con perizianda identificata era una stonatura immediata.
    const gender = genderFromCodiceFiscale(p.codiceFiscale);
    let nato = gender === 'f' ? 'Nata' : gender === 'm' ? 'Nato' : 'Nato/a';
    if (p.luogoNascita) nato += ` a ${p.luogoNascita}`;
    if (p.dataNascita) nato += ` il ${p.dataNascita}`;
    if (p.residenza) nato += ` e residente a ${p.residenza}`;
    lines.push(nato);
  } else if (p.residenza) {
    lines.push(`Residente a ${p.residenza}`);
  }
  if (p.codiceFiscale) lines.push(`C.F. ${p.codiceFiscale}`);
  if (p.email) lines.push(`MAIL: ${p.email}`);
  if (p.telefono) lines.push(`TEL: ${p.telefono}`);
  if (p.avvocato) lines.push(`Avvocato di parte: ${p.avvocato}`);
  lines.push('');

  // Riga-scopo. Decisione Lavini 2026-06-23 (#3): ENTRAMBE le formule dei gold —
  // "valutare le lesioni patite" (Antoniazzi) + "accertare le conseguenze di ordine
  // temporaneo e permanente" (MOTTA). L'ambito (es. responsabilità civile) chiude.
  const o = data.oggetto;
  const eventoParts: string[] = [];
  if (o.eventoIndice) eventoParts.push(`in occasione di ${o.eventoIndice.toLowerCase()}`);
  if (o.dataEvento) eventoParts.push(`occorso in data ${o.dataEvento}`);
  const eventoStr = eventoParts.length > 0 ? ` ${eventoParts.join(' ')}` : ` in occasione di ${TBD}`;
  const ambitoLabel = ambitoToText(o.ambito);
  const ambitoSuffix = ambitoLabel ? ` in ambito ${ambitoLabel}` : '';
  lines.push(`Al fine di valutare le lesioni patite${eventoStr} e di accertarne le conseguenze di ordine temporaneo e permanente${ambitoSuffix}.`);

  return lines.join('\n').trim();
}

function ambitoToText(ambito: HeaderData['oggetto']['ambito']): string | null {
  if (!ambito) return null;
  const map: Record<NonNullable<HeaderData['oggetto']['ambito']>, string> = {
    rc_civile: 'di responsabilità civile',
    rc_auto: 'di RC auto',
    penale: 'penale',
    previdenziale: 'previdenziale',
    infortuni: 'infortunistico',
    malpractice: 'di responsabilità sanitaria',
    polizza_infortuni: 'di polizza infortuni',
    altro: 'medico-legale',
  };
  return map[ambito];
}

/**
 * True when the section ID is the structured-JSON header section.
 */
export function isHeaderSectionId(sectionId: string): boolean {
  return sectionId === 'intestazione_stragiudiziale';
}
