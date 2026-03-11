'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { signUp } from '../actions';

export default function RegisterPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [gdprConsent, setGdprConsent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (password !== confirmPassword) {
      setError('Le password non coincidono');
      setIsLoading(false);
      return;
    }

    const result = await signUp(formData);

    if (result?.emailSent) {
      setEmailSent(true);
      setIsLoading(false);
      return;
    }

    // If we get here, redirect didn't happen — there's an error
    if (result?.error) {
      setError(result.error);
    }
    setIsLoading(false);
  }

  if (emailSent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Scale className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Controlla la tua email</CardTitle>
            <CardDescription>
              Ti abbiamo inviato un link di conferma. Clicca sul link nella email per attivare il tuo account.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Non hai ricevuto l&apos;email? Controlla la cartella spam.
            </p>
            <Link href="/login" className="text-primary hover:underline text-sm">
              Torna al login
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Scale className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Registrazione</CardTitle>
          <CardDescription>
            Crea il tuo account MedLav
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="fullName" className="text-sm font-medium">
                Nome Completo
              </label>
              <Input
                id="fullName"
                name="fullName"
                placeholder="Dr. Mario Rossi"
                required
                autoComplete="name"
              />
            </div>
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
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password (minimo 8 caratteri)
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Conferma Password
              </label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <input type="hidden" name="privacyPolicyVersion" value="2026-03-11" />
            <div className="flex items-start space-x-2">
              <Checkbox
                id="gdprConsent"
                name="gdprConsent"
                checked={gdprConsent}
                onCheckedChange={(checked) => setGdprConsent(checked === true)}
                aria-describedby="gdpr-consent-description"
              />
              <label
                htmlFor="gdprConsent"
                id="gdpr-consent-description"
                className="text-sm leading-snug text-muted-foreground cursor-pointer"
              >
                Ho letto e accetto i{' '}
                <Link href="/terms" className="text-primary hover:underline" target="_blank">
                  Termini di Servizio
                </Link>{' '}
                e la{' '}
                <Link href="/privacy" className="text-primary hover:underline" target="_blank">
                  Privacy Policy
                </Link>
                . Acconsento al trattamento dei miei dati sanitari ai sensi
                dell&apos;Art. 9 GDPR.
              </label>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading || !gdprConsent}>
              {isLoading ? 'Registrazione in corso...' : 'Registrati'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Hai già un account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Accedi
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
