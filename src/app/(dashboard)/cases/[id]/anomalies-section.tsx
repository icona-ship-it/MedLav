'use client';

import { useState, useCallback, useTransition, useRef, useMemo } from 'react';
import { AlertTriangle, FileWarning, Pencil, X, Save, CheckCircle2, Upload, Loader2, Eye, EyeOff, ShieldCheck, ShieldAlert, Archive, ThumbsUp } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { anomalyTypeLabels } from '@/lib/constants';
import { updateAnomaly, dismissAnomaly, confirmAnomaly, saveDocumentMetadata, updateCaseDocumentCount } from '../../actions';
import { createClient } from '@/lib/supabase/client';
import type { AnomalyRow, MissingDocRow, EventRow, Document } from './types';

// --- Types ---

interface InvolvedEvent {
  orderNumber: number;
  title: string;
  date: string;
}

interface AnomaliesSectionProps {
  caseId: string;
  anomalies: AnomalyRow[];
  events?: EventRow[];
  documents?: Document[];
  onChanged?: (dismissedId?: string) => void;
}

interface MissingDocsSectionProps {
  missingDocs: MissingDocRow[];
  caseId?: string;
  onUploadComplete?: () => void;
}

// --- Helpers ---

function severityVariant(severity: string): 'destructive' | 'warning' | 'secondary' {
  switch (severity) {
    case 'critica': case 'alta': return 'destructive';
    case 'media': return 'warning';
    default: return 'secondary';
  }
}

function parseInvolvedEvents(involvedEventsJson: string | null): InvolvedEvent[] {
  if (!involvedEventsJson) return [];
  try {
    const parsed = JSON.parse(involvedEventsJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((e: Record<string, unknown>) => ({
      orderNumber: typeof e.orderNumber === 'number' ? e.orderNumber : 0,
      title: typeof e.title === 'string' ? e.title : '',
      date: typeof e.date === 'string' ? e.date : '',
    }));
  } catch {
    return [];
  }
}

function resolveEventReferences(
  involvedEvents: InvolvedEvent[],
  events?: EventRow[],
  documents?: Document[],
): string[] {
  if (!events || involvedEvents.length === 0) return [];

  return involvedEvents.map((ie) => {
    const matchedEvent = events.find((e) => e.order_number === ie.orderNumber);
    if (!matchedEvent) return `Evento #${ie.orderNumber}: ${ie.title}`;

    const docName = matchedEvent.document_id && documents
      ? documents.find((d) => d.id === matchedEvent.document_id)?.file_name
      : null;

    let sourcePages = '';
    if (matchedEvent.source_pages) {
      try {
        const parsed = JSON.parse(matchedEvent.source_pages) as unknown;
        if (Array.isArray(parsed) && parsed.length > 0) {
          const pageNumbers = parsed.filter((p): p is number => typeof p === 'number');
          if (pageNumbers.length > 0) {
            sourcePages = `, pag. ${pageNumbers.join(', ')}`;
          }
        }
      } catch {
        // Not JSON — use as plain string, stripping brackets if present
        const clean = matchedEvent.source_pages.replace(/^\[|\]$/g, '').trim();
        if (clean) {
          sourcePages = `, pag. ${clean}`;
        }
      }
    }

    const docRef = docName ? ` — Doc: ${docName}${sourcePages}` : '';
    return `Evento #${ie.orderNumber}: ${ie.title}${docRef}`;
  });
}

// --- Status helpers ---

function isResolved(status: string | null): boolean {
  return status === 'llm_resolved' || status === 'user_dismissed' || status === 'user_confirmed';
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'detected') return null;

  if (status === 'llm_resolved') {
    return (
      <Badge variant="outline" className="text-xs border-green-500 text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30">
        <ShieldCheck className="mr-1 h-3 w-3" />Risolta IA
      </Badge>
    );
  }

  if (status === 'llm_confirmed') {
    return (
      <Badge variant="outline" className="text-xs border-blue-500 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
        <ShieldAlert className="mr-1 h-3 w-3" />Confermata
      </Badge>
    );
  }

  if (status === 'user_confirmed') {
    return (
      <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
        <ThumbsUp className="mr-1 h-3 w-3" />Confermata — nel report
      </Badge>
    );
  }

  if (status === 'user_dismissed') {
    return (
      <Badge variant="outline" className="text-xs border-gray-400 text-gray-500">
        <Archive className="mr-1 h-3 w-3" />Ignorata — esclusa dal report
      </Badge>
    );
  }

  return null;
}

