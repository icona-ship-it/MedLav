'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatRelativeDate } from '@/lib/format-date';

// --- Types ---

export interface CaseSearchItem {
  id: string;
  code: string;
  patient_initials: string | null;
  status: string;
  case_type: string;
  case_role: string;
  module_id: string | null;
  processing_stage: string;
  document_count: number;
  created_at: string;
  /** Pre-computed display label (module or case type) */
  label: string;
  statusLabel: string;
  statusVariant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  /** Processing stage badge info, if applicable */
  stageBadge?: {
    label: string;
    variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success';
    icon: 'spinner' | 'check' | 'alert' | 'error';
  };
}

interface CaseSearchProps {
  cases: CaseSearchItem[];
}

// --- Component ---

export function CaseSearch({ cases }: CaseSearchProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return cases;
    const q = search.toLowerCase();
    return cases.filter((c) =>
      c.code.toLowerCase().includes(q) ||
      (c.patient_initials ?? '').toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q)
    );
  }, [cases, search]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Cerca per codice, paziente o tipo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nessun caso trovato per &ldquo;{search}&rdquo;
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((caseItem) => (
            <Link
              key={caseItem.id}
              href={`/cases/${caseItem.id}`}
              className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {caseItem.code}
                  </span>
                  <Badge variant={caseItem.statusVariant}>
                    {caseItem.statusLabel}
                  </Badge>
                  {!caseItem.module_id && (
                    <Badge variant="outline">
                      {caseItem.case_role.toUpperCase()}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {caseItem.patient_initials || 'N/D'} &mdash;{' '}
                  {caseItem.label}
                </p>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>{caseItem.document_count} documenti</div>
                <div>{formatRelativeDate(caseItem.created_at)}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
