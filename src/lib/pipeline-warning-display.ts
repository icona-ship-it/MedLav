/**
 * Traduce i pipelineWarnings grezzi (step tecnici) in voci COMPRENSIBILI per il
 * perito nel pannello "Da controllare": ogni step ha copy calmo e specifico +
 * la gravità giusta. Prima TUTTI i warning (dedup, lingua, calcoli falliti e
 * perfino "sezione non generata" che è CRITICO) venivano appiattiti nell'unica
 * frase "Alcuni documenti non sono stati letti per intero" — fuorviante e
 * ansiogeno. Puro e testabile: nessun accesso a DOM/DB.
 */

export interface RawPipelineWarning {
  step: string;
  severity: 'warning' | 'critical';
  message: string;
  failedCount?: number;
  totalCount?: number;
  failedItems?: string[];
}

export type DisplaySeverity = 'critical' | 'warning' | 'info';

export interface PipelineWarningDisplay {
  /** Gravità di RESA (icona): critical=rosso, warning=ambra, info=grigio. */
  severity: DisplaySeverity;
  /** Frase COSA+PERCHÉ per il perito. */
  title: string;
  /** Tipo di azione consigliata dal chiamante (non è un URL). */
  action?: 'view-documents' | 'goto-section' | 'reprocess' | 'goto-docsanitaria' | 'goto-report';
  /** Warning grezzi che questa voce aggrega (per il dialog di dettaglio). */
  sources: RawPipelineWarning[];
}

/** Estrae "N di M" dal contesto del warning quando disponibile. */
function count(w: RawPipelineWarning): number {
  return w.failedItems?.length ?? w.failedCount ?? 1;
}

/**
 * Raggruppa e traduce i warning. Aggrega tutti quelli "documenti non letti per
 * intero" (ocr/extraction con failedItems) in UNA voce drillabile; le sezioni
 * non generate (critical) in una voce critica separata; il resto per categoria.
 */
