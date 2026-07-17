'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ClientSection } from '@/lib/section-parser-client';

/** Stato di lavorazione di una sezione, calcolato in report-step:
 * todo = contiene placeholder (parte che compila il perito),
 * ai = generata dall'AI (da rivedere), confirmed = confermata dal perito. */
export type TocSectionStatus = 'todo' | 'ai' | 'confirmed';

interface ReportTocSidebarProps {
  sections: ClientSection[];
  /** Keyed by section.id (slug del titolo, stesso usato per gli anchor DOM). */
  statuses?: Record<string, TocSectionStatus>;
}

const STATUS_DOT: Record<TocSectionStatus, string> = {
  todo: 'bg-amber-500',
  ai: 'bg-sky-400',
  confirmed: 'bg-green-500',
};

// 'ai' copre generata-dall'AI, compilata-dai-documenti (doc sanitaria
// deterministica, intestazione) e modificata-a-mano non ancora confermata:
// l'etichetta onesta comune è "da rivedere, non ancora confermata" (audit
// 2026-07-17: "Generata dall'AI" era falsa su deterministiche ed editate).
const STATUS_TITLE: Record<TocSectionStatus, string> = {
  todo: 'Da compilare: contiene una parte riservata a te',
  ai: 'Da rivedere: non ancora confermata da te',
  confirmed: 'Confermata da te',
};

export function ReportTocSidebar({ sections, statuses }: ReportTocSidebarProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const headings = sections
      .filter((s) => s.id !== 'preamble')
      .map((s) => document.getElementById(`section-${s.id}`))
      .filter(Boolean) as HTMLElement[];

    if (headings.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          const id = visible[0].target.id.replace('section-', '');
          setActiveId(id);
        }
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    for (const heading of headings) {
      observerRef.current.observe(heading);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [sections]);

  const handleClick = useCallback((sectionId: string) => {
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, []);

  const navSections = sections.filter((s) => s.id !== 'preamble');

  if (navSections.length < 2) return null;

  const todoCount = statuses
    ? navSections.filter((s) => statuses[s.id] === 'todo').length
    : 0;

  return (
    <nav
      className="w-56 shrink-0 hidden lg:block"
      aria-label="Indice sezioni report"
    >
      <div className="sticky top-[140px]">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Indice
        </p>
        {/* L'indice è una checklist, non una lista di nomi: dice subito quali
            sezioni aspettano il perito (founder 2026-07-17). */}
        {todoCount > 0 && (
          <p className="mb-2 text-xs font-medium text-amber-600 dark:text-amber-400">
            {todoCount} {todoCount === 1 ? 'sezione da compilare' : 'sezioni da compilare'}
          </p>
        )}
        <ul className="space-y-0.5">
          {navSections.map((section) => {
            const status = statuses?.[section.id];
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => handleClick(section.id)}
                  title={status ? STATUS_TITLE[status] : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 text-left text-sm py-1.5 px-3 rounded-r-md border-l-2 transition-colors',
                    activeId === section.id
                      ? 'border-primary text-primary font-medium bg-primary/5'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
                  )}
                >
                  {status && (
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
                  )}
                  <span className="truncate">{section.title}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {statuses && (
          <div className="mt-3 space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> da compilare (tua parte)
            </p>
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" /> da rivedere — non ancora confermata
            </p>
            <p className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" /> confermata da te
            </p>
          </div>
        )}
      </div>
    </nav>
  );
}
