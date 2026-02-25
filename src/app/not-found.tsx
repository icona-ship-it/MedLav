import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      <h1 className="text-4xl font-bold">Pagina non trovata</h1>
      <p className="mt-4 text-lg text-muted-foreground">
        La pagina che stai cercando non esiste o è stata spostata.
      </p>
      <div className="mt-8">
        <Button asChild>
          <Link href="/">Torna alla dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
