import Link from 'next/link';
import { Scale, ArrowLeft, Shield, Lock, Server, Eye, Database, FileCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sicurezza e Compliance',
};

const securityFeatures = [
  {
    icon: Server,
    title: 'Solo EU',
    description: 'Tutti i dati sono conservati esclusivamente nell\'Unione Europea. Database a Francoforte, AI a Parigi, hosting a Francoforte. Nessun trasferimento extra-UE.',
  },
  {
    icon: Lock,
    title: 'Crittografia',
    description: 'Crittografia in transito con TLS 1.3 e a riposo con AES-256. Le connessioni al database utilizzano SSL. I file caricati sono crittografati nello storage.',
  },
  {
    icon: Eye,
    title: 'Isolamento Dati',
    description: 'Row Level Security (RLS) su PostgreSQL garantisce che ogni utente acceda solo ai propri dati. Nessun utente può vedere i casi di un altro utente.',
  },
  {
    icon: Database,
    title: 'Backup e Ripristino',
    description: 'Backup giornalieri automatici con Point-in-Time Recovery (PITR). I dati possono essere ripristinati a qualsiasi punto nelle ultime 24 ore.',
  },
  {
    icon: Shield,
    title: 'Autenticazione Sicura',
    description: 'Autenticazione via email con verifica, password hashing sicuro, sessioni con scadenza automatica. Rate limiting su tutti gli endpoint di autenticazione.',
  },
  {
    icon: FileCheck,
    title: 'Audit Trail',
    description: 'Ogni azione rilevante è registrata in un log di audit immutabile. Elaborazioni, accessi, modifiche: tutto è tracciato per trasparenza e accountability.',
  },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
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

      <main className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="mb-4 text-3xl font-bold">Sicurezza e Compliance</h1>
        <p className="mb-12 text-lg text-muted-foreground">
          MedLav tratta dati sanitari sensibili. La sicurezza non è una feature, è il fondamento.
        </p>

        <div className="grid gap-6 sm:grid-cols-2">
          {securityFeatures.map((feature) => (
            <div key={feature.title} className="rounded-xl border p-6">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 space-y-8">
          <section>
            <h2 className="mb-4 text-2xl font-bold">Conformità GDPR</h2>
            <div className="rounded-xl border p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="font-semibold">Art. 9 — Dati Sanitari</h3>
                  <p className="text-sm text-muted-foreground">Trattamento di categorie particolari con misure di sicurezza adeguate.</p>
                </div>
                <div>
                  <h3 className="font-semibold">Art. 28 — Responsabile del Trattamento</h3>
                  <p className="text-sm text-muted-foreground">DPA (Data Processing Agreement) disponibile su richiesta.</p>
                </div>
                <div>
                  <h3 className="font-semibold">Art. 32 — Misure di Sicurezza</h3>
                  <p className="text-sm text-muted-foreground">Crittografia, pseudonimizzazione, isolamento, backup, audit.</p>
                </div>
                <div>
                  <h3 className="font-semibold">Art. 35 — DPIA</h3>
                  <p className="text-sm text-muted-foreground">Data Protection Impact Assessment effettuata per il trattamento AI.</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold">Utilizzo dell&apos;AI</h2>
            <div className="rounded-xl border p-6 space-y-3">
              <p className="text-sm text-muted-foreground">
                I documenti caricati sono elaborati da Mistral AI (Parigi, Francia) per l&apos;analisi OCR
                e la generazione di report. I dati sono trasmessi in modo sicuro via TLS e vengono
                elaborati in tempo reale senza conservazione permanente sui server di Mistral.
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>I dati degli utenti non vengono mai utilizzati per l&apos;addestramento di modelli AI.</strong>
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold">Roadmap Sicurezza</h2>
            <div className="rounded-xl border p-6">
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-green-500/20 text-center text-xs text-green-600">&#10003;</span>
                  Crittografia TLS 1.3 + AES-256
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-green-500/20 text-center text-xs text-green-600">&#10003;</span>
                  Row Level Security (RLS) su tutti i dati
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-green-500/20 text-center text-xs text-green-600">&#10003;</span>
                  Audit trail completo
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-yellow-500/20 text-center text-xs text-yellow-600">&#9679;</span>
                  Certificazione ISO 27001 (in corso)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-yellow-500/20 text-center text-xs text-yellow-600">&#9679;</span>
                  Penetration testing indipendente (pianificato)
                </li>
              </ul>
            </div>
          </section>
        </div>

        <div className="mt-12 rounded-xl border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Domande sulla sicurezza? Contattaci: <strong>security@medlav.it</strong>
          </p>
        </div>
      </main>
    </div>
  );
}
