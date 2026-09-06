/**
 * Conversione di un numero intero in lettere (italiano), per la notazione
 * formale delle perizie: "giorni 90 (novanta)", "100% (cento per cento)".
 * Gestisce 0–999.999 (giorni di invalidità, percentuali, durate complessive); oltre,
 * restituisce la cifra. Pura.
 */

const UNITS = [
  'zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove',
  'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici',
  'diciassette', 'diciotto', 'diciannove',
];

const TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

/** Spella 0–99. La decina elide la vocale finale davanti a uno/otto (ventuno, ventotto). */
function spellTwoDigits(n: number): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  const tens = u === 1 || u === 8 ? TENS[t].slice(0, -1) : TENS[t];
  return tens + (u === 0 ? '' : UNITS[u]);
}

/**
 * Numero intero (0–999.999) in lettere italiane. Oltre, o input non valido →
 * stringa della cifra.
 */
export function numberToItalianWords(value: number): string {
  const plain = spellPlain(value);
  // Ortografia: nei composti il "tre" finale è accentato (ventitré, centotré, milletré).
  const n = Math.round(value);
  return n > 3 && plain.endsWith('tre') ? `${plain.slice(0, -3)}tré` : plain;
}

function spellPlain(value: number): string {
  if (!Number.isFinite(value) || value < 0) return String(value);
  const n = Math.round(value);
  if (n >= 1000 && n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const head = thousands === 1 ? 'mille' : `${spellPlain(thousands)}mila`;
    return rest === 0 ? head : head + spellPlain(rest);
  }
  if (n < 100) return spellTwoDigits(n);
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    const hundreds = h === 1 ? 'cento' : `${UNITS[h]}cento`;
    if (rest === 0) return hundreds;
    const restStr = spellTwoDigits(rest);
    // "cento" elide la 'o' finale davanti a parola che inizia per o/u (centotto, centuno).
    const elideCento = /^[ou]/.test(restStr);
    return (elideCento ? hundreds.slice(0, -1) : hundreds) + restStr;
  }
  return String(n);
}
