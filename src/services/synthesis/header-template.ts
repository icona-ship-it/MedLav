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
import type { PeriziaMetadata } from '@/types';

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
  // CTU/CTP: intestazione formale allineata al benchmark Del Porto.
  if (opts.variant === 'ctu' || opts.variant === 'ctp') {
    return `${headerTitle(opts.variant)}\n\n${renderGiudizialeHeader(data)}`.trim();
  }

  const lines: string[] = [];

  // Title varies by variant
  const title = headerTitle(opts.variant);
  if (title) lines.push(title, '');

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

  // Visita medico-legale (stragiudiziale + pareri — ctu/ctp gestiti sopra)
  lines.push('### Data della visita medico-legale');
  lines.push(data.dataVisitaMedicoLegale ?? TBD);
  lines.push('');

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

/**
 * Intestazione formale CTU/CTP allineata al benchmark Del Porto.
 * NESSUN heading markdown interno (`#`/`##`/`###`): i campi formali restano nel
 * blocco intestazione estratto dal validatore di coerenza header. Tutti i valori
 * provengono da `overlayGiudizialeFromMetadata` (metadati perito autoritativi) +
 * dal nome periziando estratto dall'LLM. Pura.
 */
function renderGiudizialeHeader(data: HeaderData): string {
  const lines: string[] = [];
  const g = data.giudiziale;
  const p = data.paziente;

  if (g?.tribunale) lines.push(`**${g.tribunale.toUpperCase()}**`, '');
  if (g?.sezione) lines.push(`**${g.sezione.toUpperCase()}**`, '');
  if (g?.numeroRG) lines.push(`**n. R.G. ${g.numeroRG}**`, '');
  if (g?.tipoProcedimento) lines.push(g.tipoProcedimento, '');
  if (p.nome) lines.push(`**relativo alla vicenda clinica del/della sig./sig.ra ${p.nome}**`, '');

  lines.push('\\* \\* \\* \\* \\*', '');

  // Destinatario (giudice)
  if (g?.giudice) {
    lines.push('Ill.mo Sig.');
    lines.push(`**${g.giudice}**`);
    lines.push('Giudice Delegato');
    const citta = tribunaleCitta(g.tribunale);
    if (citta) lines.push(`Tribunale di ${citta}`);
    lines.push('');
  }

  // Paragrafo di conferimento (deterministico)
  const conferimento = buildConferimentoParagraph(data);
  if (conferimento) lines.push(conferimento, '');

  // Periziando
  if (p.nome) {
    lines.push(`**${p.nome}**`);
    let nato = '';
    if (p.luogoNascita || p.dataNascita) {
      nato = 'nato/a';
      if (p.luogoNascita) nato += ` a ${p.luogoNascita}`;
      if (p.dataNascita) nato += ` il ${p.dataNascita}`;
    }
    if (p.residenza) nato += `${nato ? ', ' : ''}residente in ${p.residenza}`;
    if (nato) lines.push(`${nato}.`);
    if (p.codiceFiscale) lines.push(`C.F. ${p.codiceFiscale}`);
    lines.push('');
  } else {
    lines.push(`**${TBD}**`, '');
  }

  // CC.TT.P.
  if (g?.ctpRicorrente) {
    lines.push(`La parte ricorrente${g.ricorrente ? ` (${g.ricorrente})` : ''} nominava quale/i proprio/i CC.TT.P. ${g.ctpRicorrente}.`);
  }
  if (g?.ctpResistente) {
    lines.push(`La parte resistente${g.resistente ? ` ${g.resistente}` : ''} nominava quale/i proprio/i CC.TT.P. ${g.ctpResistente}.`);
  }
  if (g?.ctpRicorrente || g?.ctpResistente) lines.push('');

  // Date operazioni / termini / fondo spese
  if (g?.dataInizioOperazioni) lines.push(`L'inizio delle operazioni peritali era fissato per il giorno ${g.dataInizioOperazioni}.`);
  if (g?.termineDeposito) lines.push(`Era assegnato termine entro il ${g.termineDeposito} per il deposito della relazione definitiva.`);
  if (g?.fondoSpese) lines.push(`Era stabilito un fondo spese di ${g.fondoSpese}.`);

  return lines.join('\n').trim();
}

