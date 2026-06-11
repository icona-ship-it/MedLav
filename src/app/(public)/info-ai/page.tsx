import Link from 'next/link';
import { Scale, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Trasparenza AI — LegMed',
  description: 'Informativa sull\'uso di sistemi di intelligenza artificiale in LegMed. Conformità Legge 132/2025 e Regolamento UE 2024/1689 (AI Act).',
};

export default function InfoAiPage() {
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
        <h1 className="mb-2 text-3xl font-bold">Trasparenza sull&apos;uso dell&apos;intelligenza artificiale</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Ultimo aggiornamento: maggio 2026 — Conformità L. 132/2025 e Reg. UE 2024/1689 (AI Act)
        </p>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-xl font-semibold">1. Perché questa pagina</h2>
            <p>
              La Legge italiana 132/2025 (in vigore dal 10 ottobre 2025) e il Regolamento UE 2024/1689
              (AI Act) impongono ai professionisti che si avvalgono di sistemi di intelligenza artificiale
              di informare chiaramente gli utenti su quando, come e perché l&apos;AI viene utilizzata.
              Questa pagina raccoglie tali informazioni per LegMed, in attuazione anche degli artt. 13 e 14
              del Regolamento UE 2016/679 (GDPR).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Cosa fa LegMed con l&apos;AI</h2>
            <p>
              LegMed è uno strumento di lavoro per il medico legale (CTU, CTP, perito stragiudiziale)
              che assiste nella redazione di report medico-legali strutturati a partire dalla documentazione
              clinica fornita dal professionista. L&apos;AI svolge ruoli specifici e ben delimitati:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>
                <strong>Riconoscimento ottico (OCR)</strong>: estrazione automatica del testo da PDF,
                immagini e documenti scansionati, anche manoscritti.
              </li>
              <li>
                <strong>Estrazione strutturata</strong>: identificazione automatica di eventi clinici
                (date, diagnosi, esami, terapie, ricoveri) dalla documentazione.
              </li>
              <li>
                <strong>Classificazione documentale</strong>: riconoscimento del tipo di documento
                (cartella clinica, referto radiologico, lettera di dimissione, ecc.).
              </li>
              <li>
                <strong>Sintesi medico-legale</strong>: redazione di un report strutturato, organizzato
                per sezioni, basato esclusivamente sui fatti documentati negli atti.
              </li>
              <li>
                <strong>Recupero linee guida</strong>: ricerca semantica di linee guida cliniche
                pertinenti al caso (RAG).
              </li>
              <li>
                <strong>Analisi immagini diagnostiche</strong>: descrizione automatica di referti
                radiologici allegati (RX, TAC, RM).
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Quali modelli AI usiamo</h2>
            <p>
              Tutti i modelli AI utilizzati da LegMed sono forniti da <strong>Mistral AI SAS</strong>,
              società francese con sede a Parigi. Il trattamento avviene <strong>esclusivamente
              su server localizzati nell&apos;Unione Europea</strong>.
            </p>
            <table className="my-4 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">Modello</th>
                  <th className="px-3 py-2 text-left">Utilizzo</th>
                  <th className="px-3 py-2 text-left">Versione</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-3 py-2"><code className="text-xs">mistral-ocr-2512</code></td>
                  <td className="px-3 py-2">OCR documentale</td>
                  <td className="px-3 py-2 text-muted-foreground">Mistral OCR 3 (dic. 2025, versione fissata)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2"><code className="text-xs">mistral-large-2512</code></td>
                  <td className="px-3 py-2">Estrazione, sintesi, analisi immagini</td>
                  <td className="px-3 py-2 text-muted-foreground">Mistral Large 3 (dic. 2025, versione fissata)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-3 py-2"><code className="text-xs">mistral-small-2603</code></td>
                  <td className="px-3 py-2">Classificazione documentale</td>
                  <td className="px-3 py-2 text-muted-foreground">Mistral Small 4 (mar. 2026, versione fissata)</td>
                </tr>
                <tr>
                  <td className="px-3 py-2"><code className="text-xs">mistral-embed</code></td>
                  <td className="px-3 py-2">Ricerca semantica linee guida</td>
                  <td className="px-3 py-2 text-muted-foreground">Mistral Embed</td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm text-muted-foreground">
              Mistral AI è vincolata da un Data Processing Agreement (DPA) ai sensi dell&apos;art. 28
              GDPR. <strong>I dati caricati su LegMed non vengono utilizzati per l&apos;addestramento
              di alcun modello AI</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Dove vengono trattati i dati</h2>
            <p>
              Tutti i dati clinici caricati su LegMed sono elaborati nel territorio dell&apos;Unione Europea:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Database</strong>: Supabase, server in Frankfurt (eu-central-1, Germania)</li>
              <li><strong>Modelli AI</strong>: Mistral AI, server a Parigi (Francia)</li>
              <li><strong>Hosting applicativo</strong>: Vercel, regione fra1 (Frankfurt, Germania)</li>
              <li><strong>Code job pipeline</strong>: Inngest, regione UE</li>
              <li><strong>Cache rate-limiting</strong>: Upstash Redis, Frankfurt (Germania)</li>
            </ul>
            <p className="mt-3">
              Nessun trasferimento di dati personali avviene al di fuori dello Spazio Economico Europeo.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Base giuridica del trattamento</h2>
            <p>I dati sanitari (categoria particolare ex art. 9 GDPR) sono trattati sulla base di:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Art. 9.2.h GDPR</strong>: necessità per finalità di medicina del lavoro,
                  diagnosi, assistenza sanitaria, gestione dei sistemi e servizi sanitari (qui: redazione
                  di perizia medico-legale).</li>
              <li><strong>Art. 9.2.f GDPR</strong>: necessità per accertare, esercitare o difendere un
                  diritto in sede giudiziaria.</li>
              <li><strong>Consenso esplicito dell&apos;interessato</strong> ove richiesto e ottenuto
                  dal medico legale incaricato.</li>
              <li><strong>Obbligo professionale</strong> del perito medico-legale ex artt. 61 e 62 c.p.c.,
                  art. 220 c.p.p. e relativa normativa deontologica.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Il ruolo del medico legale (art. 4(8) L. 132/2025)</h2>
            <p>
              Il medico legale che utilizza LegMed è <strong>l&apos;autore intellettuale finale</strong> della
              perizia. Coerentemente con l&apos;art. 4(8) della L. 132/2025 e con il principio di prevalenza
              del lavoro intellettuale umano:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>il perito è tenuto a verificare integralmente l&apos;output prodotto da LegMed prima del deposito;</li>
              <li>l&apos;analisi clinica, le valutazioni medico-legali e le conclusioni sono
                  attribuibili esclusivamente al perito firmatario;</li>
              <li>LegMed è uno strumento di supporto e organizzazione documentale, non un sostituto
                  della valutazione professionale.</li>
            </ul>
            <p className="mt-3">
              Ogni report esportato da LegMed riporta un disclosure trasparenza in calce, conformemente
              all&apos;art. 50 del Regolamento UE 2024/1689 (AI Act).
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Anti-allucinazione e safeguard</h2>
            <p>
              LegMed implementa misure tecniche per prevenire la generazione di informazioni non veritiere
              da parte dell&apos;AI:
            </p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>regole assolute di divieto di invenzione di dati nel prompt di sistema;</li>
              <li>validatori automatici post-generazione: rilevamento date fittizie, citazioni non
                  verificate, discordanze numeriche, copertura eventi clinici;</li>
              <li>citazione obbligatoria della fonte (tipo documento + data) per ogni fatto riportato;</li>
              <li>archiviazione del prompt versioning (hash SHA-256) per audit trail.</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Riferimento tecnico: ADR-011 (Prompt Versioning), DPIA del progetto.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Diritti dell&apos;interessato</h2>
            <p>L&apos;interessato (paziente i cui dati sono trattati) può esercitare i diritti previsti
               dagli artt. 15-22 GDPR contattando il professionista incaricato (medico legale), titolare
               autonomo del trattamento dei propri pazienti. In particolare:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Accesso</strong> ai propri dati (art. 15)</li>
              <li><strong>Rettifica</strong> di dati inesatti (art. 16)</li>
              <li><strong>Cancellazione</strong> nei limiti dei vincoli professionali e di legge (art. 17)</li>
              <li><strong>Limitazione del trattamento</strong> (art. 18)</li>
              <li><strong>Portabilità</strong> dei dati (art. 20)</li>
              <li><strong>Opposizione</strong> al trattamento per legittimi interessi (art. 21)</li>
              <li><strong>Reclamo all&apos;Autorità Garante</strong> per la Protezione dei Dati Personali
                  (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer"
                  className="underline">www.garanteprivacy.it</a>)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">9. Decisioni automatizzate</h2>
            <p>
              <strong>LegMed non assume decisioni automatizzate ex art. 22 GDPR</strong>. Il sistema
              produce un documento di lavoro che richiede sempre l&apos;intervento, la verifica e la
              firma del medico legale prima di qualunque utilizzo legale.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">10. Riferimenti normativi</h2>
            <ul className="list-disc pl-6 space-y-1 mt-2 text-sm">
              <li>Regolamento (UE) 2016/679 (GDPR), in particolare artt. 9, 13-14, 15-22, 28, 32, 35</li>
              <li>D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018 (Codice Privacy)</li>
              <li>Regolamento (UE) 2024/1689 — &laquo;AI Act&raquo;, in particolare art. 50 (trasparenza)</li>
              <li>Legge italiana 132/2025 sull&apos;intelligenza artificiale</li>
              <li>Art. 61, 62 c.p.c. e art. 220 c.p.p. per la consulenza tecnica</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">11. Documenti correlati</h2>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><Link href="/privacy" className="underline">Privacy Policy</Link></li>
              <li><Link href="/terms" className="underline">Termini di Servizio</Link></li>
              <li><Link href="/security" className="underline">Sicurezza</Link></li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">12. Contatti</h2>
            <p>
              Per quesiti sull&apos;uso dell&apos;intelligenza artificiale in LegMed o sul trattamento
              dei dati personali, contatta il DPO: <strong>privacy@legmed.it</strong>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
