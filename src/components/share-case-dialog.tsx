'use client';

import { useState, useCallback, useEffect } from 'react';
import { Share2, Copy, Trash2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';

interface ShareInfo {
  id: string;
  token: string;
  label: string | null;
  expires_at: string;
  view_count: number;
  created_at: string;
  url?: string;
}

interface ShareCaseDialogProps {
  caseId: string;
  hasReport: boolean;
}

export function ShareCaseDialog({ caseId, hasReport }: ShareCaseDialogProps) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [shares, setShares] = useState<ShareInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/share`);
      const result = await response.json() as { success: boolean; data?: ShareInfo[] };
      if (result.success && result.data) {
        setShares(result.data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    if (open) {
      loadShares();
    }
  }, [open, loadShares]);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim() || undefined }),
      });
      const result = await response.json() as { success: boolean; data?: ShareInfo; error?: string };
      if (result.success && result.data) {
        toast.success('Link generato');
        setLabel('');
        // Copy to clipboard
        if (result.data.url) {
          await navigator.clipboard.writeText(result.data.url);
          toast.success('Link copiato negli appunti');
        }
        loadShares();
      } else {
        toast.error(result.error ?? 'Errore');
      }
    } catch {
      toast.error('Errore di rete');
    } finally {
      setIsCreating(false);
    }
  }, [caseId, label, loadShares]);

  const handleRevoke = useCallback(async (token: string) => {
    try {
      const response = await fetch(`/api/cases/${caseId}/share?token=${token}`, {
        method: 'DELETE',
      });
      const result = await response.json() as { success: boolean };
      if (result.success) {
        toast.success('Link revocato');
        loadShares();
      }
    } catch {
      toast.error('Errore revoca');
    }
  }, [caseId, loadShares]);

  const handleCopy = useCallback(async (token: string) => {
    const url = `${window.location.origin}/shared/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success('Link copiato');
    setTimeout(() => setCopiedToken(null), 2000);
  }, []);

  if (!hasReport) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 className="mr-1 h-3 w-3" />Condividi
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Condividi caso</DialogTitle>
        </DialogHeader>

        {/* Create new share */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="share-label">Etichetta (opzionale)</Label>
            <Input
              id="share-label"
              placeholder="Es: Per Avv. Rossi"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
            />
          </div>
          <Button onClick={handleCreate} disabled={isCreating} className="w-full">
            {isCreating ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Generazione...</>
            ) : (
              <>Genera link (scade in 7 giorni)</>
            )}
          </Button>
        </div>

        {/* Active shares */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : shares.length > 0 ? (
          <div className="space-y-2 mt-4">
            <p className="text-sm font-medium">Link attivi</p>
            {shares.map((share) => {
              const isExpired = new Date(share.expires_at) < new Date();
              return (
                <div key={share.id} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${isExpired ? 'opacity-50' : ''}`}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{share.label || 'Senza etichetta'}</p>
                    <p className="text-xs text-muted-foreground">
                      {isExpired ? 'Scaduto' : `Scade: ${new Date(share.expires_at).toLocaleDateString('it-IT')}`}
                      {' · '}{share.view_count} visualizzazioni
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!isExpired && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleCopy(share.token)}
                        title="Copia link"
                      >
                        {copiedToken === share.token ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleRevoke(share.token)}
                      title="Revoca link"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