// --- Anomaly Card ---

function AnomalyCard({
  anomaly,
  events,
  documents,
  caseId,
  onChanged,
}: {
  anomaly: AnomalyRow;
  events?: EventRow[];
  documents?: Document[];
  caseId: string;
  onChanged?: (dismissedId?: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(anomaly.description);
  const [editSuggestion, setEditSuggestion] = useState(anomaly.suggestion ?? '');
  const [isSaving, startSave] = useTransition();
  const [isDismissing, startDismiss] = useTransition();
  const [isConfirming, startConfirm] = useTransition();

  const involvedEvents = parseInvolvedEvents(anomaly.involved_events);
  const references = resolveEventReferences(involvedEvents, events, documents);
  const resolved = isResolved(anomaly.status);

  const handleSave = useCallback(() => {
    startSave(async () => {
      const result = await updateAnomaly({
        anomalyId: anomaly.id,
        caseId,
        description: editDescription,
        suggestion: editSuggestion.trim() || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Anomalia aggiornata');
      setIsEditing(false);
      onChanged?.();
    });
  }, [anomaly.id, caseId, editDescription, editSuggestion, onChanged]);

  const handleDismiss = useCallback(() => {
    startDismiss(async () => {
      const result = await dismissAnomaly({ anomalyId: anomaly.id, caseId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Anomalia ignorata — non sara inclusa nel report');
      onChanged?.(anomaly.id);
    });
  }, [anomaly.id, caseId, onChanged]);

  const handleConfirm = useCallback(() => {
    startConfirm(async () => {
      const result = await confirmAnomaly({ anomalyId: anomaly.id, caseId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Anomalia confermata — sara segnalata nel report');
      onChanged?.();
    });
  }, [anomaly.id, caseId, onChanged]);

  return (
    <div className={`rounded-md border p-3 ${resolved ? 'opacity-60' : ''}`}>
      {/* Header: severity + type + status */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={severityVariant(anomaly.severity)}>{anomaly.severity.toUpperCase()}</Badge>
          <StatusBadge status={anomaly.status} />
          <span className="text-sm font-medium">{anomalyTypeLabels[anomaly.anomaly_type] ?? anomaly.anomaly_type}</span>
        </div>
        {!isEditing && !resolved && (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-1 h-3 w-3" />Modifica
          </Button>
        )}
      </div>

      {/* Body: description + suggestion + edit form */}
      {isEditing ? (
        <div className="space-y-2">
          <Textarea
            className="text-sm"
            rows={3}
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Descrizione anomalia..."
          />
          <Textarea
            className="text-sm"
            rows={2}
            value={editSuggestion}
            onChange={(e) => setEditSuggestion(e.target.value)}
            placeholder="Suggerimento (opzionale)..."
          />
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={handleSave} disabled={isSaving || !editDescription.trim()}>
              <Save className="mr-1 h-3 w-3" />Salva
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setEditDescription(anomaly.description); setEditSuggestion(anomaly.suggestion ?? ''); }}>
              <X className="mr-1 h-3 w-3" />Annulla
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm">{anomaly.description}</p>
          {anomaly.suggestion && (
            <p className="mt-2 text-sm text-muted-foreground italic">
              Suggerimento: {anomaly.suggestion}
            </p>
          )}
          {anomaly.resolution_note && (
            <p className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
              {anomaly.resolution_note}
            </p>
          )}
        </>
      )}

      {/* Event/document references */}
      {references.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {references.map((ref) => (
            <p key={ref} className="text-xs text-muted-foreground">
              {ref}
            </p>
          ))}
        </div>
      )}

      {/* Action buttons — only for unresolved anomalies */}
      {!resolved && !isEditing && (
        <div className="mt-3 flex items-center gap-2 pt-2 border-t border-dashed">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs border-amber-500/50 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            onClick={handleConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <ThumbsUp className="mr-1 h-3 w-3" />
            )}
            Confermo — includi nel report
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            disabled={isDismissing}
          >
            {isDismissing ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Archive className="mr-1 h-3 w-3" />
            )}
            Ignora — escludi dal report
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Anomalies Component ---

export function AnomaliesSection({ anomalies, events, documents, caseId, onChanged }: AnomaliesSectionProps) {
  const [showResolved, setShowResolved] = useState(false);

  const resolvedCount = useMemo(
    () => anomalies.filter((a) => isResolved(a.status)).length,
    [anomalies],
  );

  const visibleAnomalies = useMemo(
    () => showResolved ? anomalies : anomalies.filter((a) => !isResolved(a.status)),
    [anomalies, showResolved],
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Anomalie Rilevate
          </CardTitle>
          {resolvedCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setShowResolved(!showResolved)}
            >
              {showResolved ? (
                <><EyeOff className="mr-1 h-3 w-3" />Nascondi risolte ({resolvedCount})</>
              ) : (
                <><Eye className="mr-1 h-3 w-3" />Mostra risolte ({resolvedCount})</>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {visibleAnomalies.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {anomalies.length > 0 ? 'Tutte le anomalie sono state risolte.' : 'Nessuna anomalia rilevata.'}
          </p>
        ) : (
          <div className="space-y-3">
            {visibleAnomalies.map((a) => (
              <AnomalyCard
                key={a.id}
                anomaly={a}
                events={events}
                documents={documents}
                caseId={caseId}
                onChanged={onChanged}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- Missing Doc Upload Button ---

function MissingDocUploadButton({
  docName,
  caseId,
  onUploadComplete,
}: {
  docName: string;
  caseId: string;
  onUploadComplete?: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Non autenticato');
        return;
      }

      const ext = file.name.split('.').pop() ?? 'bin';
      const storagePath = `${user.id}/${caseId}/${crypto.randomUUID()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        toast.error(`Errore upload: ${uploadError.message}`);
        return;
      }

      const result = await saveDocumentMetadata({
        caseId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storagePath,
        documentType: 'altro',
      });

      if (result?.error) {
        toast.error(result.error);
        return;
      }

      await updateCaseDocumentCount(caseId);
      toast.success(`"${file.name}" caricato come "${docName}"`);
      onUploadComplete?.();
    } catch {
      toast.error('Errore di rete durante il caricamento');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [caseId, docName, onUploadComplete]);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2 text-xs mt-2"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
      >
        {isUploading ? (
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        ) : (
          <Upload className="mr-1 h-3 w-3" />
        )}
        {isUploading ? 'Caricamento...' : 'Carica documento'}
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.doc,.docx,.xls,.xlsx"
        className="hidden"
        onChange={handleFileSelected}
        aria-label={`Carica documento per ${docName}`}
      />
    </>
  );
}

// --- Missing Docs Component ---

export function MissingDocsSection({ missingDocs, caseId, onUploadComplete }: MissingDocsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="h-5 w-5 text-destructive" />
          Documentazione Mancante
        </CardTitle>
        {missingDocs.length > 0 && (() => {
          const checklistItems = missingDocs.filter((d) => (d.document_name as string).startsWith('[CHECKLIST]'));
          const totalChecklist = missingDocs.filter((d) => (d.document_name as string).startsWith('[CHECKLIST]')).length;
          const standardItems = missingDocs.length - totalChecklist;
          return (
            <CardDescription>
              {standardItems > 0 && <span>{standardItems} documenti mancanti</span>}
              {standardItems > 0 && checklistItems.length > 0 && <span> · </span>}
              {checklistItems.length > 0 && <span>{checklistItems.length} item checklist</span>}
            </CardDescription>
          );
        })()}
      </CardHeader>
      <CardContent>
        {missingDocs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nessuna documentazione mancante.</p>
        ) : (
          <div className="space-y-3">
            {missingDocs.map((d) => {
              const isChecklist = (d.document_name as string).startsWith('[CHECKLIST]');
              const displayName = isChecklist
                ? (d.document_name as string).replace('[CHECKLIST] ', '')
                : d.document_name;
              return (
                <div key={d.id} className={`rounded-md border p-3 ${isChecklist ? 'border-dashed border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20' : ''}`}>
                  <div className="flex items-center gap-2">
                    {isChecklist && <Badge variant="outline" className="text-xs">Checklist</Badge>}
                    <p className="text-sm font-medium">{displayName}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{d.reason}</p>
                  {d.related_event && (
                    <p className="mt-1 text-xs text-muted-foreground">Evento correlato: {d.related_event}</p>
                  )}
                  {caseId && (
                    <MissingDocUploadButton
                      docName={displayName}
                      caseId={caseId}
                      onUploadComplete={onUploadComplete}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
