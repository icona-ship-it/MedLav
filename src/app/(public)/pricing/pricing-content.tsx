'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PLANS } from '@/lib/stripe/config';

interface PlanDisplay {
  name: string;
  price: string;
  originalPrice?: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaHref: string;
  highlighted: boolean;
}

function getPlans(isYearly: boolean): PlanDisplay[] {
  const proPrice = isYearly
    ? String(PLANS.pro.yearlyMonthlyEquivalent)
    : String(PLANS.pro.monthlyPrice);
  const originalMonthlyPrice = isYearly
    ? String(PLANS.pro.monthlyPrice)
    : undefined;

  return [
    {
      name: 'Trial',
      price: 'Gratis',
      period: '',
      description: 'Prova LegMed senza impegno',
      features: [
        '30 crediti inclusi (~1 caso medio)',
        'Lettura automatica dei documenti (anche scansioni e manoscritti)',
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
      price: proPrice,
      originalPrice: originalMonthlyPrice,
      period: '/mese',
      description: 'Per il professionista medico-legale',
      features: [
        '900 crediti/mese (~25 casi medi)',
        'Tutto del Trial, più:',
        'Categorizzazione AI documenti',
        'Rigenerazione sezioni report',
        'Confronto automatico con le linee guida cliniche pertinenti',
        'Calcoli medico-legali (ITT/ITP)',
        'Anonimizzazione report',
        'Notifiche email',
        'Pacchetti crediti extra acquistabili',
        'Supporto prioritario',
      ],
      cta: 'Inizia con Pro',
      ctaHref: '/register?plan=pro',
      highlighted: true,
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '',
      description: 'Per studi e organizzazioni',
      features: [
        'Tutto del Pro, più:',
        'Crediti personalizzati',
        'Utenti multipli',
        'SSO (Single Sign-On)',
        'SLA garantito',
        'Onboarding dedicato',
        'API access',
        'DPA personalizzato',
      ],
      cta: 'Contattaci',
      ctaHref: 'mailto:sales@legmed.it',
      highlighted: false,
    },
  ];
}

const faqItems: Array<{ question: string; answer: string }> = [
  {
    question: 'Posso provare LegMed prima di pagare?',
    answer: 'Sì, il piano Trial è completamente gratuito e include 30 crediti per provare un\'elaborazione completa. Non serve carta di credito per iniziare.',
  },
  {
    question: 'Come funzionano i crediti?',
    answer: 'Ogni operazione AI ha un costo fisso in crediti: analisi completa (30), solo estrazione (15), analisi spese (10), rigenerazione sezione (5). La categorizzazione AI dei documenti è gratuita. Il piano Pro include 900 crediti/mese. Puoi acquistare crediti extra quando vuoi.',
  },
  {
    question: 'Cosa succede se finisco i crediti mensili?',
    answer: 'Puoi acquistare pacchetti extra (100 crediti a €9, 300 a €24, 1000 a €69). I crediti acquistati non scadono. I crediti mensili del piano Pro si resettano ad ogni ciclo di fatturazione.',
  },
  {
    question: 'Cosa succede se cancello l\'abbonamento?',
    answer: 'Puoi continuare ad usare LegMed con i crediti acquistati rimasti. I crediti mensili vengono revocati alla cancellazione, ma i crediti acquistati extra restano disponibili.',
  },
  {
    question: 'I prezzi includono l\'IVA?',
    answer: 'No, i prezzi mostrati sono IVA esclusa. L\'IVA viene calcolata e aggiunta al momento del pagamento in base alla tua localizzazione fiscale.',
  },
  {
    question: 'I miei dati sono al sicuro?',
    answer: 'Tutti i dati sono archiviati in server EU (Francoforte), protetti da crittografia, con audit trail completo. Siamo conformi al GDPR Art. 9 per il trattamento di dati sanitari.',
  },
  {
    question: 'Come posso ottenere un piano Enterprise?',
    answer: 'Contattaci all\'indirizzo sales@legmed.it per discutere le tue esigenze. Offriamo piani personalizzati con SLA, onboarding dedicato e funzionalità avanzate.',
  },
];

export function PricingContent() {
  const [isYearly, setIsYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const plans = getPlans(isYearly);

  function toggleFaq(index: number) {
    setOpenFaq((prev) => (prev === index ? null : index));
  }

  return (
    <>
      {/* Billing toggle */}
      <div className="mb-12 flex items-center justify-center gap-3">
        <span
          className={`text-sm font-medium ${!isYearly ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          Mensile
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isYearly}
          aria-label="Passa a fatturazione annuale"
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
            isYearly ? 'bg-primary' : 'bg-muted'
          }`}
          onClick={() => setIsYearly((prev) => !prev)}
        >
          <span
            className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform ${
              isYearly ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
        <span
          className={`text-sm font-medium ${isYearly ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          Annuale
        </span>
        {isYearly && (
          <Badge variant="success" className="ml-1">
            Risparmi il 20%
          </Badge>
        )}
      </div>

      {/* Plan cards */}
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
                  <div>
                    <div className="flex items-baseline gap-1">
                      {plan.originalPrice && (
                        <span className="text-lg text-muted-foreground line-through">
                          &euro;{plan.originalPrice}
                        </span>
                      )}
                      <span className="text-4xl font-bold">&euro;{plan.price}</span>
                      <span className="text-muted-foreground">{plan.period}</span>
                    </div>
                    {isYearly && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        &euro;{PLANS.pro.yearlyPrice}/anno fatturati annualmente
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      IVA esclusa
                    </p>
                  </div>
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

      {/* Footer note */}
      <div className="mt-16 text-center">
        <p className="text-sm text-muted-foreground">
          Tutti i piani includono: dati protetti in EU, GDPR Art. 9, crittografia, audit trail.
          <br />
          Hai domande?{' '}
          <a href="mailto:info@legmed.it" className="text-primary underline">
            Scrivici
          </a>
        </p>
      </div>

      {/* FAQ Section */}
      <div className="mt-20">
        <h2 className="mb-8 text-center text-2xl font-bold tracking-tight">
          Domande frequenti
        </h2>
        <div className="mx-auto max-w-3xl divide-y">
          {faqItems.map((item, index) => (
            <div key={item.question} className="py-4">
              <button
                type="button"
                className="flex w-full items-center justify-between text-left"
                onClick={() => toggleFaq(index)}
                aria-expanded={openFaq === index}
              >
                <span className="text-sm font-medium">{item.question}</span>
                {openFaq === index ? (
                  <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
              {openFaq === index && (
                <p className="mt-3 text-sm text-muted-foreground">
                  {item.answer}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
