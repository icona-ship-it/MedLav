'use client';

import { useState, useTransition } from 'react';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { updateCase } from '../../actions';
import { CASE_TYPES } from '@/lib/constants';
import type { CaseData } from './types';
import type { CaseType, CaseRole } from '@/types';

const CASE_ROLES_SHORT = [
  { value: 'ctu', label: 'CTU' },
  { value: 'ctp', label: 'CTP' },
  { value: 'stragiudiziale', label: 'Stragiudiziale' },
];

function EditCaseDialogInner({
  caseData, onOpenChange, onSaved,
}: {
  caseData: CaseData;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    caseType: caseData.case_type,
    caseRole: caseData.case_role,
    patientInitials: caseData.patient_initials ?? '',
    practiceReference: caseData.practice_reference ?? '',
    notes: caseData.notes ?? '',
  });

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await updateCase({
        caseId: caseData.id,
        caseType: form.caseType as CaseType,
        caseRole: form.caseRole as CaseRole,
        patientInitials: form.patientInitials || null,
        practiceReference: form.practiceReference || null,
        notes: form.notes || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onSaved();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifica Caso {caseData.code}</DialogTitle>
        <DialogDescription>Modifica le informazioni del caso.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Tipologia caso</Label>
            <Select value={form.caseType} onValueChange={(v) => setForm({ ...form, caseType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Tipo incarico</Label>
            <Select value={form.caseRole} onValueChange={(v) => setForm({ ...form, caseRole: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CASE_ROLES_SHORT.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Iniziali paziente</Label>
            <Input
              value={form.patientInitials}
              onChange={(e) => setForm({ ...form, patientInitials: e.target.value })}
              maxLength={10}
              placeholder="es. M.R."
            />
          </div>
          <div>
            <Label>Riferimento pratica</Label>
            <Input
              value={form.practiceReference}
              onChange={(e) => setForm({ ...form, practiceReference: e.target.value })}
              placeholder="es. RG 1234/2024"
            />
          </div>
        </div>
        <div>
          <Label>Note</Label>
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Note aggiuntive sul caso..."
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Salva
        </Button>
      </DialogFooter>
    </>
  );
}

export function EditCaseDialog({
  caseData, open, onOpenChange, onSaved,
}: {
  caseData: CaseData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <EditCaseDialogInner
            caseData={caseData}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
