'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText, Loader2, CheckCircle2, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { DOCUMENT_TYPES } from '@/lib/constants';
import { csrfHeaders } from '@/lib/csrf-client';
import type { Document } from './types';

// --- Types ---

interface ClassificationReviewProps {
  caseId: string;
  documents: Document[];
}

interface DocTypeSelection {
  documentId: string;
  documentType: string;
}

// --- Helpers ---

function confidenceBadgeVariant(confidence: number): 'default' | 'secondary' | 'destructive' {
  if (confidence >= 80) return 'default';
  if (confidence >= 50) return 'secondary';
  return 'destructive';
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 80) return 'Alta';
  if (confidence >= 50) return 'Media';
  return 'Bassa';
}

// --- Component ---

export function ClassificationReview({ caseId, documents }: ClassificationReviewProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);

  // Initialize selections from current document types
  const [selections, setSelections] = useState<DocTypeSelection[]>(() =>
    documents.map((doc) => ({
      documentId: doc.id,
      documentType: doc.document_type ?? 'altro',
    })),
  );

  const updateType = useCallback((documentId: string, documentType: string) => {
    setSelections((prev) =>
      prev.map((s) =>
        s.documentId === documentId ? { ...s, documentType } : s,
      ),
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    setIsConfirming(true);
    try {
      const response = await fetch('/api/processing/confirm-classification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
        body: JSON.stringify({
          caseId,
          documentTypes: selections,
        }),
      });
      const result = await response.json() as { success: boolean; error?: string };
      if (!result.success) {
        toast.error(result.error ?? 'Errore nella conferma');
        setIsConfirming(false);
        return;
      }
      toast.success('Classificazione confermata. L\'elaborazione riprende.');
      router.refresh();
    } catch {
      toast.error('Errore di rete. Verifica la connessione.');
      setIsConfirming(false);
    }
  }, [caseId, selections, router]);

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="text-center space-y-1">
          <p className="text-sm font-medium">Revisione classificazione documenti</p>
          <p className="text-xs text-muted-foreground">
            L&apos;AI ha analizzato i tuoi documenti. Verifica che i tipi siano corretti prima di proseguire con l&apos;estrazione.
          </p>
        </div>

        <div className="space-y-2">
          {documents.map((doc) => {
            const selection = selections.find((s) => s.documentId === doc.id);
            const meta = doc.classification_metadata;

            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={doc.file_name}>
                    {doc.file_name}
                  </p>
                  {meta && (
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant={confidenceBadgeVariant(meta.confidence)} className="text-xs">
                        AI: {meta.confidence}% — {confidenceLabel(meta.confidence)}
                      </Badge>
                      {meta.reasoning && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Motivazione AI"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent side="top" className="text-xs max-w-xs">
                            {meta.reasoning}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  )}
                </div>

                <Select
                  value={selection?.documentType ?? 'altro'}
                  onValueChange={(value) => updateType(doc.id, value)}
                >
                  <SelectTrigger className="w-[200px] shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>

        <Button
          size="lg"
          className="w-full text-base py-6 bg-green-600 hover:bg-green-700 text-white"
          onClick={handleConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Conferma in corso...
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-5 w-5" />
              Conferma classificazione e prosegui
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
