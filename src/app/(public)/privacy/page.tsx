import Link from 'next/link';
import { Scale, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <Link href="/landing" className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">LegMed</span>
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
        <h1 className="mb-8 text-3xl font-bold">Privacy Policy</h1>
        <p className="mb-6 text-sm text-muted-foreground">Ultimo aggiornamento: Maggio 2026</p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold">1. Titolare del Trattamento</h2>
            <p>
              Titolare del trattamento: LegMed S.r.l., con sede legale in Italia.
              Contatto DPO: <strong>privacy@legmed.it</strong>
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Categorie di Dati Trattati</h2>
            <h3 className="text-lg font-medium mt-4">2.1 Dati dell&apos;Account</h3>
            <p>Email, nome, preferenze di utilizzo. Base giuridica: esecuzione del contratto (Art. 6.1.b GDPR).</p>

            <h3 className="text-lg font-medium mt-4">2.2 Dati Sanitari (Art. 9 GDPR)</h3>
            <p>
              I documenti caricati possono contenere dati sanitari dei pazienti (referti, diagnosi,
              cartelle cliniche). Questi dati sono trattati come categorie particolari ai sensi
              dell&apos;Art. 9 del GDPR. Base giuridica: consenso esplicito dell&apos;interessato
              e/o necessità per finalità di medicina legale (Art. 9.2.h GDPR).
            </p>

            <h3 className="text-lg font-medium mt-4">2.3 Dati Tecnici</h3>
            <p>Log di accesso, indirizzi IP (anonimizzati), dati di utilizzo aggregati. Base giuridica: legittimo interesse (Art. 6.1.f GDPR).</p>

            <h3 className="text-lg font-medium mt-4">2.4 Dati Audio (Dettatura Vocale)</h3>
            <p>
              Quando l&apos;Utente utilizza la funzione di dettatura vocale, l&apos;audio della
              registrazione (massimo 5 minuti per clip) viene inoltrato a Mistral AI (servizio
              Voxtral) per la trascrizione automatica. <strong>L&apos;audio NON viene conservato</strong>:
              né da LegMed (nessun salvataggio su Storage o database), né da Mistral dopo
              l&apos;elaborazione (zero retention contrattuale).
            </p>
            <p className="mt-2">
              Base giuridica: esecuzione del contratto di servizio (Art. 6.1.b GDPR). Il perito
              è invitato, tramite un avviso al primo utilizzo, a evitare di pronunciare ad alta
              voce identificatori diretti del paziente (nome, codice fiscale). Nel registro
              accessi (audit log) sono conservati esclusivamente metadati tecnici (durata,
              lingua rilevata, costo); il testo trascritto NON viene mai loggato.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Finalità del Trattamento</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Erogazione del Servizio (analisi documenti, generazione report)</li>
              <li>Trascrizione automatica di dettatura vocale del perito (Mistral Voxtral)</li>
              <li>Gestione account e autenticazione</li>
              <li>Fatturazione e gestione abbonamenti</li>
              <li>Miglioramento del Servizio (dati aggregati e anonimizzati)</li>
              <li>Comunicazioni di servizio (notifiche report completati)</li>
              <li>Adempimenti di legge</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Localizzazione dei Dati</h2>
            <p>
              <strong>Tutti i dati sono conservati esclusivamente nell&apos;Unione Europea</strong> (data center
              di Francoforte, Germania). Non effettuiamo trasferimenti di dati verso paesi terzi.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Database:</strong> Supabase EU (Francoforte)</li>
              <li><strong>AI Processing:</strong> Mistral AI (Parigi, Francia — server EU), incluso servizio Voxtral per la dettatura vocale</li>
              <li><strong>Hosting:</strong> Vercel (regione fra1, Francoforte)</li>
              <li><strong>Pagamenti:</strong> Stripe (certificato EU)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Periodo di Conservazione</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Dati account:</strong> per la durata del rapporto contrattuale + 10 anni (obblighi fiscali)</li>
              <li><strong>Documenti clinici:</strong> fino a cancellazione da parte dell&apos;Utente o chiusura account</li>
              <li><strong>Report generati:</strong> fino a cancellazione da parte dell&apos;Utente o chiusura account</li>
              <li><strong>Log tecnici:</strong> 90 giorni, poi cancellati automaticamente</li>
              <li><strong>Dati di fatturazione:</strong> 10 anni (D.P.R. 600/73)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Diritti dell&apos;Interessato</h2>
            <p>Ai sensi degli Artt. 15-22 del GDPR, l&apos;Utente ha diritto di:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Accesso:</strong> ottenere copia dei propri dati personali</li>
              <li><strong>Rettifica:</strong> correggere dati inesatti</li>
              <li><strong>Cancellazione:</strong> richiedere la cancellazione dei dati (&quot;diritto all&apos;oblio&quot;)</li>
              <li><strong>Portabilità:</strong> ricevere i dati in formato strutturato e leggibile</li>
              <li><strong>Opposizione:</strong> opporsi al trattamento per legittimo interesse</li>
              <li><strong>Limitazione:</strong> limitare il trattamento in determinate circostanze</li>
            </ul>
            <p className="mt-4">
              Per esercitare questi diritti: <strong>privacy@legmed.it</strong> oppure dalla sezione
              Impostazioni dell&apos;account. Risponderemo entro 30 giorni.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Sicurezza dei Dati</h2>
            <p>
              Adottiamo misure tecniche e organizzative adeguate ai sensi dell&apos;Art. 32 GDPR,
              tra cui: crittografia in transito (TLS 1.3) e a riposo (AES-256), autenticazione
              sicura, Row Level Security (RLS) per isolamento dati, backup giornalieri, audit log.
              Per maggiori dettagli, consulta la nostra pagina{' '}
              <Link href="/security" className="text-primary underline">Sicurezza</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Utilizzo di AI</h2>
            <p>
              Il Servizio utilizza modelli di intelligenza artificiale (Mistral AI) per
              l&apos;analisi dei documenti e per la dettatura vocale del perito. I dati sono
              elaborati in tempo reale e <strong>non vengono utilizzati per l&apos;addestramento
              di modelli AI</strong>. L&apos;elaborazione avviene su server europei di Mistral AI
              (Parigi).
            </p>
            <p className="mt-2">
              Per la <strong>dettatura vocale (Voxtral)</strong> in particolare: l&apos;audio
              viene trasmesso a Mistral solo per la trascrizione e non viene conservato; il
              testo trascritto compare nel campo aperto dal perito e viene salvato solo se
              l&apos;utente lo conferma. Il perito è responsabile della verifica della
              trascrizione prima dell&apos;utilizzo, come per qualunque testo immesso nel report.
            </p>
            <p className="mt-2">
              Per dettagli completi sull&apos;uso dell&apos;intelligenza artificiale (modelli, ruolo del
              perito, anti-allucinazione, conformità L. 132/2025 e AI Act):{' '}
              <Link href="/info-ai" className="underline">Trasparenza AI</Link>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Cookie</h2>
            <p>
              Utilizziamo solo cookie tecnici strettamente necessari per il funzionamento del Servizio
              (sessione, autenticazione). Non utilizziamo cookie di profilazione o di terze parti
              per finalità pubblicitarie.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Reclami</h2>
            <p>
              L&apos;Utente ha diritto di proporre reclamo all&apos;Autorità Garante per la Protezione
              dei Dati Personali (www.garanteprivacy.it).
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
