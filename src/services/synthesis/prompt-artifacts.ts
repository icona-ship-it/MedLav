/**
 * Artefatti del PROMPT che il modello ricopia nel testo depositabile (gate gold
 * 2026-09-04, giro 1 sui casi riprocessati): tag di ambito temporale del
 * contenuto-fonte ("[riferito in anamnesi]", "[PROGRAMMATO: …]"), sigle di
 * categoria delle fonti ("(FONTE: A - …)", "(A|C - …)"), parentesi di
 * pseudo-verifica in prosa ("(dato parzialmente riscontrato …)") e, nella sola
 * documentazione sanitaria, paragrafi in corsivo di commento (la sezione è
 * fatta di intestazioni e citazioni: un corsivo isolato non è mai testo del
 * medico). Backstop deterministico: la regola nel prompt resta, ma non basta.
 * Funzioni pure e idempotenti.
 */

const SCOPE_TAG_RE = /[ \t]*\[(?:riferito in anamnesi|programmato, non eseguito nel documento|RIFERITO IN ANAMNESI:[^\]]*|PROGRAMMATO:[^\]]*)\]/g;
/** "(FONTE: A - cartella clinica)" / "(A|C - referto…)" / "(B/C - …)": sigle interne. */
// Spazi obbligatori attorno al trattino: "(D-dimero 1200)" / "(C-reattiva)" sono clinica.
const SOURCE_LABEL_RE = /[ \t]*\((?:FONTE:\s*)?[A-D](?:\s*[|/]\s*[A-D])*\s+[-–]\s+[^()]{1,80}\)/g;
/** Solo le forme di pseudo-verifica: "(dato … riscontrato/risultante/documentato …)",
 * "(non documentato)", "(… riscontrato/risultante … nella documentazione/negli atti)".
 * "(non confermata alla RX)" è prosa clinica legittima e resta. */
const PSEUDO_VERIFY_RE = /[ \t]*\((?:dat[oi] [^()]*?(?:riscontrat|risultant|documentat|verificat)[^()]*|non documentat[oaie]|(?:non |parzialmente )?(?:riscontrat[oaie]|risultante)[^()]*?(?:documentazione|atti|documenti)[^()]*)\)/gi;

export function stripPromptArtifacts(text: string): string {
  return text
    .replace(SCOPE_TAG_RE, '')
    .replace(SOURCE_LABEL_RE, '')
    .replace(PSEUDO_VERIFY_RE, '')
    // doppio spazio o spazio prima della punteggiatura lasciati dalla rimozione
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1');
}

/** Solo doc-sanitaria: toglie i paragrafi INTERAMENTE in corsivo (*…* o _…_)
 * che non sono intestazioni né citazioni — sono commenti del modello. */
export function stripItalicMetaParagraphs(text: string): string {
  return text
    .split('\n')
    // I placeholder dello scaffold ("*[da compilare dal perito]*") restano.
    .filter((line) => !/^\s*(?:\*[^*«»[\n][^*«»\n]{11,}\*|_[^_«»[\n][^_«»\n]{11,}_)\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}
