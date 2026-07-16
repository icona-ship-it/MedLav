'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Scale, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { signIn, verifyMfa, signOut } from '../actions';

function MfaChallengeForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await verifyMfa(formData);

    // If we get here, redirect didn't happen — there's an error
    if (result?.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="code" className="text-sm font-medium">
            Codice a 6 cifre
          </label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={7}
            required
            autoFocus
            className="text-center font-mono text-lg tracking-widest"
          />
          <p className="text-xs text-muted-foreground">
            Apri la tua app di autenticazione (es. Google Authenticator) e inserisci il codice mostrato per LegMed
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Verifica in corso...' : 'Verifica e accedi'}
        </Button>
      </form>
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => signOut()}
          className="text-sm text-muted-foreground hover:text-primary hover:underline"
        >
          Annulla l&apos;accesso
        </button>
      </div>
    </>
  );
}

function CredentialsForm({ onMfaRequired }: { onMfaRequired: () => void }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await signIn(formData);

    // If we get here, redirect didn't happen — MFA step or error
    if (result?.mfaRequired) {
      onMfaRequired();
    } else if (result?.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="medico@studio.it"
            required
            autoComplete="email"
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? 'Accesso in corso...' : 'Accedi'}
        </Button>
      </form>
      <div className="mt-3 text-center">
        <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary hover:underline">
          Password dimenticata?
        </Link>
      </div>
      <div className="mt-2 text-center text-sm text-muted-foreground">
        Non hai un account?{' '}
        <Link href="/register" className="text-primary hover:underline">
          Registrati
        </Link>
      </div>
    </>
  );
}

function LoginPageInner() {
  // ?mfa=1 — set by the middleware when an aal1 session needs the TOTP step
  const searchParams = useSearchParams();
  const [step, setStep] = useState<'credentials' | 'mfa'>(
    searchParams.get('mfa') === '1' ? 'mfa' : 'credentials',
  );

  const isMfaStep = step === 'mfa';
  // Default-deny: fixed message only for the known error code, never reflect
  // the query param value (set by /auth/callback on failed code exchange).
  const callbackFailed = searchParams.get('error') === 'auth_callback_failed';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            {isMfaStep ? (
              <ShieldCheck className="h-6 w-6 text-primary" />
            ) : (
              <Scale className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl">{isMfaStep ? 'Verifica in due passaggi' : 'Accedi'}</CardTitle>
          <CardDescription>
            {isMfaStep
              ? 'Inserisci il codice del tuo autenticatore'
              : 'Entra nel tuo studio LegMed'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {callbackFailed && !isMfaStep && (
            <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
              Il link che hai usato non è più valido o è già stato utilizzato.
              Se hai già confermato l&apos;email, accedi qui sotto con le tue credenziali;
              se non riesci ad accedere, usa &quot;Password dimenticata&quot; per ricevere un nuovo link.
            </div>
          )}
          {isMfaStep ? (
            <MfaChallengeForm />
          ) : (
            <CredentialsForm onMfaRequired={() => setStep('mfa')} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
