'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ReportSectionOption {
  id: string;
  title: string;
  mandatory: boolean;
}

interface ReportSectionsPickerProps {
  options: ReportSectionOption[];
  /** ID delle sezioni NON obbligatorie attualmente escluse dal report. */
  excluded: string[];
  /** Chiamata al toggle di una sezione: include=true la riattiva, false la esclude. */
  onToggle: (sectionId: string, include: boolean) => void;
  /** Ordine capitoli (feedback beta 2026-07-20): chiamata con il nuovo elenco
      COMPLETO di id ordinati dopo uno spostamento ↑/↓. Assente = frecce nascoste. */
  onReorder?: (orderedIds: string[]) => void;
  disabled?: boolean;
}

/**
 * Lista checkbox delle sezioni del report, con frecce ↑/↓ per l'ordine dei
 * capitoli. Le sezioni obbligatorie (intestazione, epicrisi) sono sempre attive,
 * non disattivabili e non spostabili (restano agli estremi del documento).
 * Componente presentazionale puro: il caricamento delle opzioni e la persistenza
 * sono responsabilita' del genitore.
 */
export function ReportSectionsPicker({
  options,
  excluded,
  onToggle,
  onReorder,
  disabled = false,
}: ReportSectionsPickerProps) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Caricamento sezioni…</p>;
  }

  // Le posizioni spostabili sono quelle non-mandatory; uno spostamento scambia
  // la sezione con la vicina spostabile (le mandatory restano dove sono).
  const movableIdx = options
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => !o.mandatory)
    .map(({ i }) => i);

  const move = (index: number, dir: -1 | 1) => {
    if (!onReorder) return;
    const posInMovable = movableIdx.indexOf(index);
    const swapWith = movableIdx[posInMovable + dir];
    if (swapWith === undefined) return;
    const next = options.slice();
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    onReorder(next.map((o) => o.id));
  };

  return (
    <div className="space-y-1.5">
      {options.map((opt, index) => {
        const enabled = opt.mandatory || !excluded.includes(opt.id);
        const posInMovable = movableIdx.indexOf(index);
        const canMoveUp = !opt.mandatory && posInMovable > 0;
        const canMoveDown = !opt.mandatory && posInMovable >= 0 && posInMovable < movableIdx.length - 1;
        return (
          <label
            key={opt.id}
            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              opt.mandatory ? '' : 'cursor-pointer hover:bg-muted/50'
            }`}
          >
            <input
              type="checkbox"
              checked={enabled}
              disabled={opt.mandatory || disabled}
              onChange={(e) => {
                if (opt.mandatory) return;
                onToggle(opt.id, e.target.checked);
              }}
              className="h-4 w-4 rounded border-input accent-primary shrink-0"
            />
            <span className="flex-1">{opt.title}</span>
            {opt.mandatory && (
              <span className="text-xs text-muted-foreground">sempre inclusa</span>
            )}
            {onReorder && !opt.mandatory && (
              <span className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={disabled || !canMoveUp}
                  aria-label={`Sposta "${opt.title}" più su`}
                  onClick={(e) => {
                    e.preventDefault();
                    move(index, -1);
                  }}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={disabled || !canMoveDown}
                  aria-label={`Sposta "${opt.title}" più giù`}
                  onClick={(e) => {
                    e.preventDefault();
                    move(index, 1);
                  }}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
