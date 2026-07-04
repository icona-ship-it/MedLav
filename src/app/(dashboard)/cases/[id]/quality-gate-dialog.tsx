'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  ATTESTATION_DECLARATION,
  type RequiredAttestationSection,
} from '@/lib/attestation-shared';

// --- Types ---

interface QualityGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anomalyCount: number;
  missingDocsCount: number;
  /** Sezioni ad alto rischio presenti nel report — ognuna richiede spunta esplicita. */
  requiredSections: RequiredAttestationSection[];
  /** Riceve gli id canonici delle sezioni confermate (per l'attestazione server). */
  onConfirm: (confirmedSectionIds: string[]) => void;
}

// --- Component ---

export function QualityGateDialog({
  open,
  onOpenChange,
  anomalyCount,
  missingDocsCount,
  requiredSections,
  onConfirm,
}: QualityGateDialogProps) {
  const [checks, setChecks] = useState({
    anomaliesReviewed: false,
    missingDocsNoted: false,
    declaration: false,
  });
  const [sectionChecks, setSectionChecks] = useState<Record<string, boolean>>({});

  const allSectionsChecked = requiredSections.every((s) => sectionChecks[s.canonicalId]);
  const allChecked = checks.declaration
    && allSectionsChecked
    && (anomalyCount === 0 || checks.anomaliesReviewed)
    && (missingDocsCount === 0 || checks.missingDocsNoted);

  const handleToggle = (key: keyof typeof checks) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSectionToggle = (canonicalId: string) => {
    setSectionChecks((prev) => ({ ...prev, [canonicalId]: !prev[canonicalId] }));
  };

  const handleConfirm = () => {
    onConfirm(requiredSections.map((s) => s.canonicalId));
    onOpenChange(false);
    // Reset for next use
    setChecks({ anomaliesReviewed: false, missingDocsNoted: false, declaration: false });
    setSectionChecks({});
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
          Prima di approvare il report come definitivo, conferma la revisione delle
          sezioni a maggior rischio e degli avvisi:
        </p>

        <div className="space-y-3 py-2">
          {requiredSections.map((section) => (
            <label key={section.canonicalId} className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(sectionChecks[section.canonicalId])}
                onChange={() => handleSectionToggle(section.canonicalId)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">
                Ho verificato la sezione <strong>{section.title}</strong> (citazioni, date, importi)
              </span>
            </label>
          ))}

          {anomalyCount > 0 && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checks.anomaliesReviewed}
                onChange={() => handleToggle('anomaliesReviewed')}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">
                Ho verificato gli avvisi segnalati ({anomalyCount})
              </span>
            </label>
          )}

          {missingDocsCount > 0 && (
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={checks.missingDocsNoted}
                onChange={() => handleToggle('missingDocsNoted')}
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span className="text-sm">
                Ho verificato la documentazione mancante ({missingDocsCount})
              </span>
            </label>
          )}

          <label className="flex items-start gap-3 cursor-pointer border-t pt-3">
            <input
              type="checkbox"
              checked={checks.declaration}
              onChange={() => handleToggle('declaration')}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <span className="text-sm font-medium">{ATTESTATION_DECLARATION}</span>
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
