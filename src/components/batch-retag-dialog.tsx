'use client';

import { useState, useTransition } from 'react';
import { Loader2, Tags } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { batchUpdateEventTypes } from '@/app/(dashboard)/actions';
import { EVENT_TYPES } from '@/lib/constants';

interface EventSummary {
  id: string;
  title: string;
  event_type: string;
}

export function BatchRetagDialog({
  caseId, events, onSaved,
}: {
  caseId: string;
  events: EventSummary[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  const nonAltroTypes = EVENT_TYPES.filter((t) => t.value !== 'altro');

  const handleSave = () => {
    const updates = Object.entries(assignments)
      .filter(([, newType]) => newType && newType !== 'altro')
      .map(([eventId, newType]) => ({ eventId, newType }));

    if (updates.length === 0) {
      toast.error('Seleziona almeno un nuovo tipo');
      return;
    }

    startTransition(async () => {
      const result = await batchUpdateEventTypes({ caseId, updates });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${updates.length} eventi riclassificati`);
      setOpen(false);
      setAssignments({});
      onSaved();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tags className="mr-1 h-3 w-3" />Ri-classifica eventi
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ri-classifica eventi &quot;Altro&quot;</DialogTitle>
          <DialogDescription>
            {events.length} eventi sono classificati come &quot;Altro&quot;. Seleziona un nuovo tipo per ciascuno.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-3 rounded-md border p-2">
              <p className="flex-1 text-sm truncate">{event.title}</p>
              <Select
                value={assignments[event.id] ?? ''}
                onValueChange={(v) => setAssignments({ ...assignments, [event.id]: v })}
              >
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {nonAltroTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Tags className="mr-1 h-4 w-4" />}
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
