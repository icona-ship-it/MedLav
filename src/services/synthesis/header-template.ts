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
  const accompagnatore = p.accompagnatore ? `, in presenza di ${p.accompagnatore}` : '';
  lines.push(`In data ${data.dataVisitaMedicoLegale ?? TBD} ho sottoposto ad accertamenti clinici e valutazione medico legale${accompagnatore}:`);
  lines.push('');

  // Dati del periziando, riga per riga (gold Antoniazzi).
  lines.push(`**${p.nome ?? TBD}**`);
  if (p.luogoNascita || p.dataNascita) {
    let nato = 'Nato/a';
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
