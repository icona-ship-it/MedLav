'use client';

import { useState, useMemo, useCallback } from 'react';
import { ShieldCheck, Eye, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  detectPii,
  anonymizeTextAdvanced,
  type PiiCategory,
  type DetectionResult,
} from '@/services/anonymization/anonymizer';
import type { ReportRow, EventRow, CaseData } from './types';

// --- Types ---

interface AnonymizationToolProps {
  caseId: string;
  caseData: CaseData;
  report: ReportRow;
  events: EventRow[];
}

const CATEGORY_LABELS: Record<PiiCategory, string> = {
  nome: 'Nomi e persone',
  codice_fiscale: 'Codici Fiscali',
  data: 'Date',
  indirizzo: 'Indirizzi',
  telefono: 'Numeri di telefono',
  email: 'Indirizzi email',
  struttura: 'Strutture sanitarie',
  riferimento_giudiziario: 'Riferimenti giudiziari',
};

const CATEGORY_COLORS: Record<PiiCategory, string> = {
  nome: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  codice_fiscale: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300',
  data: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  indirizzo: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  telefono: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  email: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  struttura: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
  riferimento_giudiziario: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
};

const ALL_CATEGORIES: PiiCategory[] = [
  'nome', 'codice_fiscale', 'data', 'indirizzo', 'telefono', 'email',
];

// --- Component ---

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- events reserved for future event-level anonymization
export function AnonymizationTool({ caseId, caseData, report, events }: AnonymizationToolProps) {
  const [enabledCategories, setEnabledCategories] = useState<Set<PiiCategory>>(
    new Set(ALL_CATEGORIES),
  );
  const [showPreview, setShowPreview] = useState(false);

  const sourceText = report.synthesis ?? '';

  // Build perizia metadata for detection
  const periziaMetadata = useMemo(() => caseData.perizia_metadata ?? undefined, [caseData]);

  // Detect PII in the report
  const detection: DetectionResult = useMemo(
    () => detectPii({ text: sourceText, periziaMetadata }),
    [sourceText, periziaMetadata],
  );

  // Anonymize with selected categories
  const anonymized = useMemo(() => {
    if (!showPreview) return null;
    return anonymizeTextAdvanced({
      text: sourceText,
      periziaMetadata,
      enabledCategories,
    });
  }, [showPreview, sourceText, periziaMetadata, enabledCategories]);

  const toggleCategory = useCallback((category: PiiCategory) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
    setShowPreview(false);
  }, []);

  const handleCopyToClipboard = useCallback(async () => {
    if (!anonymized) return;
    await navigator.clipboard.writeText(anonymized.anonymizedText);
    toast.success('Testo anonimizzato copiato negli appunti');
  }, [anonymized]);

  const handleDownload = useCallback(() => {
    if (!anonymized) return;
    const blob = new Blob([anonymized.anonymizedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `report-anonimizzato-${caseId.slice(0, 8)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Report anonimizzato scaricato');
  }, [anonymized, caseId]);

  const totalDetected = detection.matches.length;
  const activeCount = detection.matches.filter((m) => enabledCategories.has(m.category)).length;

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            Strumento di Anonimizzazione
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Rileva e sostituisce automaticamente i dati personali identificabili (PII) nel report.
            Ogni occorrenza viene sostituita con un segnaposto univoco e consistente.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Detection Summary */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              {totalDetected} {totalDetected === 1 ? 'elemento rilevato' : 'elementi rilevati'}
            </Badge>
            {activeCount !== totalDetected && (
              <Badge variant="outline">
                {activeCount} selezionati per anonimizzazione
              </Badge>
            )}
          </div>

          {/* Category Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ALL_CATEGORIES.map((category) => {
              const count = detection.categories[category];
              return (
                <label
                  key={category}
                  className="flex items-center gap-2 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={enabledCategories.has(category)}
                    onCheckedChange={() => toggleCategory(category)}
                  />
                  <span className="flex-1 text-sm font-medium">
                    {CATEGORY_LABELS[category]}
                  </span>
                  <Badge
                    className={count > 0 ? CATEGORY_COLORS[category] : ''}
                    variant={count > 0 ? undefined : 'secondary'}
                  >
                    {count}
                  </Badge>
                </label>
              );
            })}
          </div>

          {/* Detected Items Preview */}
          {totalDetected > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Elementi rilevati (primi 20):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {detection.matches.slice(0, 20).map((match, idx) => (
                  <span
                    key={`${match.index}-${idx}`}
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${
                      enabledCategories.has(match.category)
                        ? CATEGORY_COLORS[match.category]
                        : 'bg-muted text-muted-foreground line-through'
                    }`}
                  >
                    {match.original}
                  </span>
                ))}
                {detection.matches.length > 20 && (
                  <span className="text-xs text-muted-foreground self-center">
                    ... e altri {detection.matches.length - 20}
                  </span>
                )}
              </div>
            </div>
          )}

          {totalDetected === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun dato personale identificabile rilevato nel report.
            </p>
          )}

          {/* Action Buttons */}
          {totalDetected > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant={showPreview ? 'secondary' : 'default'}
                onClick={() => setShowPreview(!showPreview)}
                disabled={activeCount === 0}
              >
                <Eye className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {showPreview ? 'Nascondi anteprima' : 'Anteprima'}
              </Button>
              {showPreview && anonymized && (
                <>
                  <Button variant="outline" onClick={handleCopyToClipboard}>
                    <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Copia
                  </Button>
                  <Button variant="outline" onClick={handleDownload}>
                    <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    Scarica .txt
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Before / After Preview */}
      {showPreview && anonymized && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Anteprima anonimizzazione
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {anonymized.replacementCount} {anonymized.replacementCount === 1 ? 'sostituzione effettuata' : 'sostituzioni effettuate'}
            </p>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/20 p-4 max-h-[50vh] overflow-auto">
              <pre className="whitespace-pre-wrap text-sm font-mono leading-relaxed">
                {anonymized.anonymizedText}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
