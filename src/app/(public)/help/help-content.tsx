'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, HelpCircle, List } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

const FAQ_ITEMS = [
  {
    question: 'Come funziona MedLav?',
    answer:
      'MedLav semplifica il lavoro del medico legale in tre passaggi: carichi la documentazione clinica (referti, cartelle cliniche, esami), ' +
      'il nostro sistema AI analizza i documenti tramite OCR ed estrazione automatica degli eventi clinici, e infine viene generato un report ' +
      'medico-legale strutturato che puoi esportare e personalizzare.',
  },
  {
    question: 'Quali formati di documenti sono supportati?',
    answer:
      'MedLav supporta i seguenti formati: PDF (anche scansionati), immagini (JPG, PNG, TIFF), e documenti DOCX. ' +
      'Il sistema OCR riconosce automaticamente il testo anche da documenti scansionati o fotografati.',
  },
  {
    question: 'I miei dati sono sicuri?',
    answer:
      'La sicurezza dei dati sanitari \u00e8 la nostra priorit\u00e0 assoluta. Tutti i dati sono conservati esclusivamente nell\'Unione Europea ' +
      '(data center di Francoforte, Germania). Il trattamento \u00e8 conforme al GDPR Art. 9 per le categorie particolari di dati. ' +
      'Utilizziamo crittografia in transito (TLS 1.3) e a riposo (AES-256), Row Level Security per isolamento dati, e audit log completi.',
  },
  {
    question: 'Come vengono generati i report?',
    answer:
      'I report sono generati utilizzando AI Mistral (server europei, Parigi). Il sistema adatta automaticamente tono e struttura in base al ruolo selezionato: ' +
      'CTU (tono neutrale e bilanciato), CTP (assertivo e pro-paziente), o Stragiudiziale (pragmatico e realistico). ' +
      'Il report include cronistoria, analisi delle anomalie, calcoli medico-legali (ITT/ITP) e conclusioni.',
  },
  {
    question: 'Posso modificare il report generato?',
    answer:
      'S\u00ec, il report generato \u00e8 una bozza che puoi modificare liberamente. Puoi editare il testo direttamente nell\'app, ' +
      'rigenerare singole sezioni, e poi esportare il risultato finale in formato HTML, DOCX, CSV o PDF. ' +
      'Il report \u00e8 pensato come punto di partenza per il tuo lavoro peritale.',
  },
  {
    question: 'Come contatto il supporto?',
    answer:
      'Per qualsiasi domanda o problema, puoi contattarci all\'indirizzo email support@medlav.it. ' +
      'Rispondiamo generalmente entro 24 ore lavorative.',
  },
];

const GUIDE_STEPS = [
  {
    step: 1,
    title: 'Registrati',
    description: 'Crea un account con il tuo indirizzo email professionale. Riceverai un\'email di verifica per attivare l\'account.',
  },
  {
    step: 2,
    title: 'Crea un caso',
    description: 'Dalla dashboard, clicca "Nuovo Caso". Inserisci il codice caso, seleziona il tipo di perizia (ortopedica, oncologica, etc.) e il tuo ruolo (CTU, CTP, stragiudiziale).',
  },
  {
    step: 3,
    title: 'Carica documenti',
    description: 'Carica la documentazione clinica: referti, cartelle cliniche, esami strumentali. Sono supportati PDF, immagini e DOCX.',
  },
  {
    step: 4,
    title: 'Avvia elaborazione',
    description: 'Clicca "Avvia Elaborazione". Il sistema eseguir\u00e0 automaticamente OCR, estrazione eventi, analisi anomalie e generazione del report.',
  },
  {
    step: 5,
    title: 'Scarica report',
    description: 'Una volta completata l\'elaborazione, rivedi il report, apporta eventuali modifiche, e scaricalo nel formato preferito (HTML, DOCX, CSV, PDF).',
  },
];

const GLOSSARY_TERMS = [
  {
    term: 'CTU',
    definition: 'Consulente Tecnico d\'Ufficio. Perito nominato dal giudice con il compito di fornire una valutazione imparziale e tecnica su questioni mediche.',
  },
  {
    term: 'CTP',
    definition: 'Consulente Tecnico di Parte. Perito nominato da una delle parti in causa per supportare la propria posizione con argomentazioni tecniche.',
  },
  {
    term: 'ITT',
    definition: 'Invalidit\u00e0 Temporanea Totale. Periodo durante il quale il paziente \u00e8 completamente impossibilitato a svolgere le proprie attivit\u00e0 quotidiane.',
  },
  {
    term: 'ITP',
    definition: 'Invalidit\u00e0 Temporanea Parziale. Periodo durante il quale il paziente \u00e8 parzialmente limitato nello svolgimento delle proprie attivit\u00e0.',
  },
  {
    term: 'Nesso causale',
    definition: 'Il collegamento logico e scientifico tra la condotta del professionista sanitario e il danno subito dal paziente. Elemento fondamentale nella valutazione medico-legale.',
  },
  {
    term: 'Cronistoria',
    definition: 'Ricostruzione cronologica ordinata di tutti gli eventi clinici rilevanti estratti dalla documentazione, dalla prima visita all\'ultimo follow-up.',
  },
];

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border p-4 text-left hover:bg-muted/50 transition-colors">
        <span className="font-medium">{question}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 pt-2 text-muted-foreground">
        {answer}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function HelpContent() {
  return (
    <>
      {/* FAQ Section */}
      <section className="mb-12">
        <div className="mb-6 flex items-center gap-2">
          <HelpCircle className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold">Domande Frequenti</h2>
        </div>
        <div className="space-y-2">
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </section>

      {/* Step-by-step Guide */}
      <section className="mb-12">
        <div className="mb-6 flex items-center gap-2">
          <List className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold">Guida Passo-Passo</h2>
        </div>
        <div className="space-y-4">
          {GUIDE_STEPS.map((item) => (
            <div key={item.step} className="flex gap-4 rounded-lg border p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                {item.step}
              </div>
              <div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Glossary */}
      <section className="mb-12">
        <div className="mb-6 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-2xl font-semibold">Glossario</h2>
        </div>
        <div className="space-y-3">
          {GLOSSARY_TERMS.map((item) => (
            <div key={item.term} className="rounded-lg border p-4">
              <dt className="font-semibold text-primary">{item.term}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{item.definition}</dd>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-lg border bg-muted/30 p-6 text-center">
        <h2 className="mb-2 text-lg font-semibold">Hai ancora domande?</h2>
        <p className="text-sm text-muted-foreground">
          Contattaci a{' '}
          <a href="mailto:support@medlav.it" className="text-primary underline">
            support@medlav.it
          </a>
          {' '}e ti risponderemo al pi&ugrave; presto.
        </p>
      </section>
    </>
  );
}
