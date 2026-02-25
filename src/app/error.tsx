'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-bold">Si è verificato un errore</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        Qualcosa non ha funzionato. Riprova o torna alla dashboard.
      </p>
      <div className="mt-8 flex gap-4">
        <Button onClick={reset}>Riprova</Button>
        <Button variant="outline" asChild>
          <Link href="/">Torna alla dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
