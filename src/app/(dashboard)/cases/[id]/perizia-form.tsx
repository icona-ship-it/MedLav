'use client';

import { useState, useTransition } from 'react';
import {
  Plus, X, Loader2, Save, Info, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { updateCase } from '../../actions';
import { QUESITI_TEMPLATES } from '@/lib/quesiti-templates';
import { EsameObiettivoForm, type EsameObiettivoStructured } from '@/components/esame-obiettivo-form';
import type { CaseData, PeriziaMetadataUI } from './types';
import type { CaseType } from '@/types';

export function PeriziaMetadataForm({
  caseId, caseData, onSaved,
}: {
  caseId: string;
  caseData: CaseData;
  onSaved: () => void;
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
    esameObiettivo: existing.esameObiettivo ?? '',
    speseMediche: existing.speseMediche ?? '',
  });

  const [quesiti, setQuesiti] = useState<string[]>(existing.quesiti ?? ['']);
  const [esameStrutturato, setEsameStrutturato] = useState<EsameObiettivoStructured | null>(
    existing.esameObiettivoStrutturato ?? null,
  );

  const handleSave = () => {
    startTransition(async () => {
      const filteredQuesiti = quesiti.filter((q) => q.trim().length > 0);
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
        ...(form.esameObiettivo ? { esameObiettivo: form.esameObiettivo } : {}),
        ...(esameStrutturato ? { esameObiettivoStrutturato: esameStrutturato } : {}),
        ...(form.speseMediche ? { speseMediche: form.speseMediche } : {}),
        ...(filteredQuesiti.length > 0 ? { quesiti: filteredQuesiti } : {}),
      };

      const hasAnyValue = Object.keys(metadata).length > 0;

      const result = await updateCase({
        caseId,
        periziaMetadata: hasAnyValue ? metadata : null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Dati perizia salvati');
      onSaved();
    });
  };

  const addQuesito = () => setQuesiti([...quesiti, '']);
  const removeQuesito = (index: number) => setQuesiti(quesiti.filter((_, i) => i !== index));
  const updateQuesito = (index: number, value: string) => {
    const next = [...quesiti];
    next[index] = value;
    setQuesiti(next);
  };

  const handleUseTemplate = () => {
    const caseType = caseData.case_type as CaseType;
    const template = QUESITI_TEMPLATES[caseType] ?? QUESITI_TEMPLATES.generica;

    const hasExistingQuesiti = quesiti.some((q) => q.trim().length > 0);
    if (hasExistingQuesiti) {
      toast('Sovrascrivere i quesiti esistenti?', {
        action: {
          label: 'Sovrascrivi',
          onClick: () => setQuesiti([...template]),
        },
        cancel: { label: 'Annulla', onClick: () => {} },
      });
    } else {
      setQuesiti([...template]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4" />
        <span>Questi dati vengono inseriti nell&apos;intestazione formale della perizia esportata e nel prompt di generazione del report.</span>
      </div>

      {/* Intestazione Perizia */}
      <Card>
        <CardHeader>
          <CardTitle>Intestazione Perizia</CardTitle>
          <CardDescription>Dati formali del procedimento</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Tribunale</Label>
              <Input value={form.tribunale} onChange={(e) => setForm({ ...form, tribunale: e.target.value })} placeholder="es. Tribunale Ordinario di Brescia" />
            </div>
            <div>
              <Label>Sezione</Label>
              <Input value={form.sezione} onChange={(e) => setForm({ ...form, sezione: e.target.value })} placeholder="es. Sezione Centrale Civile" />
            </div>
            <div>
              <Label>Numero RG</Label>
              <Input value={form.rgNumber} onChange={(e) => setForm({ ...form, rgNumber: e.target.value })} placeholder="es. 10965/2025" />
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
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Parti e CTP */}
      <Card>
        <CardHeader>
          <CardTitle>Parti e Consulenti</CardTitle>
          <CardDescription>Parti del procedimento e consulenti tecnici</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>CTU (nome)</Label>
              <Input value={form.ctuName} onChange={(e) => setForm({ ...form, ctuName: e.target.value })} placeholder="es. Dott. Nicola Pigaiani" />
            </div>
            <div>
              <Label>Qualifica CTU</Label>
              <Input value={form.ctuTitle} onChange={(e) => setForm({ ...form, ctuTitle: e.target.value })} placeholder="es. medico legale presso..." />
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
        </CardContent>
      </Card>

      {/* Date */}
      <Card>
        <CardHeader>
          <CardTitle>Date</CardTitle>
          <CardDescription>Date del procedimento peritale</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Quesiti */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Quesiti del Giudice</CardTitle>
              <CardDescription>I quesiti verranno inclusi nella perizia con risposte punto per punto</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleUseTemplate}>
                <FileText className="mr-1 h-3 w-3" />Usa template
              </Button>
              <Button variant="outline" size="sm" onClick={addQuesito}>
                <Plus className="mr-1 h-3 w-3" />Aggiungi quesito
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {quesiti.map((q, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2.5 text-sm font-medium text-muted-foreground shrink-0">{i + 1}.</span>
              <Textarea
                rows={2}
                value={q}
                onChange={(e) => updateQuesito(i, e.target.value)}
                placeholder={`Quesito ${i + 1}...`}
                className="flex-1"
              />
              {quesiti.length > 1 && (
                <Button variant="ghost" size="icon" className="mt-1 h-8 w-8 shrink-0" onClick={() => removeQuesito(i)} aria-label={`Rimuovi quesito ${i + 1}`}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Esame Obiettivo */}
      <Card>
        <CardHeader>
          <CardTitle>Esame Obiettivo</CardTitle>
          <CardDescription>Dati della visita medico-legale del paziente</CardDescription>
        </CardHeader>
        <CardContent>
          <EsameObiettivoForm
            value={esameStrutturato}
            freeText={form.esameObiettivo}
            onChange={(structured, formattedText) => {
              setEsameStrutturato(structured);
              setForm({ ...form, esameObiettivo: formattedText });
            }}
            onFreeTextChange={(text) => setForm({ ...form, esameObiettivo: text })}
          />
        </CardContent>
      </Card>

      {/* Spese Mediche */}
      <Card>
        <CardHeader>
          <CardTitle>Spese Mediche</CardTitle>
          <CardDescription>Documentazione delle spese mediche sostenute</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={4}
            value={form.speseMediche}
            onChange={(e) => setForm({ ...form, speseMediche: e.target.value })}
            placeholder="Elenco spese mediche documentate..."
          />
        </CardContent>
      </Card>

      {/* Save button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          Salva dati perizia
        </Button>
      </div>
    </div>
  );
}