export function groupPipelineWarnings(warnings: RawPipelineWarning[]): PipelineWarningDisplay[] {
  if (warnings.length === 0) return [];
  const out: PipelineWarningDisplay[] = [];

  // 1. Sezioni del report non generate — CRITICO (l'errore "[SEZIONE NON GENERATA]").
  const sectionFailed = warnings.filter(
    (w) => w.step === 'synthesis' && w.severity === 'critical' && /sezion/i.test(w.message),
  );
  if (sectionFailed.length > 0) {
    const n = sectionFailed.reduce((s, w) => s + (w.failedCount ?? 1), 0);
    out.push({
      severity: 'critical',
      title: `${n === 1 ? 'Una sezione del report non è stata generata' : `${n} sezioni del report non sono state generate`} per un errore tecnico — rigenerale dall'editor (il resto del report è completo).`,
      action: 'goto-section',
      sources: sectionFailed,
    });
  }

  // 2. Calcoli ITT/ITP non completati — CRITICO (tabella potrebbe mancare).
  const calc = warnings.filter((w) => w.step === 'calculations');
  if (calc.length > 0) {
    out.push({
      severity: 'critical',
      title: 'I calcoli dei periodi di invalidità (ITT/ITP) non sono stati completati — la tabella potrebbe mancare. Conviene rielaborare il caso.',
      action: 'reprocess',
      sources: calc,
    });
  }

  // 3. Documenti non letti per intero — WARNING drillabile (ocr + estrazione con failedItems).
  const unread = warnings.filter(
    (w) => (w.step === 'ocr' || w.step === 'extraction') && (w.failedItems?.length ?? 0) > 0,
  );
  if (unread.length > 0) {
    const n = unread.reduce((s, w) => s + count(w), 0);
    out.push({
      severity: 'warning',
      title: `${n} ${n === 1 ? 'documento non è stato letto' : 'documenti non sono stati letti'} per intero — il report potrebbe non citarne alcune parti.`,
      action: 'view-documents',
      sources: unread,
    });
  }

  // 4. Copertura doc-sanitaria — WARNING (eventi forse non citati; c'è già il banner in sezione).
  const coverage = warnings.filter(
    (w) => w.step === 'synthesis' && w.severity === 'warning' && /citat|copertura|rilevant/i.test(w.message),
  );
  if (coverage.length > 0) {
    out.push({
      severity: 'warning',
      title: 'Nella Documentazione Sanitaria alcuni eventi rilevanti potrebbero non essere citati — trovi un promemoria nella sezione.',
      action: 'goto-docsanitaria',
      sources: coverage,
    });
  }

  // 4bis. Citazioni «...» non riscontrate esattamente nell'OCR — WARNING drillabile
  // (feedback beta 2026-07-20: le divergenze dentro le virgolette arrivavano al
  // documento in silenzio; il dettaglio elenca le citazioni da confrontare).
  const quoteFidelity = warnings.filter((w) => w.step === 'quote-verification');
  if (quoteFidelity.length > 0) {
    // failedCount porta il totale VERO (failedItems è troncato a 24 voci):
    // mai titolare "24 citazioni" quando le divergenze sono 30.
    const n = quoteFidelity.reduce((s, w) => s + (w.failedCount ?? count(w)), 0);
    out.push({
      severity: 'warning',
      title: `${n} ${n === 1 ? 'citazione della Documentazione Sanitaria non corrisponde esattamente' : 'citazioni della Documentazione Sanitaria non corrispondono esattamente'} al testo dei documenti — confrontarle con l'originale prima della consegna.`,
      action: 'goto-docsanitaria',
      sources: quoteFidelity,
    });
  }

  // 4ter. Date nelle sezioni narrative senza riscontro fra le date dei documenti
  // (2026-09-06): drillabile, l'elenco delle date è il controllo che il medico fa.
  const dateFidelity = warnings.filter((w) => w.step === 'date-verification');
  if (dateFidelity.length > 0) {
    const n = dateFidelity.reduce((s, w) => s + (w.failedCount ?? count(w)), 0);
    out.push({
      severity: 'warning',
      title: `${n} ${n === 1 ? 'data nel testo (Fatto, Anamnesi o Epicrisi) non trova riscontro' : 'date nel testo (Fatto, Anamnesi o Epicrisi) non trovano riscontro'} fra le date dei documenti — verificarle sugli originali prima della consegna.`,
      action: 'goto-report',
      sources: dateFidelity,
    });
  }

  // 5. Documenti duplicati esclusi — INFO (rassicurazione, non un problema).
  const dedup = warnings.filter((w) => w.step === 'dedup');
  if (dedup.length > 0) {
    const n = dedup.reduce((s, w) => s + count(w), 0);
    out.push({
      severity: 'info',
      title: `${n} ${n === 1 ? 'documento identico escluso' : 'documenti identici esclusi'}: il contenuto è stato conteggiato una volta sola.`,
      sources: dedup,
    });
  }

  // 6. Documenti in lingua straniera — INFO.
  const lang = warnings.filter(
    (w) => w.step === 'extraction' && /lingua|straniera|rilevato in|language/i.test(w.message) && !(w.failedItems?.length),
  );
  if (lang.length > 0) {
    out.push({
      severity: 'info',
      title: 'Uno o più documenti sono in lingua straniera: i concetti sono stati tradotti, le citazioni restano in originale.',
      sources: lang,
    });
  }

  // 7. Qualunque altro warning non categorizzato — non perderlo mai.
  const known = new Set([...sectionFailed, ...calc, ...unread, ...coverage, ...quoteFidelity, ...dedup, ...lang]);
  const rest = warnings.filter((w) => !known.has(w));
  for (const w of rest) {
    out.push({
      severity: w.severity === 'critical' ? 'critical' : 'warning',
      title: w.message,
      sources: [w],
    });
  }

  // Ordine per gravità: critical → warning → info.
  const rank: Record<DisplaySeverity, number> = { critical: 0, warning: 1, info: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