/** Paragrafo di conferimento incarico, assemblato in modo deterministico. */
function buildConferimentoParagraph(data: HeaderData): string | null {
  const g = data.giudiziale;
  const perito = data.perito;
  const p = data.paziente;
  if (!g?.giudice || !perito?.nome) return null;
  const sede = g.tribunale ? `presso il ${g.tribunale}${g.sezione ? ` – ${g.sezione}` : ''}` : '';
  const peritoDesc = perito.qualifica ? `${perito.nome}, ${perito.qualifica}` : perito.nome;
  const oggetto = p.nome ? ` relativa al/alla sig./sig.ra ${p.nome}` : '';
  const inizio = g.dataConferimento ? `Il giorno ${g.dataConferimento} il ${g.giudice}` : `Il ${g.giudice}`;
  return `${inizio}, Giudice Delegato ${sede}, conferiva al sottoscritto ${peritoDesc}, l'incarico di eseguire indagine medico-legale sulla vicenda clinica${oggetto}.`
    .replace(/\s+/g, ' ')
    .trim();
}

/** Estrae la città dal nome del tribunale ("Tribunale Ordinario di Brescia" → "Brescia"). */
function tribunaleCitta(tribunale: string | null | undefined): string | null {
  if (!tribunale) return null;
  const m = tribunale.match(/\bdi\s+(.+)$/i);
  return m ? m[1].trim() : tribunale;
}

/**
 * Sovrappone i campi formali del procedimento dai metadati perizia (autoritativi:
 * il perito li ha inseriti nel form) sull'HeaderData estratto dall'LLM. I metadati
 * vincono dove presenti; altrimenti resta il valore estratto. Elimina il rischio di
 * fabbricazione sui campi d'incarico e fornisce al template Del Porto i dati che lo
 * schema JSON dell'LLM non cattura (tipo procedimento, date operazioni, fondo spese).
 * Pura.
 */
export function overlayGiudizialeFromMetadata(
  data: HeaderData,
  pm: PeriziaMetadata | undefined,
): HeaderData {
  if (!pm) return data;
  const pick = (meta: string | undefined, current: string | null | undefined): string | null =>
    meta && meta.trim().length > 0 ? meta : current ?? null;

  const g = data.giudiziale ?? {
    tribunale: null, sezione: null, numeroRG: null, giudice: null,
    dataConferimento: null, dataGiuramento: null, ricorrente: null,
    resistente: null, ctpRicorrente: null, ctpResistente: null,
  };

  const giudiziale = {
    ...g,
    tribunale: pick(pm.tribunale, g.tribunale),
    sezione: pick(pm.sezione, g.sezione),
    numeroRG: pick(pm.rgNumber, g.numeroRG),
    giudice: pick(pm.judgeName, g.giudice),
    dataConferimento: pick(pm.dataIncarico, g.dataConferimento),
    ricorrente: pick(pm.parteRicorrente, g.ricorrente),
    resistente: pick(pm.parteResistente, g.resistente),
    ctpRicorrente: pick(pm.ctpRicorrente, g.ctpRicorrente),
    ctpResistente: pick(pm.ctpResistente, g.ctpResistente),
    tipoProcedimento: pick(pm.tipoProcedimento, g.tipoProcedimento),
    dataInizioOperazioni: pick(pm.dataOperazioni, g.dataInizioOperazioni),
    termineDeposito: pick(pm.dataDeposito, g.termineDeposito),
    fondoSpese: pick(pm.fondoSpese, g.fondoSpese),
  };

  // Perito: metadati autoritativi (il perito è il firmatario).
  const hasPeritoMeta = !!(pm.ctuName || pm.ctuTitle);
  const perito = hasPeritoMeta
    ? {
        nome: pick(pm.ctuName, data.perito?.nome),
        qualifica: pick(pm.ctuTitle, data.perito?.qualifica),
        specializzazione: data.perito?.specializzazione ?? null,
        iscrizioneAlbo: data.perito?.iscrizioneAlbo ?? null,
      }
    : data.perito;

  return { ...data, giudiziale, perito };
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
