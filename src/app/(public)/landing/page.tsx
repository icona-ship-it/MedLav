import Link from 'next/link';
import {
  Scale, FileText, Clock, Shield, ArrowRight,
  Upload, Cpu, FileCheck, AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const steps = [
  {
    number: 1,
    icon: Upload,
    title: 'Carica i documenti',
    description: 'Trascina cartelle cliniche, referti, esami. PDF, immagini, scansioni: il sistema accetta tutto.',
  },
  {
    number: 2,
    icon: Cpu,
    title: 'L\'AI analizza',
    description: 'Il sistema legge i documenti, identifica eventi clinici, date, diagnosi e li mette in ordine cronologico.',
  },
  {
    number: 3,
    icon: FileCheck,
    title: 'Il report è pronto',
    description: 'Cronistoria strutturata, anomalie evidenziate, documenti mancanti segnalati. Esporta in DOCX, CSV o HTML.',
  },
];

const features = [
  {
    icon: Clock,
    title: 'Cronistoria Automatica',
    description: 'Tutti gli eventi clinici ordinati per data, con fonte e livello di affidabilità. Pronta per la perizia.',
  },
  {
    icon: FileText,
    title: 'Lettura Intelligente',
    description: 'Legge anche documenti scritti a mano, timbri e scansioni di bassa qualità. Nessun dato viene perso.',
  },
  {
    icon: AlertTriangle,
    title: 'Anomalie e Lacune',
    description: 'Rileva ritardi diagnostici, gap documentali e incongruenze. Segnala i documenti mancanti.',
  },
  {
    icon: Shield,
    title: 'Sicuro e Conforme',
    description: 'Tutti i dati restano in Europa. Crittografia, accesso protetto. Conforme GDPR Art. 9.',
  },
];

const stats = [
  { value: 'Minuti', label: 'invece di ore per ogni caso' },
  { value: '100%', label: 'dati protetti in Europa' },
  { value: 'Tutti i formati', label: 'PDF, immagini, scansioni' },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">MedLav</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/login">Accedi</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Prova gratis</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-24 sm:py-32">
        {/* Background grid pattern */}
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-background via-background/80 to-background" />

        <div className="mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            {/* Left: copy */}
            <div className="animate-fade-in">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-sm font-medium text-muted-foreground">
                <Shield className="h-3.5 w-3.5" />
                Dati sanitari protetti in Europa
              </div>
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                Trasformiamo i tuoi documenti clinici in{' '}
                <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                  cronistorie pronte per la perizia
                </span>
              </h1>
              <p className="mt-6 max-w-lg text-xl text-muted-foreground leading-relaxed">
                Carica le cartelle cliniche del tuo caso. MedLav le analizza e genera
                una cronistoria strutturata per le tue relazioni peritali.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button size="lg" asChild className="text-base px-8 py-6">
                  <Link href="/register">
                    Prova gratis
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-base px-8 py-6">
                  <Link href="/login">Ho già un account</Link>
                </Button>
              </div>
            </div>

            {/* Right: visual mockup */}
            <div className="animate-fade-in-up hidden lg:block">
              <div className="rounded-xl border bg-card p-6 shadow-lg">
                <div className="mb-4 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-red-400" />
                  <div className="h-3 w-3 rounded-full bg-yellow-400" />
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                  <span className="ml-2 text-xs text-muted-foreground">MedLav - Caso #2024-0042</span>
                </div>
                {/* Mock document → cronistoria */}
                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Input side */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Documenti caricati</p>
                    <div className="space-y-1.5">
                      {['Cartella_clinica.pdf', 'RMN_referto.pdf', 'Esami_sangue.jpg'].map((name) => (
                        <div key={name} className="flex items-center gap-2 rounded border bg-muted/50 px-2 py-1.5 text-xs">
                          <FileText className="h-3 w-3 text-primary" />
                          <span className="truncate">{name}</span>
                          <span className="ml-auto text-green-500">&#10003;</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Output side */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cronistoria generata</p>
                    <div className="space-y-1.5">
                      {[
                        { date: '15/03/2024', text: 'Ricovero ospedaliero' },
                        { date: '16/03/2024', text: 'Intervento chirurgico' },
                        { date: '22/03/2024', text: 'Dimissione + follow-up' },
                      ].map((ev) => (
                        <div key={ev.date} className="flex items-start gap-2 rounded border bg-muted/50 px-2 py-1.5 text-xs">
                          <span className="shrink-0 font-mono text-primary">{ev.date}</span>
                          <span>{ev.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded bg-yellow-500/10 px-2 py-1.5 text-xs text-yellow-700 dark:text-yellow-400">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span>1 anomalia rilevata: gap documentale post-operatorio</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Come funziona */}
      <section className="border-t bg-muted/30 px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Come funziona</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Tre semplici passaggi per trasformare la documentazione clinica in una cronistoria strutturata.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className="animate-fade-in-up relative rounded-xl border bg-background p-8 text-center transition-shadow hover:shadow-md"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <step.icon className="h-8 w-8 text-primary" />
                </div>
                <div className="absolute -top-3 left-6 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {step.number}
                </div>
                <h3 className="mb-3 text-lg font-semibold">{step.title}</h3>
                <p className="text-base text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pensato per il medico legale
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Strumenti che fanno risparmiare tempo e riducono gli errori.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="animate-fade-in-up group rounded-xl border p-8 transition-all hover:border-primary/30 hover:shadow-sm"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-base text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social proof / Stats */}
      <section className="border-t bg-muted/30 px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Risparmia tempo, riduci errori
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Un caso che richiede ore di lavoro manuale viene elaborato in pochi minuti.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-5xl font-bold text-primary">{stat.value}</p>
                <p className="mt-2 text-base text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA finale */}
      <section className="px-6 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Pronto a velocizzare il tuo lavoro?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Registrati e carica il tuo primo caso. Nessuna carta di credito richiesta.
          </p>
          <div className="mt-8">
            <Button size="lg" asChild className="text-base px-8 py-6">
              <Link href="/register">
                Prova gratis
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/20 px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            <span className="font-medium">MedLav</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs">
            <Link href="/terms" className="hover:text-foreground transition-colors">Termini di Servizio</Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link href="/security" className="hover:text-foreground transition-colors">Sicurezza</Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">Prezzi</Link>
            <Link href="/help" className="hover:text-foreground transition-colors">Aiuto</Link>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              Conforme GDPR Art. 9
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
