'use client';

import { CheckCircle2, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface CompletenessItem {
  label: string;
  completed: boolean;
}

interface CompletenessIndicatorProps {
  eventCount: number;
  hasReport: boolean;
  hasTribunale: boolean;
  hasQuesiti: boolean;
  hasEsameObiettivo: boolean;
  hasParti: boolean;
}

export function CompletenessIndicator({
  eventCount,
  hasReport,
  hasTribunale,
  hasQuesiti,
  hasEsameObiettivo,
  hasParti,
}: CompletenessIndicatorProps) {
  const items: CompletenessItem[] = [
    { label: 'Eventi estratti', completed: eventCount > 0 },
    { label: 'Report generato', completed: hasReport },
    { label: 'Tribunale/RG', completed: hasTribunale },
    { label: 'Quesiti', completed: hasQuesiti },
    { label: 'Esame obiettivo', completed: hasEsameObiettivo },
    { label: 'Parti', completed: hasParti },
  ];

  const completedCount = items.filter((i) => i.completed).length;
  const total = items.length;
  const percentage = Math.round((completedCount / total) * 100);

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Completezza perizia</span>
        <Badge variant={completedCount === total ? 'success' : 'secondary'}>
          {completedCount}/{total}
        </Badge>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-1.5 text-xs">
            {item.completed ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className={item.completed ? 'text-foreground' : 'text-muted-foreground'}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
