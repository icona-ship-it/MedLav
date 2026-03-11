import Link from 'next/link';
import { Scale, ArrowLeft, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Prezzi',
};

const plans = [
  {
    name: 'Trial',
    price: 'Gratis',
    period: '',
    description: 'Prova MedLav senza impegno',
    features: [
      '5 casi inclusi',
      'Pipeline OCR completa',
      'Report medico-legale strutturato',
      'Export DOCX, CSV, HTML',
      'Rilevamento anomalie',
    ],
    cta: 'Inizia gratis',
    ctaHref: '/register',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '49',
    period: '/mese',
    description: 'Per il professionista medico-legale',
    features: [
      'Casi illimitati',
      'Tutto del Trial, più:',
      'RAG linee guida cliniche',
      'Rigenerazione sezioni report',
      'Calcoli medico-legali (ITT/ITP)',
      'Export PCT per tribunale',
      'Anonimizzazione report',
      'Notifiche email',
      'Supporto prioritario',
    ],
    cta: 'Inizia con Pro',
    ctaHref: '/register',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'Per studi e organizzazioni',
    features: [
      'Tutto del Pro, più:',
      'Utenti multipli',
      'SSO (Single Sign-On)',
      'SLA garantito',
      'Onboarding dedicato',
      'API access',
      'DPA personalizzato',
    ],
    cta: 'Contattaci',
    ctaHref: 'mailto:sales@medlav.it',
    highlighted: false,
  },
];

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

        <div className="grid gap-8 md:grid-cols-3">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative flex flex-col ${
                plan.highlighted ? 'border-primary shadow-lg' : ''
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                  Più popolare
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  {plan.price === 'Gratis' || plan.price === 'Custom' ? (
                    <span className="text-4xl font-bold">{plan.price}</span>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">&euro;{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col">
                <ul className="flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-8 w-full"
                  variant={plan.highlighted ? 'default' : 'outline'}
                  asChild
                >
                  <Link href={plan.ctaHref}>{plan.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-muted-foreground">
            Tutti i piani includono: dati protetti in EU, GDPR Art. 9, crittografia, audit trail.
            <br />
            Hai domande? <a href="mailto:info@medlav.it" className="text-primary underline">Scrivici</a>
          </p>
        </div>
      </main>
    </div>
  );
}
