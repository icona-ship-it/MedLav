'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Hand } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Document } from './types';
import type { DocumentPage } from '../../actions';

interface OcrPreviewTabProps {
  documents: Document[];
  documentPages: DocumentPage[];
}

function confidenceBadge(confidence: number | null) {
  if (confidence === null || confidence === undefined) {
    return <Badge variant="secondary">N/D</Badge>;
  }
  if (confidence >= 80) {
    return <Badge variant="success">{Math.round(confidence)}%</Badge>;
  }
  if (confidence >= 50) {
    return <Badge variant="warning">{Math.round(confidence)}%</Badge>;
  }
  return <Badge variant="destructive">{Math.round(confidence)}%</Badge>;
}

function DocumentOcrSection({
  document,
  pages,
}: {
  document: Document;
  pages: DocumentPage[];
}) {
  const [open, setOpen] = useState(false);
  const avgConfidence = pages.length > 0
    ? pages.reduce((sum, p) => sum + (p.ocr_confidence ?? 0), 0) / pages.length
    : null;
  const hasHandwriting = pages.some((p) => p.has_handwriting === 'yes' || p.has_handwriting === 'partial');

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{document.file_name}</p>
              <p className="text-xs text-muted-foreground">{pages.length} pagine</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasHandwriting && (
              <Badge variant="outline" className="gap-1">
                <Hand className="h-3 w-3" />Scrittura a mano
              </Badge>
            )}
            {confidenceBadge(avgConfidence)}
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-3 pl-2">
          {pages.map((page) => (
            <div key={page.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Pagina {page.page_number}
                </span>
                <div className="flex items-center gap-2">
                  {page.has_handwriting === 'yes' && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Hand className="h-2.5 w-2.5" />Manoscritta
                    </Badge>
                  )}
                  {page.has_handwriting === 'partial' && (
                    <Badge variant="outline" className="text-xs gap-1">
                      <Hand className="h-2.5 w-2.5" />Parz. manoscritta
                    </Badge>
                  )}
                  {confidenceBadge(page.ocr_confidence)}
                </div>
              </div>
              {page.ocr_text ? (
                <pre className="max-h-60 overflow-auto whitespace-pre-wrap text-xs leading-relaxed bg-muted/30 rounded p-2 font-mono">
                  {page.ocr_text}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground italic py-2">
                  Nessun testo estratto per questa pagina.
                </p>
              )}
            </div>
          ))}
          {pages.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nessuna pagina OCR disponibile per questo documento.
            </p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function OcrPreviewTab({ documents, documentPages }: OcrPreviewTabProps) {
  // Group pages by document
  const pagesByDoc = new Map<string, DocumentPage[]>();
  for (const page of documentPages) {
    const docId = page.document_id;
    if (!pagesByDoc.has(docId)) {
      pagesByDoc.set(docId, []);
    }
    pagesByDoc.get(docId)!.push(page);
  }

  const totalPages = documentPages.length;
  const pagesWithText = documentPages.filter((p) => p.ocr_text).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Testo OCR Estratto
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {pagesWithText} di {totalPages} pagine con testo estratto
        </p>
      </CardHeader>
      <CardContent>
        {documents.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nessun documento disponibile.
          </p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <DocumentOcrSection
                key={doc.id}
                document={doc}
                pages={pagesByDoc.get(doc.id) ?? []}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
