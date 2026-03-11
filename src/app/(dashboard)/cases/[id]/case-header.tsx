'use client';

import { useState, useCallback, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2, Trash2, Pencil, ArrowLeft, Archive,
  RotateCcw, Search, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { CompletenessIndicator } from '@/components/completeness-indicator';
import { deleteCase, updateCaseStatus } from '../../actions';
import { caseTypeLabels } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { EditCaseDialog } from './edit-case-dialog';
import { ShareCaseDialog } from '@/components/share-case-dialog';
import type { CaseData, EventRow, ReportRow } from './types';

// --- Types ---

interface SearchResult {
  type: string;
  id: string;
  title: string;
  excerpt: string;
  date: string | null;
}

interface CaseHeaderProps {
  caseId: string;
  caseData: CaseData;
  events: EventRow[];
  report: ReportRow | null;
  hasProcessingDocs: boolean;
  hasResults: boolean;
}

// --- Component ---

export function CaseHeader({
  caseId,
  caseData,
  events,
  report,
  hasProcessingDocs,
  hasResults,
}: CaseHeaderProps) {
  const router = useRouter();
  const [editCaseOpen, setEditCaseOpen] = useState(false);
  const [deleteCaseOpen, setDeleteCaseOpen] = useState(false);
  const [isDeletingCase, startDeleteCase] = useTransition();
  const [isArchiving, startArchiving] = useTransition();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const isArchived = caseData.status === 'archiviato';

  // Completeness data
  const pm = caseData.perizia_metadata;
  const hasTribunale = !!(pm?.tribunale || pm?.rgNumber);
  const hasQuesiti = !!(pm?.quesiti && pm.quesiti.some((q) => q.trim().length > 0));
  const hasEsameObiettivo = !!(pm?.esameObiettivo && pm.esameObiettivo.trim().length > 0);
  const hasParti = !!(pm?.parteRicorrente || pm?.parteResistente);

  // Debounced search
  const searchAbortRef = useRef<AbortController | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (q.trim().length < 2) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const response = await fetch(
          `/api/cases/${caseId}/search?q=${encodeURIComponent(q.trim())}`,
          { signal: controller.signal },
        );
        const result = await response.json() as { success: boolean; data?: { results: SearchResult[] } };
        if (result.success && result.data) {
          setSearchResults(result.data.results);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, [caseId]);

  const handleDeleteCase = useCallback(() => {
    startDeleteCase(async () => {
      const result = await deleteCase(caseId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push('/');
    });
  }, [caseId, router]);

  const handleArchiveToggle = useCallback(() => {
    startArchiving(async () => {
      const newStatus = isArchived ? 'bozza' : 'archiviato';
      const result = await updateCaseStatus({ caseId, newStatus });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(isArchived ? 'Caso ripristinato' : 'Caso archiviato');
      router.refresh();
    });
  }, [caseId, isArchived, router]);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild aria-label="Torna alla dashboard">
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                {caseData.code}
              </h1>
              {caseData.code.startsWith('DEMO-') && (
                <Badge variant="warning" className="text-xs">DEMO</Badge>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditCaseOpen(true)} title="Modifica caso" aria-label="Modifica caso">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-muted-foreground">
              {caseData.patient_initials || 'N/D'} &mdash;{' '}
              {caseTypeLabels[caseData.case_type] ?? caseData.case_type}
              {caseData.practice_reference && ` \u2014 ${caseData.practice_reference}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasResults && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(!searchOpen)}
                title="Cerca nel caso"
                aria-label="Cerca nel caso"
              >
                <Search className="h-4 w-4" />
              </Button>
              <ShareCaseDialog caseId={caseId} hasReport={!!report?.synthesis} />
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleArchiveToggle}
            disabled={isArchiving}
          >
            {isArchiving ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : isArchived ? (
              <RotateCcw className="mr-1 h-3 w-3" />
            ) : (
              <Archive className="mr-1 h-3 w-3" />
            )}
            {isArchived ? 'Ripristina' : 'Archivia'}
          </Button>
          <Dialog open={deleteCaseOpen} onOpenChange={setDeleteCaseOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={hasProcessingDocs}>
                <Trash2 className="mr-1 h-3 w-3" />Elimina caso
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Eliminare il caso {caseData.code}?</DialogTitle>
                <DialogDescription>
                  Tutti i documenti, eventi e report verranno eliminati definitivamente. Questa azione non è reversibile.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteCaseOpen(false)}>Annulla</Button>
                <Button variant="destructive" onClick={handleDeleteCase} disabled={isDeletingCase}>
                  {isDeletingCase ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                  Elimina definitivamente
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Demo banner */}
      {caseData.code.startsWith('DEMO-') && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/20 px-4 py-2 text-sm text-yellow-800 dark:text-yellow-300">
          Questo è un caso dimostrativo con dati sintetici. Creane uno reale con i tuoi documenti.
        </div>
      )}

      {/* Completeness indicator - visible when results exist */}
      {hasResults && (
        <CompletenessIndicator
          eventCount={events.length}
          hasReport={!!report?.synthesis}
          hasTribunale={hasTribunale}
          hasQuesiti={hasQuesiti}
          hasEsameObiettivo={hasEsameObiettivo}
          hasParti={hasParti}
        />
      )}

      {/* Edit Case Dialog */}
      <EditCaseDialog
        caseData={caseData}
        open={editCaseOpen}
        onOpenChange={setEditCaseOpen}
        onSaved={() => { setEditCaseOpen(false); router.refresh(); }}
      />

      {/* Inline Search */}
      {searchOpen && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              placeholder="Cerca nel caso (documenti, eventi, diagnosi)..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              aria-label="Cerca nel caso"
              autoFocus
            />
            {isSearching && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            <Button variant="ghost" size="icon" onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults(null); }} aria-label="Chiudi ricerca">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {searchResults && searchResults.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-2">
              {searchResults.map((r) => (
                <div key={`${r.type}-${r.id}`} className="rounded border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={r.type === 'event' ? 'outline' : 'secondary'} className="text-xs">
                      {r.type === 'event' ? 'Evento' : 'Documento'}
                    </Badge>
                    <span className="font-medium">{r.title}</span>
                    {r.date && <span className="text-xs text-muted-foreground">{formatDate(r.date)}</span>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.excerpt}</p>
                </div>
              ))}
            </div>
          )}
          {searchResults && searchResults.length === 0 && searchQuery.length >= 2 && (
            <p className="text-sm text-muted-foreground">Nessun risultato per &quot;{searchQuery}&quot;</p>
          )}
        </div>
      )}
    </>
  );
}
