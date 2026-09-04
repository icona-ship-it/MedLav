'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { csrfHeaders } from '@/lib/csrf-client';

interface DemoResponse {
  success: boolean;
  data?: { caseId: string; code: string; existed: boolean };
  error?: string;
}

/**
 * Apre (o crea) il caso dimostrativo: cronistoria già completa su documenti
 * fittizi, senza pipeline né crediti. Idempotente lato server.
 */
export function DemoCaseButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/demo', { method: 'POST', headers: csrfHeaders() });
      const body = (await res.json()) as DemoResponse;
      if (!res.ok || !body.success || !body.data) {
        setError(body.error ?? 'Non è stato possibile aprire il caso dimostrativo. Riprova.');
        return;
      }
      router.push(`/cases/${body.data.caseId}`);
    } catch {
      setError('Non è stato possibile aprire il caso dimostrativo. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" size="sm" onClick={openDemo} disabled={loading} data-testid="demo-case-button">
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FlaskConical className="mr-2 h-4 w-4" />}
        Apri il caso dimostrativo
      </Button>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    </div>
  );
}
