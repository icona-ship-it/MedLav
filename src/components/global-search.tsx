'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Search, X, FileText, AlertTriangle, FolderOpen, Calendar, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SearchResult {
  type: 'event' | 'report' | 'anomaly' | 'case';
  id: string;
  title: string;
  excerpt: string;
  caseId: string;
  caseCode: string;
  caseType: string;
  date: string | null;
}

const TYPE_CONFIG: Record<string, { label: string; icon: typeof Search; color: string }> = {
  case: { label: 'Caso', icon: FolderOpen, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  event: { label: 'Evento', icon: Calendar, color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  report: { label: 'Report', icon: FileText, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  anomaly: { label: 'Anomalia', icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults([]);
      setTotal(0);
    }
  }, [isOpen]);

  const doSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
      const json = await res.json() as { success: boolean; data?: { results: SearchResult[]; total: number } };
      if (json.success && json.data) {
        setResults(json.data.results);
        setTotal(json.data.total);
      }
    } catch {
      // Silently fail — user will see empty results
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }, [doSearch]);

  const handleResultClick = useCallback((result: SearchResult) => {
    setIsOpen(false);
    router.push(`/cases/${result.caseId}`);
  }, [router]);

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start text-muted-foreground text-xs gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Cerca nei casi...</span>
        <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50"
        onClick={() => setIsOpen(false)}
      />

      {/* Search Modal */}
      <div className="fixed inset-x-0 top-[10%] z-50 mx-auto w-full max-w-xl px-4">
        <div className="rounded-lg border bg-background shadow-2xl">
          {/* Search input */}
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              ref={inputRef}
              type="text"
              placeholder="Cerca eventi, report, anomalie in tutti i casi..."
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Results */}
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {query.length < 2 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Digita almeno 2 caratteri per cercare
              </p>
            ) : results.length === 0 && !isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nessun risultato per &quot;{query}&quot;
              </p>
            ) : (
              <>
                {results.map((result) => {
                  const config = TYPE_CONFIG[result.type] ?? TYPE_CONFIG.event;
                  const Icon = config.icon;

                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      className="w-full text-left rounded-md px-3 py-2.5 hover:bg-accent transition-colors"
                      onClick={() => handleResultClick(result)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', config.color)}>
                          <Icon className="mr-1 h-3 w-3" />
                          {config.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Caso {result.caseCode}
                        </span>
                        {result.date && (
                          <span className="text-xs text-muted-foreground">
                            {result.date}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {result.excerpt}
                      </p>
                    </button>
                  );
                })}
                {total > results.length && (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    Mostrati {results.length} di {total} risultati
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
