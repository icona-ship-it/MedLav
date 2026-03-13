'use client';

import { useState, useTransition } from 'react';
import {
  Loader2, Save, Info, X, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateCase } from '../../actions';
import type { CaseData, PeriziaMetadataUI } from './types';

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

  const addQuesito = () => {
    const trimmed = newQuesito.trim();
    if (!trimmed) return;
    setQuesiti([...quesiti, trimmed]);
    setNewQuesito('');
  };

  const removeQuesito = (index: number) => {
    setQuesiti(quesiti.filter((_, i) => i !== index));
  };

  const handleSave = (proceed?: boolean) => {
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

      // If proceeding with empty form, just skip without saving
      if (proceed && !hasAnyValue && onProceedToNext) {
        onProceedToNext();
        return;
      }

      if (!hasAnyValue) {
        toast('Nessun dato da salvare');
        return;
      }

      const result = await updateCase({
        caseId,
        periziaMetadata: metadata,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success('Dati perizia salvati');
      // Call onProceedToNext before onSaved (which triggers router.refresh)
      // to ensure step change is applied before re-render
      if (proceed && onProceedToNext) {
        onProceedToNext();
      }
      onSaved();
    });
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

      {/* Quesiti del Giudice */}
      <Card>
        <CardHeader>
          <CardTitle>Quesiti del Giudice</CardTitle>
          <CardDescription>I quesiti formulati dal giudice a cui il report deve rispondere punto per punto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
              placeholder="Inserisci il testo del quesito..."
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
        </CardContent>
      </Card>

      {/* Action buttons — only two: save+proceed and skip */}
      <div className="flex gap-3">
        {onProceedToNext && (
          <Button variant="outline" onClick={onProceedToNext} disabled={isPending} className="flex-1">
            Salta e continua
          </Button>
        )}
        <Button
          onClick={() => handleSave(!!onProceedToNext)}
          disabled={isPending}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
        >
          {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
          {onProceedToNext ? 'Salva e prosegui' : 'Salva'}
        </Button>
      </div>
    </div>
  );
}
