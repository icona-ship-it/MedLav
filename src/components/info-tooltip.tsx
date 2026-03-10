'use client';

import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InfoTooltipProps {
  title: string;
  children: React.ReactNode;
}

/**
 * Info tooltip that opens a popup with explanation.
 * Click the ? icon to open, click X or outside to close.
 */
export function InfoTooltip({ title, children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-primary transition-colors"
        aria-label={`Informazioni: ${title}`}
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          {/* Popup */}
          <div className="absolute left-0 top-6 z-50 w-80 rounded-lg border bg-popover p-4 shadow-lg animate-in fade-in-0 zoom-in-95">
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-semibold">{title}</h4>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 -mr-1 -mt-1"
                onClick={() => setOpen(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              {children}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
