import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';

type MetricTone = 'default' | 'success' | 'warning' | 'destructive' | 'info';

interface MetricCardProps {
  /** Lucide icon component */
  icon?: ComponentType<{ className?: string }>;
  /** Small label above the value (e.g. "Eventi clinici") */
  label: string;
  /** Main value (number, string, or JSX) */
  value: React.ReactNode;
  /** Optional secondary text shown under the value */
  sublabel?: string;
  /** Tone influences the value color */
  tone?: MetricTone;
  className?: string;
}

const TONE_VALUE_CLASS: Record<MetricTone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  info: 'text-info',
};

/**
 * MetricCard — KPI card with consistent layout.
 *
 * Used in: report sidebar metrics, dashboard counters, anomalies summary.
 * Replaces the ad-hoc "label + number" divs scattered across the codebase.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
  tone = 'default',
  className,
}: MetricCardProps): React.ReactElement {
  return (
    <div className={cn('rounded-lg border bg-card px-4 py-3 flex items-start gap-3', className)}>
      {Icon && (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-wider font-medium text-muted-foreground">
          {label}
        </p>
        <p className={cn('text-lg font-semibold leading-tight mt-0.5', TONE_VALUE_CLASS[tone])}>
          {value}
        </p>
        {sublabel && (
          <p className="text-xs text-muted-foreground mt-0.5">{sublabel}</p>
        )}
      </div>
    </div>
  );
}
