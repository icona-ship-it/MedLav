'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

// --- Types ---

interface QualityGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anomalyCount: number;
  missingDocsCount: number;
  onConfirm: () => void;
}

// --- Component ---

export function QualityGateDialog({
  open,
  onOpenChange,
  anomalyCount,
  missingDocsCount,
  onConfirm,
}: QualityGateDialogProps) {
  const [checks, setChecks] = useState({
    anomaliesReviewed: false,
    missingDocsNoted: false,
    reportRead: false,
  });

  const allChecked = checks.anomaliesReviewed && checks.missingDocsNoted && checks.reportRead;

  const handleToggle = (key: keyof typeof checks) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
    // Reset for next use
    setChecks({ anomaliesReviewed: false, missingDocsNoted: false, reportRead: false });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Conferma Approvazione
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Prima di approvare il report come definitivo, verifica di aver controllato tutti i punti:
        </p>

        <div className="space-y-3 py-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checks.reportRead}
              onChange={() => handleToggle('reportRead')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">Ho letto il report completo</span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checks.anomaliesReviewed}
              onChange={() => handleToggle('anomaliesReviewed')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">
              Ho verificato le anomalie segnalate
              {anomalyCount > 0 && (
                <span className="text-muted-foreground"> ({anomalyCount} trovate)</span>
              )}
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={checks.missingDocsNoted}
              onChange={() => handleToggle('missingDocsNoted')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm">
              Ho preso nota della documentazione mancante
              {missingDocsCount > 0 && (
                <span className="text-muted-foreground"> ({missingDocsCount} segnalati)</span>
              )}
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleConfirm} disabled={!allChecked}>
            Conferma Approvazione
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
