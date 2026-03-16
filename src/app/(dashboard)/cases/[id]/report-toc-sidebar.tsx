'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import type { ClientSection } from '@/lib/section-parser-client';

interface ReportTocSidebarProps {
  sections: ClientSection[];
}

export function ReportTocSidebar({ sections }: ReportTocSidebarProps) {
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

  return (
    <nav
      className="sticky top-[140px] w-48 shrink-0 hidden xl:block"
      aria-label="Indice sezioni report"
    >
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        Indice
      </p>
      <ul className="space-y-0.5">
        {navSections.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => handleClick(section.id)}
              className={cn(
                'w-full text-left text-sm py-1.5 px-3 rounded-r-md border-l-2 transition-colors truncate',
                activeId === section.id
                  ? 'border-primary text-primary font-medium bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
              )}
            >
              {section.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
