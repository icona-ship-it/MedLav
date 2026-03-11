import Link from 'next/link';
import { Scale, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termini di Servizio',
};

export default function TermsPage() {
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
        <h1 className="mb-8 text-3xl font-bold">Termini di Servizio</h1>
        <p className="mb-6 text-sm text-muted-foreground">Ultimo aggiornamento: Marzo 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold">1. Oggetto del Servizio</h2>
            <p>
              MedLav (di seguito &quot;il Servizio&quot;) è una piattaforma SaaS che consente ai professionisti
              medico-legali di caricare documentazione clinica e ottenere report medico-legali strutturati
              generati tramite intelligenza artificiale. Il Servizio è erogato da MedLav S.r.l. (di seguito
              &quot;il Fornitore&quot;), con sede legale in Italia.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Accettazione dei Termini</h2>
            <p>
              Registrandosi e utilizzando il Servizio, l&apos;Utente accetta integralmente i presenti Termini
              di Servizio. L&apos;utilizzo del Servizio è subordinato all&apos;accettazione anche della nostra{' '}
              <Link href="/privacy" className="text-primary underline">Privacy Policy</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Requisiti per l&apos;Utilizzo</h2>
            <p>
              Il Servizio è destinato esclusivamente a professionisti del settore medico-legale
              (medici legali, CTU, CTP, periti). L&apos;Utente dichiara di:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Essere un professionista abilitato nel settore medico-legale</li>
              <li>Avere titolo legale per trattare la documentazione clinica caricata</li>
              <li>Aver ottenuto tutti i consensi necessari per il trattamento dei dati sanitari</li>
              <li>Utilizzare il Servizio nel rispetto della normativa vigente (GDPR, Codice Deontologico)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Dati Sanitari e Responsabilità</h2>
            <p>
              I documenti caricati possono contenere dati sanitari ai sensi dell&apos;Art. 9 del GDPR
              (categorie particolari di dati personali). L&apos;Utente è e rimane il Titolare del
              trattamento di tali dati. Il Fornitore opera come Responsabile del trattamento ai sensi
              dell&apos;Art. 28 del GDPR.
            </p>
            <p>
              L&apos;Utente è responsabile di:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Verificare l&apos;accuratezza e la completezza dei report generati</li>
              <li>Non utilizzare i report come unica fonte per decisioni cliniche o legali</li>
              <li>Custodire le proprie credenziali di accesso</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Report Generati dall&apos;AI</h2>
            <p>
              I report generati dal Servizio sono strumenti di supporto e <strong>non
              sostituiscono</strong> il giudizio professionale del medico legale. Il Servizio utilizza
              modelli di intelligenza artificiale che possono contenere errori, omissioni o
              imprecisioni. L&apos;Utente è tenuto a verificare e validare ogni report prima
              dell&apos;utilizzo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Piani e Pagamenti</h2>
            <p>
              Il Servizio offre diversi piani di abbonamento. I dettagli aggiornati sono disponibili
              alla pagina{' '}
              <Link href="/pricing" className="text-primary underline">Prezzi</Link>. I pagamenti
              sono gestiti tramite Stripe e sono soggetti alle condizioni di Stripe Inc.
              Il rinnovo è automatico salvo disdetta. Le richieste di rimborso sono valutate caso
              per caso entro 14 giorni dall&apos;acquisto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Proprietà Intellettuale</h2>
            <p>
              L&apos;Utente mantiene la piena proprietà dei documenti caricati e dei report generati.
              Il Fornitore non acquisisce alcun diritto sui contenuti dell&apos;Utente. Il Fornitore
              non utilizza i documenti caricati per addestrare modelli di AI.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Limitazione di Responsabilità</h2>
            <p>
              Il Fornitore non è responsabile per danni diretti, indiretti, incidentali o consequenziali
              derivanti dall&apos;utilizzo del Servizio o dall&apos;affidamento sui report generati.
              La responsabilità massima del Fornitore è limitata all&apos;importo pagato dall&apos;Utente
              nei 12 mesi precedenti.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Sospensione e Risoluzione</h2>
            <p>
              Il Fornitore si riserva il diritto di sospendere o risolvere l&apos;account in caso
              di violazione dei presenti Termini, uso improprio del Servizio, o mancato pagamento.
              L&apos;Utente può chiudere il proprio account in qualsiasi momento dalle impostazioni.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Legge Applicabile</h2>
            <p>
              I presenti Termini sono regolati dalla legge italiana. Per ogni controversia sarà
              competente il Foro di Milano.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">11. Contatti</h2>
            <p>
              Per domande sui presenti Termini: <strong>legal@medlav.it</strong>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
