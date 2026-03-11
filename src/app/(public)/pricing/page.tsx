import Link from 'next/link';
import { Scale, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PricingContent } from './pricing-content';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prezzi',
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/landing" className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">MedLav</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/landing">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alla home
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="mb-16 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Prezzi semplici e trasparenti</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Inizia gratis, scala quando serve. Nessun costo nascosto.
          </p>
        </div>

        <PricingContent />
      </main>
    </div>
  );
}
