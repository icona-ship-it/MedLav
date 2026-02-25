import Link from 'next/link';
import { Scale, FileText, Clock, Shield, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: FileText,
    title: 'OCR Intelligente',
    description:
      'Carica documentazione clinica in qualsiasi formato. Il sistema estrae automaticamente il testo con riconoscimento ottico avanzato.',
  },
  {
    icon: Clock,
    title: 'Cronistoria Automatica',
    description:
      'Genera una cronistoria medico-legale strutturata in ordine cronologico, pronta per le tue relazioni peritali.',
  },
  {
    icon: Shield,
    title: 'Sicurezza GDPR',
    description:
      'Dati sanitari protetti con crittografia e infrastruttura interamente in Europa. Conforme al GDPR Art. 9.',
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">MedLav</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Accedi</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Registrati</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Cronistoria medico-legale
          <span className="text-primary"> in pochi minuti</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Carica la documentazione clinica del tuo caso. MedLav genera
          automaticamente una cronistoria strutturata, pronta per le tue
          relazioni peritali CTU, CTP e stragiudiziali.
        </p>
        <div className="mt-8 flex gap-4">
          <Button size="lg" asChild>
            <Link href="/register">
              Inizia ora
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/login">Accedi</Link>
          </Button>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center text-2xl font-bold">
            Come funziona
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border bg-background p-6"
              >
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="mb-2 font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <span>MedLav</span>
          </div>
          <span>Dati protetti in Europa</span>
        </div>
      </footer>
    </div>
  );
}
