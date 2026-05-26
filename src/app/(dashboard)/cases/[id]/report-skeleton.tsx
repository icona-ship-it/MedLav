import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export function ReportSkeleton() {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-32" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <div className="pt-4" />
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="pt-4" />
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </CardContent>
    </Card>
  );
}

export function EventsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16" />
          </div>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function DocumentsSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-md border p-3">
          <Skeleton className="h-8 w-8 rounded" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      ))}
    </div>
  );
}

// Predictive skeleton for the AnomaliesSection (UX refactor Ondata 1).
// Mirrors the layout of an actionable anomaly card so the user perceives
// "qualcosa sta caricando" matching the final shape.
export function AnomaliesSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-md border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/10 p-3 space-y-3">
          {/* Header row: severity badge + status badge + type label */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-40" />
          </div>
          {/* Description */}
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          {/* References row */}
          <Skeleton className="h-3 w-2/3" />
          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <Skeleton className="h-8 w-32 rounded" />
            <Skeleton className="h-8 w-24 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
