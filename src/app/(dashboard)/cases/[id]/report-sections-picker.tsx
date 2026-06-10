'use client';

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
  disabled?: boolean;
}

/**
 * Lista checkbox delle sezioni del report. Le sezioni obbligatorie sono sempre
 * attive e non disattivabili. Componente presentazionale puro: il caricamento
 * delle opzioni e la persistenza sono responsabilita' del genitore (riusato dal
 * form perizia e dal pannello nello step Elaborazione).
 */
export function ReportSectionsPicker({
  options,
  excluded,
  onToggle,
  disabled = false,
}: ReportSectionsPickerProps) {
  if (options.length === 0) {
    return <p className="text-sm text-muted-foreground">Caricamento sezioni…</p>;
  }

  return (
    <div className="space-y-1.5">
      {options.map((opt) => {
        const enabled = opt.mandatory || !excluded.includes(opt.id);
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
          </label>
        );
      })}
    </div>
  );
}
