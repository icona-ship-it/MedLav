import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  /** Lucide icon component (e.g. FileText, Inbox) */
  icon?: ComponentType<{ className?: string }>;
  /** Primary headline */
  title: string;
  /** Secondary description */
  description?: string;
  /** Optional CTA / extra content (typically a <Button>) */
  children?: ReactNode;
  className?: string;
}

/**
 * EmptyState — placeholder when a list/section has no content.
 *
 * Used everywhere we'd previously have shown nothing (or a sad <p>).
 * The icon + title + description + CTA pattern is consistent and gives
 * the user a clear next step instead of leaving them stranded.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: EmptyStateProps): React.ReactElement {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-12 px-6',
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
