/**
 * Segnale fiscale in un testo OCR: importi, valuta, lessico di fattura/ricevuta.
 * Collaudo 2026-09-18 (P-1): uno storico di 7 sedute di fisioterapia SENZA
 * importi veniva classificato «spese mediche» e le sedute sparivano dalla
 * cronistoria clinica. Un documento senza alcun segnale fiscale non è un
 * giustificativo di spesa.
 */
// «importo»/«totale» contano solo seguiti da una cifra («Totale sedute: 7» non è
// fiscale; «Totale 120,00» sì); i decimali valgono con virgola o punto (120.00).
const FISCAL_SIGNAL_RE = /(€|\beuro\b|\beur\b|\bchf\b|\bgbp\b|\b(importo|totale)\b[^\n\d]{0,20}\d+[.,]\d{2}|\bfattur[ae]\b|\bricevut[ae]\b|\bscontrin[oi]\b|\bpagat[oa]\b|\bpagamento\b|\bp\.?\s?iva\b|\biva\b|\bbollo\b|\bnota spese\b|\bparcell[ae]\b|\bticket\b|\bquietanza\b|\bcorrispettiv|\bonorari[oi]\b|\d{1,3}(?:\.\d{3})*,\d{2}\b|\d+\.\d{2}\b(?![./]\d))/i;

export function hasFiscalSignal(text: string | null | undefined): boolean {
  return FISCAL_SIGNAL_RE.test(text ?? '');
}

export const NO_FISCAL_SIGNAL_REASON =
  'Il modello proponeva «spese mediche», ma nel testo non c\'è alcun importo né riferimento fiscale (fattura, ricevuta, scontrino): sembra un elenco di prestazioni, non un giustificativo di spesa. Scegli tu la categoria.';
