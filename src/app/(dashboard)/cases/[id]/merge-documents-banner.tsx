'use client';

/**
 * Proposta di unione multi-file (feedback medici 2026-08-19, Mail 2): più foto
 * caricate che sono PAGINE dello stesso documento (referto fotografato pagina
 * per pagina) vengono rilevate dall'euristica e PROPOSTE per l'unione — la
 * conferma resta sempre all'utente, mai merge silenzioso.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { csrfHeaders } from '@/lib/csrf-client';
import { suggestDocumentMergeGroups, type MergeSuggestion } from '@/services/documents/document-merge';
import type { Document } from './types';

interface MergeDocumentsBannerProps {
  caseId: string;
  documents: Document[];
  /** true se il caso ha già un'elaborazione alle spalle: dopo l'unione serve
   * rielaborare perché l'unione abbia effetto. */
  hasBeenProcessed: boolean;
  /** Il medico ha deciso su una proposta (unita o ignorata): la pagina non gliela richiede. */
  onDecided?: (key: string) => void;
}

/** Unione di un gruppo di documenti (API): riusata dal banner e dal cancello «Prosegui». */
export async function mergeDocumentGroup(caseId: string, documentIds: string[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/documents/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({ caseId, documentIds }),
    });
    const data = await res.json() as { success: boolean; error?: string };
    return data.success ? { ok: true } : { ok: false, error: data.error };
  } catch {
    return { ok: false, error: 'Errore di rete durante l\'unione dei documenti. Riprova.' };
  }
}

export function MergeDocumentsBanner({ caseId, documents, hasBeenProcessed, onDecided }: MergeDocumentsBannerProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const suggestions = useMemo<MergeSuggestion[]>(() => {
    return suggestDocumentMergeGroups(
      documents.map((d) => ({
        id: d.id,
        fileName: d.file_name,
        mergedIntoDocumentId: d.merged_into_document_id ?? null,
        uploadedAt: d.created_at ?? null,
      })),
    );
  }, [documents]);

  const nameById = useMemo(() => new Map(documents.map((d) => [d.id, d.file_name])), [documents]);

  const visible = suggestions.filter((s) => !dismissed.has(s.documentIds.join('|')));
  if (visible.length === 0) return null;

  const handleMerge = async (suggestion: MergeSuggestion) => {
    const key = suggestion.documentIds.join('|');
    setMergingKey(key);
    try {
      const result = await mergeDocumentGroup(caseId, suggestion.documentIds);
      if (!result.ok) {
        toast.error(result.error ?? 'Errore durante l\'unione dei documenti');
        return;
      }
      onDecided?.(key);
      toast.success(
        hasBeenProcessed
          ? 'Documenti uniti. Riavvia l\'elaborazione perché l\'unione abbia effetto.'
          : 'Documenti uniti: verranno letti come un unico documento di più pagine.',
        { duration: 8000 },
      );
      router.refresh();
    } finally {
      setMergingKey(null);
    }
  };
  const dismiss = (key: string) => {
    setDismissed((prev) => new Set(prev).add(key));
    onDecided?.(key);
  };

  return (
    <div className="space-y-2">
      {visible.map((suggestion) => {
        const key = suggestion.documentIds.join('|');
        const isMerging = mergingKey === key;
        return (
          <div key={key} className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Layers className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 text-sm text-blue-900 dark:text-blue-200">
                <span className="font-medium">
                  Questi {suggestion.documentIds.length} file sembrano pagine dello stesso documento
                </span>{' '}
                ({suggestion.reason}). Se è un unico referto fotografato pagina per pagina, uniscili:
                l&apos;AI lo leggerà come UN documento — categoria unica e cronologia senza spezzature.
                <ul className="mt-1 text-xs text-blue-800 dark:text-blue-300 list-disc list-inside">
                  {suggestion.documentIds.map((id, idx) => (
                    <li key={id} className="truncate">
                      pag. {idx + 1} — {nameById.get(id) ?? id}
                    </li>
                  ))}
                </ul>
              </div>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
                title="No, sono documenti separati"
                aria-label="Ignora la proposta di unione"
                onClick={() => dismiss(key)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 pl-6">
              <Button size="sm" variant="default" onClick={() => handleMerge(suggestion)} disabled={isMerging}>
                {isMerging ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Layers className="h-3.5 w-3.5 mr-1.5" />}
                Unisci in un documento
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismiss(key)}
                disabled={isMerging}
              >
                No, sono documenti separati
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
