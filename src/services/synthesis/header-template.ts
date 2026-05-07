/**
 * Renderizza l'oggetto HeaderData (JSON validato) in markdown formale.
 *
 * **Contratto**: questa funzione è l'UNICO modo in cui i campi anagrafici
 * arrivano nel report. Se il LLM omette un campo (null), il template lo
 * sostituisce con il marker `[da compilare dal perito]` o lo nasconde,
 * SENZA ricorrere a fallback inventati. Questo è il fix strutturale che
 * impedisce hallucinazioni come quella del caso Regnoto.
 */

import type { HeaderData } from './header-schema';

const TBD = '[da compilare dal perito]';

interface RenderOptions {
  /** Tipo di intestazione: cambia il titolo e i campi visualizzati */
  variant: 'ctu' | 'ctp' | 'stragiudiziale' | 'parere_pro_veritate' | 'parere_scopo_riserva';
  /** Data corrente (oggi) — usata se nessuna data è fornita */
  defaultDateToday?: string;
}

/**
 * Render header markdown from validated JSON. Pure function.
 */
export function renderHeaderMarkdown(data: HeaderData, opts: RenderOptions): string {
  const lines: string[] = [];

  // Title varies by variant
  const title = headerTitle(opts.variant);
  if (title) lines.push(title, '');

  // Giudiziale block (only for CTU/CTP)
  if ((opts.variant === 'ctu' || opts.variant === 'ctp') && data.giudiziale) {
    const g = data.giudiziale;
    if (g.tribunale) lines.push(`**Tribunale**: ${g.tribunale}${g.sezione ? `, ${g.sezione}` : ''}`);
    if (g.numeroRG) lines.push(`**N. R.G.**: ${g.numeroRG}`);
    if (g.giudice) lines.push(`**Giudice**: ${g.giudice}`);
    if (g.dataConferimento) lines.push(`**Data conferimento incarico**: ${g.dataConferimento}`);
    if (g.dataGiuramento) lines.push(`**Data giuramento**: ${g.dataGiuramento}`);
    if (g.ricorrente) lines.push(`**Parte ricorrente**: ${g.ricorrente}`);
    if (g.resistente) lines.push(`**Parte resistente**: ${g.resistente}`);
    if (g.ctpRicorrente) lines.push(`**CTP ricorrente**: ${g.ctpRicorrente}`);
    if (g.ctpResistente) lines.push(`**CTP resistente**: ${g.ctpResistente}`);
    if (lines.length > 1) lines.push('');
  }

  // Perito block
  lines.push('### Dati del professionista incaricato');
  if (data.perito) {
    const parts: string[] = [];
    if (data.perito.nome) parts.push(data.perito.nome);
    if (data.perito.qualifica) parts.push(data.perito.qualifica);
    if (data.perito.specializzazione) parts.push(data.perito.specializzazione);
    if (parts.length > 0) {
      lines.push(parts.join(' — '));
    } else {
      lines.push(TBD);
    }
    if (data.perito.iscrizioneAlbo) {
      lines.push(`Iscrizione albo: ${data.perito.iscrizioneAlbo}`);
    }
  } else {
    lines.push(TBD);
  }
  lines.push('');

  // Periziando block
  lines.push('### Dati del periziando');
  const p = data.paziente;
  if (p.nome) {
    lines.push(`**Nome e cognome**: ${p.nome}`);
  } else {
    lines.push(`**Nome e cognome**: ${TBD}`);
  }
  if (p.dataNascita) {
    lines.push(`**Data di nascita**: ${p.dataNascita}${p.luogoNascita ? ` (${p.luogoNascita})` : ''}`);
  } else if (p.luogoNascita) {
    lines.push(`**Luogo di nascita**: ${p.luogoNascita}`);
  }
  if (p.residenza) lines.push(`**Residenza**: ${p.residenza}`);
  if (p.codiceFiscale) lines.push(`**Codice fiscale**: ${p.codiceFiscale}`);
  if (p.telefono) lines.push(`**Telefono**: ${p.telefono}`);
  lines.push('');

  // Visita medico-legale (only stragiudiziale + pareri)
  if (opts.variant !== 'ctu' && opts.variant !== 'ctp') {
    lines.push('### Data della visita medico-legale');
    lines.push(data.dataVisitaMedicoLegale ?? TBD);
    lines.push('');
  }

  // Soggetto richiedente (parere)
  if (opts.variant.startsWith('parere') && data.soggettoRichiedente) {
    lines.push(`**Soggetto richiedente**: ${data.soggettoRichiedente}`);
    lines.push('');
  }

  // Oggetto dell'incarico
  lines.push('### Oggetto dell\'incarico');
  const o = data.oggetto;
  const oggettoParts: string[] = [];
  if (o.lesione) oggettoParts.push(o.lesione);
  if (o.eventoIndice) {
    oggettoParts.push(`a seguito di ${o.eventoIndice.toLowerCase()}`);
  }
  if (o.dataEvento) oggettoParts.push(`occorso/a in data ${o.dataEvento}`);
  if (o.struttura) oggettoParts.push(`(${o.struttura})`);

  if (oggettoParts.length > 0) {
    const ambitoLabel = ambitoToText(o.ambito);
    const intro = ambitoLabel
      ? `Valutazione medico-legale in ambito ${ambitoLabel} relativa a `
      : 'Valutazione medico-legale relativa a ';
    lines.push(intro + oggettoParts.join(' '));
  } else {
    lines.push(TBD);
  }

  return lines.join('\n').trim();
}

function headerTitle(variant: RenderOptions['variant']): string {
  switch (variant) {
    case 'ctu':
      return '## Intestazione';
    case 'ctp':
      return '## Intestazione';
    case 'stragiudiziale':
      return '## VALUTAZIONE MEDICO-LEGALE STRAGIUDIZIALE';
    case 'parere_pro_veritate':
      return '## PARERE PRO VERITATE';
    case 'parere_scopo_riserva':
      return '## PARERE A SCOPO RISERVA';
    default:
      return '';
  }
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
 * Map a section ID to the appropriate header rendering variant.
 * Returns null for non-header sections.
 */
export function variantForSectionId(
  sectionId: string,
  caseRole?: string,
): RenderOptions['variant'] | null {
  if (sectionId === 'intestazione') {
    return caseRole === 'ctp' ? 'ctp' : 'ctu';
  }
  if (sectionId === 'intestazione_stragiudiziale') return 'stragiudiziale';
  if (sectionId === 'intestazione_parere') {
    // Both pareri share this id; the variant is determined upstream by moduleId.
    // Default to pro_veritate; caller should override if scopo_riserva.
    return 'parere_pro_veritate';
  }
  return null;
}
