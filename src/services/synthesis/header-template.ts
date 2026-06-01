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
 * Intestazione formale CTU/CTP allineata ai benchmark della scuola veronese
 * (Del Balzo / Lavini, 2026-06-01): carta intestata del perito in alto →
 * Tribunale → "Numero di Ruolo Generale" → destinatario Giudice Istruttore →
 * formula "la Signoria Vostra Illustrissima conferiva alla sottoscritta…,
 * incarico di Consulenza Tecnica in merito a…" → periziando in MAIUSCOLO.
 *
 * NESSUN heading markdown interno (`#`/`##`/`###`): i campi formali restano nel
 * blocco intestazione estratto dal validatore di coerenza header. Tutti i valori
 * provengono da `overlayGiudizialeFromMetadata` (metadati perito autoritativi) +
 * dal nome periziando estratto dall'LLM. Pura.
 */
function renderGiudizialeHeader(data: HeaderData): string {
  const lines: string[] = [];
  const g = data.giudiziale;
  const p = data.paziente;

  // Carta intestata del perito (in alto, come benchmark scuola veronese).
  const letterhead = renderPeritoLetterhead(data.perito);
  if (letterhead) lines.push(letterhead, '');

  if (g?.tribunale) lines.push(`**${g.tribunale.toUpperCase()}**`, '');
  if (g?.sezione) lines.push(`**${g.sezione.toUpperCase()}**`, '');
  if (g?.numeroRG) lines.push(`**Numero di Ruolo Generale ${g.numeroRG}**`, '');
  if (g?.tipoProcedimento) lines.push(g.tipoProcedimento, '');

  // Caption parti: "RICORRENTE // RESISTENTE" (come benchmark). Con una sola
  // parte nota, etichetta il ruolo per non lasciare il nome ambiguo.
  if (g?.ricorrente && g?.resistente) {
    lines.push(`**${g.ricorrente} // ${g.resistente}**`, '');
  } else if (g?.ricorrente) {
    lines.push(`**Parte ricorrente: ${g.ricorrente}**`, '');
  } else if (g?.resistente) {
    lines.push(`**Parte resistente: ${g.resistente}**`, '');
  }

  lines.push('\\* \\* \\* \\* \\*', '');

  // Destinatario (giudice)
  if (g?.giudice) {
    lines.push(isFemaleTitle(g.giudice) ? 'Ill.ma Signora' : 'Ill.mo Signore');
    lines.push(`**${g.giudice}**`);
    lines.push('Giudice Istruttore');
    const citta = tribunaleCitta(g.tribunale);
    if (citta) lines.push(`c/o il Tribunale di ${citta}`);
    lines.push('');
  }

  // Paragrafo di conferimento (deterministico, stile veronese)
  const conferimento = buildConferimentoParagraph(data);
  if (conferimento) lines.push(conferimento, '');

  // Periziando (nome in MAIUSCOLO, come benchmark)
  if (p.nome) {
    lines.push(`**${p.nome.toUpperCase()}**`);
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

  // Formula di rito veronese. Riferimento all'ordinanza (NON "di seguito
  // riportati"): la sezione Quesiti potrebbe essere assente/deselezionata.
  if (g?.giudice || g?.tribunale || g?.numeroRG) {
    if (g?.ctpRicorrente || g?.ctpResistente || g?.dataInizioOperazioni || g?.termineDeposito || g?.fondoSpese) lines.push('');
    lines.push('Il compito affidato al Consulente Tecnico era precisato nei quesiti formulati nell\'ordinanza di conferimento.');
  }

  return lines.join('\n').trim();
}

/**
 * Carta intestata del perito (nome + specializzazioni + iscrizione albo).
 * Renderizzata solo quando ci sono dati oltre al nome (il nome da solo
 * ricomparirebbe nel paragrafo di conferimento). Pura.
 */
function renderPeritoLetterhead(perito: HeaderData['perito']): string | null {
  if (!perito?.nome) return null;
  const hasExtra =
    perito.specializzazione || perito.iscrizioneAlbo || perito.email || perito.pec || perito.ausiliario;
  if (!hasExtra) return null;
  const lines: string[] = [`**${perito.nome}**`];
  if (perito.specializzazione) {
    // Specializzazioni multiple (a-capo, ';' o ' / ') → una per riga in corsivo.
    for (const spec of perito.specializzazione.split(/\n|;|\s\/\s/).map((s) => s.trim()).filter(Boolean)) {
      lines.push(`*${spec}*`);
    }
  }
  if (perito.iscrizioneAlbo) lines.push(`Iscrizione Albo: ${perito.iscrizioneAlbo}`);
  if (perito.email) lines.push(`E-mail: ${perito.email}`);
  if (perito.pec) lines.push(`PEC: ${perito.pec}`);
  if (perito.ausiliario) lines.push('', `Ausiliario del CTU: ${perito.ausiliario}`);
  return lines.join('\n');
}

/**
 * Paragrafo di conferimento incarico, stile scuola veronese (Del Balzo/Lavini):
 * "In data DD.MM.YYYY, la Signoria Vostra Illustrissima conferiva alla
 * sottoscritta Dr.ssa [X], [qualifica], incarico di Consulenza Tecnica in merito
 * alla vicenda clinica del/della Sig./Sig.ra" → il nome del periziando segue in
 * MAIUSCOLO nel blocco successivo. Richiede solo il nome del perito. Puro.
 */
function buildConferimentoParagraph(data: HeaderData): string | null {
  const perito = data.perito;
  if (!perito?.nome) return null;
  const female = isFemaleTitle(perito.nome) || isFemaleTitle(perito.qualifica);
  const sottoscritto = female ? 'alla sottoscritta' : 'al sottoscritto';
  const peritoDesc = perito.qualifica ? `${perito.nome}, ${perito.qualifica}` : perito.nome;
  const inizio = data.giudiziale?.dataConferimento
    ? `In data ${data.giudiziale.dataConferimento}, la Signoria Vostra Illustrissima`
    : 'La Signoria Vostra Illustrissima';
  // Chiusura gender-neutral ("di" + nome periziando in MAIUSCOLO nel blocco
  // successivo): evita "del/della Sig./Sig.ra" quando il sesso non è noto.
  return `${inizio} conferiva ${sottoscritto} ${peritoDesc}, incarico di Consulenza Tecnica in merito alla vicenda clinica di`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Euristica di genere dal titolo professionale per concordare gli articoli
 * ("alla sottoscritta" vs "al sottoscritto", "Ill.ma Signora" vs "Ill.mo
 * Signore"). Riconosce le forme femminili Dr.ssa / Dott.ssa / Signora. Pura.
 */
function isFemaleTitle(value: string | null | undefined): boolean {
  if (!value) return false;
  return /\b(dr|dott|prof)\.?ssa\b|\bdottoressa\b|\bprofessoressa\b|\bsig\.ra\b|\bsignora\b/i.test(value);
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

  // Perito: metadati autoritativi (il perito è il firmatario). Include la carta
  // intestata (specializzazioni, albo, e-mail, PEC) e l'ausiliario/collaboratore.
  const hasPeritoMeta = !!(
    pm.ctuName || pm.ctuTitle || pm.specialita || pm.alboNumber ||
    pm.ctuEmail || pm.ctuPec || pm.collaboratoreName
  );
  const ausiliario = pm.collaboratoreName
    ? `${pm.collaboratoreName}${pm.collaboratoreTitle ? ` — ${pm.collaboratoreTitle}` : ''}`
    : (data.perito?.ausiliario ?? null);
  const perito = hasPeritoMeta
    ? {
        nome: pick(pm.ctuName, data.perito?.nome),
        qualifica: pick(pm.ctuTitle, data.perito?.qualifica),
        specializzazione: pick(pm.specialita, data.perito?.specializzazione),
        iscrizioneAlbo: pick(pm.alboNumber, data.perito?.iscrizioneAlbo),
        email: pick(pm.ctuEmail, data.perito?.email),
        pec: pick(pm.ctuPec, data.perito?.pec),
        ausiliario,
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
