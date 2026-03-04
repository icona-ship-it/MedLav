'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { requestPasswordReset } from '../actions';

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await requestPasswordReset(formData);

    if (result?.error) {
      setError(result.error);
    } else if (result?.success) {
      setSuccess(true);
    }
    setIsLoading(false);
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/50 px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-green-100">
              <Scale className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Email inviata</CardTitle>
            <CardDescription>
              Se l&apos;indirizzo email è associato a un account, riceverai un link per reimpostare la password.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground mb-4">
              Controlla anche la cartella spam.
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
          <CardTitle className="text-2xl">Password dimenticata</CardTitle>
          <CardDescription>
            Inserisci la tua email per ricevere il link di reset
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
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Invio in corso...' : 'Invia link di reset'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            Ricordi la password?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Accedi
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
