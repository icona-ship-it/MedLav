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
  /**
   * Ambito penale (benchmark gold 2026-06-10): conferimento "incarico di Perizia
   * Tecnica medico legale" presso la Corte/il Tribunale, numero "N. ... R.G.",
   * parti come imputati/parte civile, NIENTE destinatario civile né "Signoria
   * Vostra Illustrissima".
   */
  ambitoPenale?: boolean;
  /**
   * True quando la sezione Quesiti segue nel piano: l'intestazione chiude con la
   * formula-ponte "era precisato nei seguenti quesiti:" (variante ATP: "Lo scopo
   * dell'accertamento era indicato dai seguenti quesiti:") invece del rinvio
   * all'ordinanza.
   */
  quesitiInPlan?: boolean;
}

/**
 * Render header markdown from validated JSON. Pure function.
 */
export function renderHeaderMarkdown(data: HeaderData, opts: RenderOptions): string {
  // CTU/CTP: intestazione formale allineata al benchmark Del Porto.
  if (opts.variant === 'ctu' || opts.variant === 'ctp') {
    return `${headerTitle(opts.variant)}\n\n${renderGiudizialeHeader(data, opts)}`.trim();
  }

  // Stragiudiziale: carta intestata stile Antoniazzi/Regnoto (benchmark gold
  // 2026-06-10) — NON la scheda burocratica a sottosezioni, che resta per i pareri.
  if (opts.variant === 'stragiudiziale') {
    return `## Intestazione\n\n${renderStragiudizialeHeader(data)}`.trim();
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
function renderGiudizialeHeader(data: HeaderData, opts?: Pick<RenderOptions, 'ambitoPenale' | 'quesitiInPlan'>): string {
  const lines: string[] = [];
  const g = data.giudiziale;
  const p = data.paziente;
  const penale = !!opts?.ambitoPenale;
  const collegiale = !!data.perito?.coPeritoNome;

  // Carta intestata del perito (in alto, come benchmark scuola veronese).
  const letterhead = renderPeritoLetterhead(data.perito);
  if (letterhead) {
    lines.push(letterhead, '');
    // Collegio: seconda carta intestata del co-perito PARITETICO (benchmark
    // gold 2026-06-10 — due nominativi affiancati, mai "Ausiliario"), con lo
    // stesso split multi-riga delle specializzazioni del perito principale.
    if (data.perito?.coPeritoNome) {
      const co: string[] = [`**${data.perito.coPeritoNome}**`];
      if (data.perito.coPeritoQualifica) {
        for (const spec of data.perito.coPeritoQualifica.split(/\n|;|\s\/\s/).map((s) => s.trim()).filter(Boolean)) {
          co.push(`*${spec}*`);
        }
      }
      lines.push(co.join('\n'), '');
    }
  }

  if (g?.tribunale) lines.push(`**${g.tribunale.toUpperCase()}**`, '');
  if (g?.sezione) lines.push(`**${g.sezione.toUpperCase()}**`, '');
  if (g?.numeroRG) {
    // Dicitura per ambito (benchmark gold 2026-06-10): penale "N. ... R.G. App.";
    // causa civile ordinaria "Causa Civile N.R.G. ..."; ATP/696-bis "Numero di
    // Ruolo Generale ..." (i gold ATP confliggono — scelta documentata in ADR-016).
    const isAtpNum = /\b696[\s-]?bis\b|preventivo/i.test(g?.tipoProcedimento ?? '');
    lines.push(
      penale
        ? `**N. ${g.numeroRG} R.G.${/appello/i.test(g?.tribunale ?? '') ? ' App.' : ''}**`
        : isAtpNum
          ? `**Numero di Ruolo Generale ${g.numeroRG}**`
          : `**Causa Civile N.R.G. ${g.numeroRG}**`,
      '',
    );
  }
  if (g?.tipoProcedimento) lines.push(g.tipoProcedimento, '');

  // Riga-oggetto (gold Del Porto): "relativo alla vicenda clinica di [periziando]".
  if (!penale && p.nome && (g?.tipoProcedimento || g?.numeroRG)) {
    lines.push(`relativo alla vicenda clinica di **${p.nome}**`, '');
  }

  // Caption parti: "RICORRENTE // RESISTENTE" (come benchmark). Con una sola
  // parte nota, etichetta il ruolo per non lasciare il nome ambiguo.
  // In penale le parti sono imputati/parte civile: niente caption civilistica.
  if (!penale) {
    if (g?.ricorrente && g?.resistente) {
      lines.push(`**${g.ricorrente} // ${g.resistente}**`, '');
    } else if (g?.ricorrente) {
      lines.push(`**Parte ricorrente: ${g.ricorrente}**`, '');
    } else if (g?.resistente) {
      lines.push(`**Parte resistente: ${g.resistente}**`, '');
    }
  }

  lines.push('\\* \\* \\* \\* \\*', '');

  // Destinatario (giudice) — solo civile: nel penale il conferimento avviene
  // presso la Corte, senza blocco destinatario (benchmark Vitali).
  if (g?.giudice && !penale) {
    lines.push(isFemaleTitle(g.giudice) ? 'Ill.ma Signora' : 'Ill.mo Signore');
    lines.push(`**${g.giudice}**`);
    // Qualifica: campo del perito se compilato; fallback euristico "Giudice
    // Delegato" per ATP (gold Del Porto), "Giudice Istruttore" altrimenti — i
    // gold ATP confliggono fra loro (scelta documentata in ADR-016).
    const isAtpProcedimento = /\b696[\s-]?bis\b|preventivo/i.test(g?.tipoProcedimento ?? '');
    lines.push(g.giudiceQualifica || (isAtpProcedimento ? 'Giudice Delegato' : 'Giudice Istruttore'));
    const citta = tribunaleCitta(g.tribunale);
    if (citta) lines.push(`c/o il Tribunale di ${citta}`);
    lines.push('');
  }

  // Paragrafo di conferimento (deterministico, stile veronese / penale)
  const conferimento = buildConferimentoParagraph(data, opts);
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
    // Decesso (benchmark gold 2026-06-10): "residente in vita in ... e
    // deceduto/a il [DATA] presso [LUOGO]".
    const residenteLabel = p.dataDecesso ? 'residente in vita in' : 'residente in';
    if (p.residenza) nato += `${nato ? ', ' : ''}${residenteLabel} ${p.residenza}`;
    if (p.dataDecesso) {
      nato += `${nato ? ' ' : ''}e deceduto/a il ${p.dataDecesso}${p.luogoDecesso ? ` presso ${p.luogoDecesso}` : ''}`;
    }
    if (nato) lines.push(`${nato}.`);
    if (p.codiceFiscale) lines.push(`C.F. ${p.codiceFiscale}`);
    lines.push('');
  } else {
    lines.push(`**${TBD}**`, '');
  }

  // Blocco operativo (consulenti di parte, ausiliario, operazioni, termini,
  // fondo spese, provvedimenti): nei gold SEGUE i quesiti. Quando la sezione
  // Quesiti è nel piano viene appeso in coda a quella sezione
  // (buildOperativeCodaFromMetadata, wiring in section-generator); resta qui
  // solo quando i quesiti non sono nel piano.
  if (!opts?.quesitiInPlan) {
    const operative = renderOperativeBlock(data, penale);
    if (operative.length > 0) lines.push(...operative);
  }

  // Formula di chiusura: con la sezione Quesiti nel piano usa la formula-ponte
  // dei benchmark ("era precisato nei seguenti quesiti:"; ATP: "Lo scopo
  // dell'accertamento era indicato dai seguenti quesiti:"); altrimenti il
  // rinvio all'ordinanza (la sezione potrebbe essere assente/deselezionata).
  if (g?.giudice || g?.tribunale || g?.numeroRG) {
    if (lines[lines.length - 1] !== '') lines.push('');
    const incaricato = penale
      ? (collegiale ? 'ai Periti' : 'al Perito')
      : (collegiale ? 'al Collegio di CC.TT.U.' : 'al Consulente Tecnico');
    if (opts?.quesitiInPlan) {
      const isAtp = /\b696[\s-]?bis\b|preventivo/i.test(g?.tipoProcedimento ?? '');
      lines.push(isAtp
        ? 'Lo scopo dell\'accertamento era indicato dai seguenti quesiti:'
        : `Il compito affidato ${incaricato} era precisato nei seguenti quesiti:`);
    } else {
      lines.push(`Il compito affidato ${incaricato} era precisato nei quesiti formulati nell'ordinanza di conferimento.`);
    }
  }

  return lines.join('\n').trim();
}

/**
 * Blocco operativo dell'incarico: consulenti di parte (CC.TT.P. / periti),
 * nomina dell'Ausiliario, inizio operazioni, termini multi-fase, fondo spese e
 * provvedimenti dell'ordinanza. Nei gold (3/3 CTU-RC) segue i QUESITI: è
 * renderizzato in coda alla sezione Quesiti quando questa è nel piano,
 * altrimenti dentro l'intestazione. Pura.
 */
function renderOperativeBlock(data: HeaderData, penale: boolean): string[] {
  const lines: string[] = [];
  const g = data.giudiziale;

  // Consulenti di parte: CC.TT.P. (civile) / periti di imputati e parte civile (penale).
  if (penale) {
    // Lessico del gold penale: i nominati di parte sono "periti".
    if (g?.ctpResistente) {
      lines.push(`I difensori degli imputati nominavano quali propri periti ${g.ctpResistente}.`);
    }
    if (g?.ctpRicorrente) {
      lines.push(`Il difensore della parte civile nominava quale proprio perito ${g.ctpRicorrente}.`);
    }
  } else {
    if (g?.ctpRicorrente) {
      lines.push(`La parte ricorrente${g.ricorrente ? ` (${g.ricorrente})` : ''} nominava quale/i proprio/i CC.TT.P. ${g.ctpRicorrente}.`);
    }
    if (g?.ctpResistente) {
      lines.push(`La parte resistente${g.resistente ? ` ${g.resistente}` : ''} nominava quale/i proprio/i CC.TT.P. ${g.ctpResistente}.`);
    }
  }
  // Nomina dell'Ausiliario (gold danno psichico).
  if (data.perito?.ausiliario) {
    lines.push(`Era individuato in qualità di Ausiliario del C.T.U. ${data.perito.ausiliario.replace(' — ', ', ')}.`);
  }
  if (lines.length > 0) lines.push('');

  // Date operazioni / termini / fondo spese. Termini multi-fase (benchmark gold
  // 2026-06-10): bozza ai consulenti → osservazioni → deposito in unica formula.
  if (g?.dataInizioOperazioni) lines.push(`L'inizio delle operazioni peritali era fissato per il giorno ${g.dataInizioOperazioni}.`);
  if (g?.termineBozza || g?.termineOsservazioni) {
    const t: string[] = [];
    if (g?.termineBozza) t.push(`Era concesso termine entro il ${g.termineBozza} per l'inoltro della bozza di relazione ai consulenti di parte`);
    if (g?.termineOsservazioni) t.push(`assegnava a questi ultimi termine entro il ${g.termineOsservazioni} per l'invio al C.T.U. di eventuali osservazioni`);
    if (g?.termineDeposito) t.push(`assegnava infine termine entro il ${g.termineDeposito} per il deposito della relazione definitiva`);
    lines.push(`${t.join('; ')}.`);
  } else if (g?.termineDeposito) {
    lines.push(`Era assegnato termine entro il ${g.termineDeposito} per il deposito della relazione definitiva.`);
  }
  if (g?.fondoSpese) lines.push(`Era stabilito un fondo spese di ${g.fondoSpese}.`);
  // Provvedimenti dell'ordinanza (testo libero del perito: autorizzazioni,
  // istruzioni di liquidazione D.P.R. 115/2002...).
  if (g?.provvedimentiOrdinanza) lines.push('', g.provvedimentiOrdinanza);

  // Niente blank line in coda (la gestisce il chiamante).
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** HeaderData vuoto usato come base per l'overlay dei metadati nella coda operativa. */
const EMPTY_HEADER_DATA: HeaderData = {
  perito: null,
  paziente: { nome: null, dataNascita: null, luogoNascita: null, residenza: null, codiceFiscale: null, telefono: null },
  oggetto: { eventoIndice: null, dataEvento: null, lesione: null, struttura: null, ambito: null },
  dataVisitaMedicoLegale: null,
  soggettoRichiedente: null,
  giudiziale: null,
};

/**
 * Coda operativa della sezione Quesiti, costruita dai soli metadati perizia
 * (autoritativi): nei gold CTU il blocco CC.TT.P./operazioni/termini/fondo segue
 * i quesiti. Stringa vuota se non c'è nulla da rendere. Pura.
 */
export function buildOperativeCodaFromMetadata(pm: PeriziaMetadata | undefined): string {
  if (!pm) return '';
  const data = overlayGiudizialeFromMetadata(EMPTY_HEADER_DATA, pm);
  return renderOperativeBlock(data, !!pm.ambitoPenale).join('\n').trim();
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

  // Carta intestata del perito.
  if (data.perito?.nome) {
    lines.push(`**${data.perito.nome}**`);
    if (data.perito.specializzazione) {
      for (const spec of data.perito.specializzazione.split(/\n|;|\s\/\s/).map((s) => s.trim()).filter(Boolean)) {
        lines.push(`*${spec}*`);
      }
    }
    if (data.perito.iscrizioneAlbo) lines.push(`Iscrizione Albo: ${data.perito.iscrizioneAlbo}`);
    if (data.perito.email) lines.push(`E-mail: ${data.perito.email}`);
    if (data.perito.pec) lines.push(`PEC: ${data.perito.pec}`);
  } else {
    lines.push(`**${TBD}**`);
  }
  lines.push('');

  // Riga visita con la formula del consenso (gold Regnoto).
  const accompagnatore = p.accompagnatore ? `, in presenza di ${p.accompagnatore}` : '';
  lines.push(`In data ${data.dataVisitaMedicoLegale ?? TBD} ho sottoposto ad accertamenti clinici e valutazione medico legale, con il suo consenso${accompagnatore}:`);
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

  // Riga-scopo (gold Antoniazzi). L'ambito adatta la chiusura al tipo caso.
  const o = data.oggetto;
  const scopo: string[] = [];
  if (o.eventoIndice) scopo.push(`in occasione di ${o.eventoIndice.toLowerCase()}`);
  if (o.dataEvento) scopo.push(`occorso in data ${o.dataEvento}`);
  const ambitoLabel = ambitoToText(o.ambito);
  if (ambitoLabel) scopo.push(`in ambito ${ambitoLabel}`);
  lines.push(scopo.length > 0
    ? `Al fine di valutare le lesioni patite ${scopo.join(' ')}.`
    : `Al fine di valutare le lesioni patite in occasione di ${TBD}.`);

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
function buildConferimentoParagraph(
  data: HeaderData,
  opts?: Pick<RenderOptions, 'ambitoPenale'>,
): string | null {
  const perito = data.perito;
  if (!perito?.nome) return null;
  const female = isFemaleTitle(perito.nome) || isFemaleTitle(perito.qualifica);
  const peritoDesc = perito.qualifica ? `${perito.nome}, ${perito.qualifica}` : perito.nome;
  const coPeritoDesc = perito.coPeritoNome
    ? `${perito.coPeritoNome}${perito.coPeritoQualifica ? `, ${perito.coPeritoQualifica}` : ''}`
    : null;
  // Oggetto dell'incarico: custom dai metadati (decesso, casi qualificatori) o
  // default "alla vicenda clinica". Il campo include la preposizione.
  const oggetto = data.giudiziale?.oggettoIncarico?.trim() || 'alla vicenda clinica';

  if (opts?.ambitoPenale) {
    // Penale (benchmark Vitali): "In data X, presso la Corte d'Appello di Y, era
    // conferito alla sottoscritta Dr.ssa Z, medico legale[, ed al Dott. W,
    // specialista in ...], incarico di Perizia Tecnica medico legale, in merito
    // alla vicenda clinica di" — niente "Signoria Vostra Illustrissima".
    const intro: string[] = [];
    if (data.giudiziale?.dataConferimento) intro.push(`In data ${data.giudiziale.dataConferimento}`);
    if (data.giudiziale?.tribunale) {
      const articolo = /^corte/i.test(data.giudiziale.tribunale) ? 'la' : 'il';
      intro.push(`presso ${articolo} ${data.giudiziale.tribunale}`);
    }
    const conferito = female ? 'era conferito alla sottoscritta' : 'era conferito al sottoscritto';
    const co = coPeritoDesc ? ` ed al ${coPeritoDesc},` : '';
    return `${intro.length > 0 ? `${intro.join(', ')}, ` : ''}${conferito} ${peritoDesc},${co} incarico di Perizia Tecnica medico legale, in merito ${oggetto} di`
      .replace(/\s+/g, ' ')
      .trim();
  }

  const inizio = data.giudiziale?.dataConferimento
    ? `In data ${data.giudiziale.dataConferimento}, la Signoria Vostra Illustrissima`
    : 'La Signoria Vostra Illustrissima';
  // Collegio (benchmark gold 2026-06-10): conferimento PLURALE ai due CC.TT.U.
  if (coPeritoDesc) {
    return `${inizio} conferiva ai sottoscritti ${peritoDesc}, e ${coPeritoDesc}, incarico di Consulenza Tecnica in merito ${oggetto} di`
      .replace(/\s+/g, ' ')
      .trim();
  }
  const sottoscritto = female ? 'alla sottoscritta' : 'al sottoscritto';
  // Chiusura gender-neutral ("di" + nome periziando in MAIUSCOLO nel blocco
  // successivo): evita "del/della Sig./Sig.ra" quando il sesso non è noto.
  return `${inizio} conferiva ${sottoscritto} ${peritoDesc}, incarico di Consulenza Tecnica in merito ${oggetto} di`
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
  // Giurisdizione amministrativa (TAR/TRGA): la regex estrarrebbe "Giustizia
  // Amministrativa" come città e la riga "c/o il Tribunale di ..." sarebbe
  // comunque errata (benchmark gold verbale TAR) → nessuna riga destinatario-città.
  if (/amministrativ|\bT\.?A\.?R\.?\b/i.test(tribunale)) return null;
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
    giudiceQualifica: pick(pm.giudiceQualifica, g.giudiceQualifica),
    dataConferimento: pick(pm.dataIncarico, g.dataConferimento),
    ricorrente: pick(pm.parteRicorrente, g.ricorrente),
    resistente: pick(pm.parteResistente, g.resistente),
    ctpRicorrente: pick(pm.ctpRicorrente, g.ctpRicorrente),
    ctpResistente: pick(pm.ctpResistente, g.ctpResistente),
    tipoProcedimento: pick(pm.tipoProcedimento, g.tipoProcedimento),
    dataInizioOperazioni: pick(pm.dataOperazioni, g.dataInizioOperazioni),
    termineDeposito: pick(pm.dataDeposito, g.termineDeposito),
    termineBozza: pick(pm.termineBozza, g.termineBozza),
    termineOsservazioni: pick(pm.termineOsservazioni, g.termineOsservazioni),
    provvedimentiOrdinanza: pick(pm.provvedimentiOrdinanza, g.provvedimentiOrdinanza),
    fondoSpese: pick(pm.fondoSpese, g.fondoSpese),
    oggettoIncarico: pick(pm.oggettoIncarico, g.oggettoIncarico),
  };

  // Perito: metadati autoritativi (il perito è il firmatario). Include la carta
  // intestata (specializzazioni, albo, e-mail, PEC), l'ausiliario/collaboratore
  // e l'eventuale co-perito paritetico (collegio).
  const hasPeritoMeta = !!(
    pm.ctuName || pm.ctuTitle || pm.specialita || pm.alboNumber ||
    pm.ctuEmail || pm.ctuPec || pm.collaboratoreName || pm.coCtuName
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
        coPeritoNome: pick(pm.coCtuName, data.perito?.coPeritoNome),
        coPeritoQualifica: pick(pm.coCtuTitle, data.perito?.coPeritoQualifica),
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
