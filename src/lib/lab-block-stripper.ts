/**
 * stripLabBlocks — rimuove i BLOCCHI di valori di laboratorio (ematochimici) da un
 * testo, lasciando intatta la prosa clinica.
 *
 * Perché: nella perizia RC stragiudiziale (direttiva Lavini) i lab vanno esclusi
 * dalla riproduzione. L'esclusione per-EVENTO (isExcludableLabEvent) non basta: i
 * valori sono annegati nell'OCR grezzo delle cartelle e nel sourceText degli eventi
 * non-lab, che vengono riprodotti verbatim. Questo filtro agisce a livello TESTO.
 *
 * Strategia anti-falsi-positivi: rimuove solo un blocco di righe CONTIGUE che insieme
 * contengono ≥3 analiti ematochimici DISTINTI, ciascuno seguito da un valore numerico.
 * Un singolo valore in prosa ("Hb 89, trasfuse 2 unità"), i parametri vitali
 * (PA/FC/SpO2/TC — NON in whitelist) e i referti RX (gradi/numeri ma zero analiti)
 * NON vengono toccati.
 *
 * GDPR: i valori lab sono dati Art. 9 — questa funzione NON logga il testo rimosso,
 * restituisce solo il conteggio dei blocchi.
 */

/** Analiti ematochimici/di laboratorio. NB: vitali (PA, FC, SpO2, TC) ESCLUSI di proposito. */
const LAB_ANALYTES = [
  'emoglobina', 'ematocrito', 'eritrociti', 'globuli rossi', 'globuli bianchi', 'leucociti',
  'neutrofili', 'linfociti', 'monociti', 'eosinofili', 'basofili', 'piastrine', 'reticolociti',
  'mcv', 'mch', 'mchc', 'rdw',
  'glicemia', 'glucosio', 'creatinina', 'azotemia', 'urea', 'uricemia', 'acido urico',
  'sodio', 'potassio', 'cloro', 'calcio', 'fosforo', 'magnesio',
  'ast', 'alt', 'got', 'gpt', 'ggt', 'transaminasi', 'fosfatasi', 'bilirubina',
  'proteina c reattiva', 'pcr', 'ves', 'procalcitonina',
  'inr', 'aptt', 'ptt', 'fibrinogeno', 'd-dimero', 'd dimero', 'antitrombina',
  'egfr', 'gfr', 'clearance',
  'colesterolo', 'hdl', 'ldl', 'trigliceridi',
  'tsh', 'ft3', 'ft4',
  'ferritina', 'sideremia', 'transferrina',
  'proteine totali', 'albumina', 'amilasi', 'lipasi', 'cpk', 'ldh', 'troponina', 'mioglobina',
  'emoglobina glicata', 'hba1c', 'emocromo',
];

/** Riga-titolo che introduce un blocco lab (assorbita nella rimozione). */
const LAB_HEADER_RE = /^\s*(esami\s+ematochimic|esami\s+ematic|esami\s+di\s+laboratorio|emocromo\b|esami\s+ematochimici\s+di\s+controllo)/i;

/** Per ogni analita: nome seguito (entro 18 char) da una cifra → "analita con valore". */
const ANALYTE_RES: ReadonlyArray<{ name: string; re: RegExp }> = LAB_ANALYTES.map((a) => ({
  name: a,
  re: new RegExp(`\\b${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^\\n]{0,18}?\\d`, 'i'),
}));

/** Insieme degli analiti DISTINTI con valore presenti in una riga. */
function analytesInLine(line: string): Set<string> {
  const found = new Set<string>();
  if (!/\d/.test(line)) return found; // nessuna cifra → nessun valore
  for (const { name, re } of ANALYTE_RES) {
    if (re.test(line)) found.add(name);
  }
  return found;
}

export interface StripLabResult {
  text: string;
  removedBlocks: number;
}

/**
 * Rimuove i blocchi di laboratorio (≥3 analiti distinti con valore, su righe contigue)
 * più l'eventuale riga-header che li precede. Pura e idempotente.
 */
export function stripLabBlocks(text: string): StripLabResult {
  if (!text) return { text, removedBlocks: 0 };

  const lines = text.split(/\r?\n/);
  const perLine = lines.map(analytesInLine);
  const remove = new Array<boolean>(lines.length).fill(false);
  let removedBlocks = 0;

  let i = 0;
  while (i < lines.length) {
    if (perLine[i].size === 0) {
      i += 1;
      continue;
    }
    // Inizio run di righe-lab contigue → raccogli analiti distinti.
    const start = i;
    const distinct = new Set<string>();
    while (i < lines.length && perLine[i].size > 0) {
      for (const a of perLine[i]) distinct.add(a);
      i += 1;
    }
    const end = i; // esclusivo
    if (distinct.size >= 3) {
      for (let k = start; k < end; k += 1) remove[k] = true;
      // Assorbi la riga-header immediatamente precedente, se è un titolo lab.
      if (start > 0 && !remove[start - 1] && LAB_HEADER_RE.test(lines[start - 1])) {
        remove[start - 1] = true;
      }
      removedBlocks += 1;
    }
  }

  if (removedBlocks === 0) return { text, removedBlocks: 0 };

  const kept = lines.filter((_, idx) => !remove[idx]);
  // Compatta le righe vuote consecutive lasciate dalla rimozione.
  const out = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, (m) => (m.includes('\n\n') ? '\n' : ''));
  return { text: out, removedBlocks };
}
