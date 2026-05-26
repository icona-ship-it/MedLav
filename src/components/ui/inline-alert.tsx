'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type InlineAlertVariant = 'info' | 'success' | 'warning' | 'destructive';

interface InlineAlertProps {
  variant?: InlineAlertVariant;
  title?: string;
  children?: React.ReactNode;
  /** Optional CTA shown on the right side of the banner. */
  action?: {
    label: string;
    onClick: () => void;
  };
  /** Show a dismiss (X) button — calls onDismiss when clicked. */
  onDismiss?: () => void;
  /** Sticky banner that stays visible while scrolling under it. */
  sticky?: boolean;
  className?: string;
}

const VARIANT_STYLES: Record<InlineAlertVariant, { container: string; icon: string }> = {
  info: {
    container: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200',
    icon: 'text-blue-600 dark:text-blue-400',
  },
  success: {
    container: 'border-green-200 bg-green-50 text-green-900 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-200',
    icon: 'text-green-600 dark:text-green-400',
  },
  warning: {
    container: 'border-orange-200 bg-orange-50 text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-200',
    icon: 'text-orange-600 dark:text-orange-400',
  },
  destructive: {
    container: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200',
    icon: 'text-red-600 dark:text-red-400',
  },
};

const VARIANT_ICONS: Record<InlineAlertVariant, React.ComponentType<{ className?: string }>> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: XCircle,
};

/**
 * Banner inline ("InlineAlert") che vive sopra il contenuto principale.
 *
 * Pensato per il pattern "anomalie protagoniste" del refactor UX:
 * invece di confinare segnalazioni importanti in una sidebar laterale
 * collassabile, le mostriamo above-fold come banner azionabile con CTA.
 *
 * Esempio:
 *   <InlineAlert
 *     variant="warning"
 *     title="3 anomalie cliniche da valutare prima del deposito"
 *     action={{ label: 'Apri elenco', onClick: () => setDialogOpen(true) }}
 *     sticky
 *   >
 *     Il sistema ha rilevato alcune incongruenze nella documentazione.
 *   </InlineAlert>
 */
export function InlineAlert({
  variant = 'info',
  title,
  children,
  action,
  onDismiss,
  sticky = false,
  className,
}: InlineAlertProps): React.ReactElement {
  const styles = VARIANT_STYLES[variant];
  const Icon = VARIANT_ICONS[variant];

  return (
    <div
      role={variant === 'destructive' || variant === 'warning' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border px-4 py-3 flex items-start gap-3',
        styles.container,
        sticky && 'sticky top-0 z-20 backdrop-blur-sm',
        className,
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0 mt-0.5', styles.icon)} aria-hidden />
      <div className="flex-1 min-w-0">
        {title && (
          <p className="font-semibold text-sm leading-tight">{title}</p>
        )}
        {children && (
          <div className={cn('text-sm', title && 'mt-1 opacity-90')}>
            {children}
          </div>
        )}
      </div>
      {action && (
        <Button
          variant="outline"
          size="sm"
          onClick={action.onClick}
          className="shrink-0 bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40"
        >
          {action.label}
        </Button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Chiudi"
          className="shrink-0 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
