'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  Loader2, ArrowRight, X, Plus, ChevronDown, ChevronRight, CheckCircle2, Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { updateCase } from '../../actions';
import type { CaseData, PeriziaMetadataUI } from './types';

// --- Section config ---

interface SectionDef {
  id: string;
  title: string;
  fields: string[];
}

const SECTIONS: SectionDef[] = [
  { id: 'intestazione', title: 'Intestazione Perizia', fields: ['tribunale', 'sezione', 'rgNumber', 'judgeName', 'fondoSpese'] },
  { id: 'parti', title: 'Parti e Consulenti', fields: ['ctuName', 'ctuTitle', 'parteRicorrente', 'parteResistente', 'ctpRicorrente', 'ctpResistente'] },
  { id: 'date', title: 'Date', fields: ['dataIncarico', 'dataOperazioni', 'dataDeposito'] },
  { id: 'quesiti', title: 'Quesiti del Giudice', fields: [] }, // special handling
];

// --- Component ---

export function PeriziaMetadataForm({
  caseId, caseData, onSaved, onProceedToNext,
}: {
  caseId: string;
  caseData: CaseData;
  onSaved: () => void;
  onProceedToNext?: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const existing = caseData.perizia_metadata ?? {};
  const [form, setForm] = useState({
    tribunale: existing.tribunale ?? '',
    sezione: existing.sezione ?? '',
    rgNumber: existing.rgNumber ?? '',
    judgeName: existing.judgeName ?? '',
    ctuName: existing.ctuName ?? '',
    ctuTitle: existing.ctuTitle ?? '',
    ctpRicorrente: existing.ctpRicorrente ?? '',
    ctpResistente: existing.ctpResistente ?? '',
    parteRicorrente: existing.parteRicorrente ?? '',
    parteResistente: existing.parteResistente ?? '',
    dataIncarico: existing.dataIncarico ?? '',
    dataOperazioni: existing.dataOperazioni ?? '',
    dataDeposito: existing.dataDeposito ?? '',
    fondoSpese: existing.fondoSpese ?? '',
  });
  const [quesiti, setQuesiti] = useState<string[]>(existing.quesiti ?? []);
  const [newQuesito, setNewQuesito] = useState('');

  // Track which sections are open — first incomplete one starts open
  const sectionFilled = useMemo(() => {
    const filled: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      if (section.id === 'quesiti') {
        filled[section.id] = quesiti.length > 0;
      } else {
        filled[section.id] = section.fields.some((f) => form[f as keyof typeof form]?.trim());
      }
    }
    return filled;
  }, [form, quesiti]);

  const firstIncompleteIdx = SECTIONS.findIndex((s) => !sectionFilled[s.id]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    SECTIONS.forEach((s, i) => {
      initial[s.id] = i === (firstIncompleteIdx >= 0 ? firstIncompleteIdx : 0);
    });
    return initial;
  });

  const toggleSection = (id: string) => {
    setOpenSections({ ...openSections, [id]: !openSections[id] });
  };

  const addQuesito = () => {
    const trimmed = newQuesito.trim();
    if (!trimmed) return;
    setQuesiti([...quesiti, trimmed]);
    setNewQuesito('');
  };

  const removeQuesito = (index: number) => {
    setQuesiti(quesiti.filter((_, i) => i !== index));
  };

  const handleProceed = () => {
    startTransition(async () => {
      const metadata: PeriziaMetadataUI = {
        ...(form.tribunale ? { tribunale: form.tribunale } : {}),
        ...(form.sezione ? { sezione: form.sezione } : {}),
        ...(form.rgNumber ? { rgNumber: form.rgNumber } : {}),
        ...(form.judgeName ? { judgeName: form.judgeName } : {}),
        ...(form.ctuName ? { ctuName: form.ctuName } : {}),
        ...(form.ctuTitle ? { ctuTitle: form.ctuTitle } : {}),
        ...(form.ctpRicorrente ? { ctpRicorrente: form.ctpRicorrente } : {}),
        ...(form.ctpResistente ? { ctpResistente: form.ctpResistente } : {}),
        ...(form.parteRicorrente ? { parteRicorrente: form.parteRicorrente } : {}),
        ...(form.parteResistente ? { parteResistente: form.parteResistente } : {}),
        ...(form.dataIncarico ? { dataIncarico: form.dataIncarico } : {}),
        ...(form.dataOperazioni ? { dataOperazioni: form.dataOperazioni } : {}),
        ...(form.dataDeposito ? { dataDeposito: form.dataDeposito } : {}),
        ...(form.fondoSpese ? { fondoSpese: form.fondoSpese } : {}),
        ...(quesiti.length > 0 ? { quesiti } : {}),
      };

      const hasAnyValue = Object.keys(metadata).length > 0;

      // Auto-save if there's data, then proceed
      if (hasAnyValue) {
        const result = await updateCase({
          caseId,
          periziaMetadata: metadata,
        });
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success('Dati perizia salvati');
        onSaved();
      }

      if (onProceedToNext) {
        onProceedToNext();
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* Info banner */}
      <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800">
        <CardContent className="py-3 px-4">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                Dati per l&apos;intestazione della perizia
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">
                Questi dati vengono inseriti nell&apos;intestazione formale della perizia esportata e nel prompt di generazione. Puoi tornare a compilarli in qualsiasi momento.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Collapsible sections */}
      {SECTIONS.map((section) => {
        const isOpen = openSections[section.id] ?? false;
        const isFilled = sectionFilled[section.id];

        return (
          <Collapsible key={section.id} open={isOpen} onOpenChange={() => toggleSection(section.id)}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {isFilled ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                  )}
                  <span className="text-sm font-semibold">{section.title}</span>
                  {isFilled && (
                    <span className="text-xs text-green-600 dark:text-green-400">Compilato</span>
                  )}
                </div>
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-4 border border-t-0 rounded-b-lg -mt-px">
                {section.id === 'intestazione' && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div>
                        <Label>Tribunale</Label>
                        <Input value={form.tribunale} onChange={(e) => setForm({ ...form, tribunale: e.target.value })} placeholder="es. Tribunale Ordinario di Brescia" />
                        <p className="text-xs text-muted-foreground mt-1">Il tribunale che ha conferito l&apos;incarico</p>
                      </div>
                      <div>
                        <Label>Sezione</Label>
                        <Input value={form.sezione} onChange={(e) => setForm({ ...form, sezione: e.target.value })} placeholder="es. Sezione Centrale Civile" />
                      </div>
                      <div>
                        <Label>Numero RG</Label>
                        <Input value={form.rgNumber} onChange={(e) => setForm({ ...form, rgNumber: e.target.value })} placeholder="es. 10965/2025" />
                        <p className="text-xs text-muted-foreground mt-1">Numero di Ruolo Generale del procedimento</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Giudice</Label>
                        <Input value={form.judgeName} onChange={(e) => setForm({ ...form, judgeName: e.target.value })} placeholder="es. Dott. Raffaele Del Porto" />
                      </div>
                      <div>
                        <Label>Fondo spese</Label>
                        <Input value={form.fondoSpese} onChange={(e) => setForm({ ...form, fondoSpese: e.target.value })} placeholder="es. Euro 1.800,00" />
                        <p className="text-xs text-muted-foreground mt-1">Importo stanziato dal giudice per le spese peritali</p>
                      </div>
                    </div>
                  </div>
                )}

                {section.id === 'parti' && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>CTU (nome)</Label>
                        <Input value={form.ctuName} onChange={(e) => setForm({ ...form, ctuName: e.target.value })} placeholder="es. Dott. Nicola Pigaiani" />
                        <p className="text-xs text-muted-foreground mt-1">Nome completo del Consulente Tecnico d&apos;Ufficio</p>
                      </div>
                      <div>
                        <Label>Qualifica CTU</Label>
                        <Input value={form.ctuTitle} onChange={(e) => setForm({ ...form, ctuTitle: e.target.value })} placeholder="es. medico legale presso..." />
                        <p className="text-xs text-muted-foreground mt-1">Specializzazione e affiliazione professionale</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Parte Ricorrente</Label>
                        <Input value={form.parteRicorrente} onChange={(e) => setForm({ ...form, parteRicorrente: e.target.value })} placeholder="Nome parte ricorrente" />
                      </div>
                      <div>
                        <Label>Parte Resistente</Label>
                        <Input value={form.parteResistente} onChange={(e) => setForm({ ...form, parteResistente: e.target.value })} placeholder="es. ASST Spedali Civili" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>CTP Ricorrente</Label>
                        <Input value={form.ctpRicorrente} onChange={(e) => setForm({ ...form, ctpRicorrente: e.target.value })} placeholder="es. Dott.ssa Sarah Nalin" />
                      </div>
                      <div>
                        <Label>CTP Resistente</Label>
                        <Input value={form.ctpResistente} onChange={(e) => setForm({ ...form, ctpResistente: e.target.value })} placeholder="es. Dott. Lorenzo Micheli" />
                      </div>
                    </div>
                  </div>
                )}

                {section.id === 'date' && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <Label>Data conferimento incarico</Label>
                      <Input value={form.dataIncarico} onChange={(e) => setForm({ ...form, dataIncarico: e.target.value })} placeholder="es. 15/01/2025" />
                    </div>
                    <div>
                      <Label>Data inizio operazioni</Label>
                      <Input value={form.dataOperazioni} onChange={(e) => setForm({ ...form, dataOperazioni: e.target.value })} placeholder="es. 20/02/2025" />
                    </div>
                    <div>
                      <Label>Termine deposito</Label>
                      <Input value={form.dataDeposito} onChange={(e) => setForm({ ...form, dataDeposito: e.target.value })} placeholder="es. 20/05/2025" />
                    </div>
                  </div>
                )}

                {section.id === 'quesiti' && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      I quesiti formulati dal giudice a cui il report deve rispondere punto per punto.
                    </p>
                    {quesiti.map((q, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-md border p-3">
                        <span className="text-sm font-medium text-muted-foreground shrink-0 mt-0.5">{i + 1}.</span>
                        <p className="text-sm flex-1">{q}</p>
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeQuesito(i)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                    <div className="space-y-2">
                      <Textarea
                        value={newQuesito}
                        onChange={(e) => setNewQuesito(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey && newQuesito.trim()) {
                            e.preventDefault();
                            addQuesito();
                          }
                        }}
                        placeholder={`Quesito ${quesiti.length + 1}: inserisci il testo del quesito...`}
                        className="min-h-[80px]"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={addQuesito}
                        disabled={!newQuesito.trim()}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Aggiungi quesito
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Single sticky "Prosegui" button */}
      <div className="sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t px-4 py-3 mt-6 -mx-4">
        <Button
          size="lg"
          className="w-full text-base py-6 bg-green-600 hover:bg-green-700 text-white"
          onClick={handleProceed}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <ArrowRight className="mr-2 h-5 w-5" />
          )}
          Prosegui
        </Button>
        <p className="text-xs text-muted-foreground text-center mt-1">
          Puoi tornare a compilare in qualsiasi momento
        </p>
      </div>
    </div>
  );
}
