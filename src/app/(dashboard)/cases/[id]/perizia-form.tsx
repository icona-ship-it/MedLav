'use client';

import { useState, useTransition, useMemo } from 'react';
import {
  Loader2, ArrowRight, X, Plus, ChevronDown, ChevronRight, CheckCircle2, Info, FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { updateCase } from '../../actions';
import { getQuestiTemplates } from '@/lib/domain-knowledge';
import { CASE_TYPES } from '@/lib/constants';
import type { CaseType } from '@/types';
import type { CaseData, PeriziaMetadataUI } from './types';
import { DictationButton } from '@/components/dictation-button';
import { computeBMI } from '@/services/synthesis/anamnesi-template';

// --- Section config ---

interface SectionDef {
  id: string;
  title: string;
  fields: string[];
}

const SECTIONS: SectionDef[] = [
  { id: 'paziente', title: 'Dati Paziente', fields: ['patientFullName', 'patientDateOfBirth', 'patientAddress', 'patientFiscalCode', 'patientPhone'] },
  { id: 'intestazione', title: 'Intestazione Perizia', fields: ['tribunale', 'sezione', 'rgNumber', 'judgeName', 'fondoSpese'] },
  { id: 'parti', title: 'Parti e Consulenti', fields: ['ctuName', 'ctuTitle', 'specialita', 'alboNumber', 'parteRicorrente', 'parteResistente', 'ctpRicorrente', 'ctpResistente'] },
  { id: 'date', title: 'Date', fields: ['dataIncarico', 'dataOperazioni', 'dataDeposito'] },
  { id: 'quesiti', title: 'Quesiti del Giudice', fields: [] }, // special handling
  { id: 'esameObiettivo', title: 'Esame Obiettivo', fields: ['esameObiettivo'] },
];

/** Module id della perizia medico-legale di Responsabilità Civile. */
const RC_CIVILE_MODULE_ID = 'perizia_ml_rc_civile';

/**
 * Sezioni compilate dal perito SOLO per le perizie RC medico-legali.
 * I dati anamnestici e "Il Fatto e la Storia Clinica" confluiscono nel report
 * come testo del perito (deterministico, vedi anamnesi-template + section-catalog).
 */
const RC_PERITO_SECTIONS: SectionDef[] = [
  { id: 'ilFatto', title: 'Il Fatto e la Storia Clinica', fields: ['ilFattoEStoriaClinica'] },
  {
    id: 'anamnesi',
    title: 'Dati Anamnestici',
    fields: [
      'anamnesiFamiliare', 'anamnesiFisiologica', 'pesoKg', 'altezzaCm',
      'anamnesiPatologicaRemota', 'anamnesiPatologicaProssima',
      'anamnesiFarmacologica', 'anamnesiLavorativa',
    ],
  },
];

/** Parsa un input numerico (accetta virgola IT) → numero positivo o undefined. */
function parseOptionalPositive(value: string): number | undefined {
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Campo textarea con dettatura vocale, riusato per le sottosezioni anamnesi. */
function AnamnesiTextarea({
  label, value, caseId, contextHint, placeholder, onChange,
}: {
  label: string;
  value: string;
  caseId: string;
  contextHint: string;
  placeholder: string;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <DictationButton
          size="icon"
          variant="icon-only"
          caseId={caseId}
          contextHint={contextHint}
          onTranscript={(text) => {
            const sep = value.length > 0 && !value.endsWith('\n') ? '\n' : '';
            onChange(`${value}${sep}${text}`);
          }}
          className="h-7 w-7"
        />
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[90px] text-sm mt-1"
      />
    </div>
  );
}

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
  const isRC = caseData.module_id === RC_CIVILE_MODULE_ID;
  // RC perizie collect anamnesi + "Il Fatto" from the perito; other case types don't.
  const sections = useMemo(
    () => (isRC ? [...SECTIONS, ...RC_PERITO_SECTIONS] : SECTIONS),
    [isRC],
  );
  const [form, setForm] = useState({
    patientFullName: existing.patientFullName ?? '',
    patientDateOfBirth: existing.patientDateOfBirth ?? '',
    patientAddress: existing.patientAddress ?? '',
    patientFiscalCode: existing.patientFiscalCode ?? '',
    patientPhone: existing.patientPhone ?? '',
    tribunale: existing.tribunale ?? '',
    sezione: existing.sezione ?? '',
    rgNumber: existing.rgNumber ?? '',
    judgeName: existing.judgeName ?? '',
    ctuName: existing.ctuName ?? '',
    ctuTitle: existing.ctuTitle ?? '',
    specialita: existing.specialita ?? '',
    alboNumber: existing.alboNumber ?? '',
    ctpRicorrente: existing.ctpRicorrente ?? '',
    ctpResistente: existing.ctpResistente ?? '',
    parteRicorrente: existing.parteRicorrente ?? '',
    parteResistente: existing.parteResistente ?? '',
    dataIncarico: existing.dataIncarico ?? '',
    dataOperazioni: existing.dataOperazioni ?? '',
    dataDeposito: existing.dataDeposito ?? '',
    fondoSpese: existing.fondoSpese ?? '',
    esameObiettivo: existing.esameObiettivo ?? '',
    // Anamnesi (RC) — peso/altezza tenuti come stringa nel form, convertiti a numero al salvataggio
    ilFattoEStoriaClinica: existing.ilFattoEStoriaClinica ?? '',
    anamnesiFamiliare: existing.anamnesiFamiliare ?? '',
    anamnesiFisiologica: existing.anamnesiFisiologica ?? '',
    pesoKg: existing.pesoKg != null ? String(existing.pesoKg) : '',
    altezzaCm: existing.altezzaCm != null ? String(existing.altezzaCm) : '',
    anamnesiPatologicaRemota: existing.anamnesiPatologicaRemota ?? '',
    anamnesiPatologicaProssima: existing.anamnesiPatologicaProssima ?? '',
    anamnesiFarmacologica: existing.anamnesiFarmacologica ?? '',
    anamnesiLavorativa: existing.anamnesiLavorativa ?? '',
  });
  const [quesiti, setQuesiti] = useState<string[]>(existing.quesiti ?? []);
  const [newQuesito, setNewQuesito] = useState('');

  // Track which sections are open — first incomplete one starts open
  const sectionFilled = useMemo(() => {
    const filled: Record<string, boolean> = {};
    for (const section of sections) {
      if (section.id === 'quesiti') {
        filled[section.id] = quesiti.length > 0;
      } else {
        filled[section.id] = section.fields.some((f) => form[f as keyof typeof form]?.trim());
      }
    }
    return filled;
  }, [form, quesiti, sections]);

  const firstIncompleteIdx = sections.findIndex((s) => !sectionFilled[s.id]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    sections.forEach((s, i) => {
      initial[s.id] = i === (firstIncompleteIdx >= 0 ? firstIncompleteIdx : 0);
    });
    return initial;
  });

  const toggleSection = (id: string) => {
    setOpenSections({ ...openSections, [id]: !openSections[id] });
  };

  const addQuesito = () => {
    const trimmed = newQuesito.trim();
    if (!trimmed || quesiti.length >= 20) return;
    setQuesiti([...quesiti, trimmed]);
    setNewQuesito('');
  };

  const removeQuesito = (index: number) => {
    setQuesiti(quesiti.filter((_, i) => i !== index));
  };

  const handleProceed = () => {
    startTransition(async () => {
      const pesoKg = parseOptionalPositive(form.pesoKg);
      const altezzaCm = parseOptionalPositive(form.altezzaCm);
      const metadata: PeriziaMetadataUI = {
        // Dati paziente (fix: in precedenza non venivano salvati → intestazione vuota)
        ...(form.patientFullName ? { patientFullName: form.patientFullName } : {}),
        ...(form.patientDateOfBirth ? { patientDateOfBirth: form.patientDateOfBirth } : {}),
        ...(form.patientAddress ? { patientAddress: form.patientAddress } : {}),
        ...(form.patientFiscalCode ? { patientFiscalCode: form.patientFiscalCode } : {}),
        ...(form.patientPhone ? { patientPhone: form.patientPhone } : {}),
        ...(form.tribunale ? { tribunale: form.tribunale } : {}),
        ...(form.sezione ? { sezione: form.sezione } : {}),
        ...(form.rgNumber ? { rgNumber: form.rgNumber } : {}),
        ...(form.judgeName ? { judgeName: form.judgeName } : {}),
        ...(form.ctuName ? { ctuName: form.ctuName } : {}),
        ...(form.ctuTitle ? { ctuTitle: form.ctuTitle } : {}),
        ...(form.specialita ? { specialita: form.specialita } : {}),
        ...(form.alboNumber ? { alboNumber: form.alboNumber } : {}),
        ...(form.ctpRicorrente ? { ctpRicorrente: form.ctpRicorrente } : {}),
        ...(form.ctpResistente ? { ctpResistente: form.ctpResistente } : {}),
        ...(form.parteRicorrente ? { parteRicorrente: form.parteRicorrente } : {}),
        ...(form.parteResistente ? { parteResistente: form.parteResistente } : {}),
        ...(form.dataIncarico ? { dataIncarico: form.dataIncarico } : {}),
        ...(form.dataOperazioni ? { dataOperazioni: form.dataOperazioni } : {}),
        ...(form.dataDeposito ? { dataDeposito: form.dataDeposito } : {}),
        ...(form.fondoSpese ? { fondoSpese: form.fondoSpese } : {}),
        ...(form.esameObiettivo ? { esameObiettivo: form.esameObiettivo } : {}),
        // Anamnesi (RC) — i campi non renderizzati per non-RC restano vuoti → esclusi
        ...(form.ilFattoEStoriaClinica ? { ilFattoEStoriaClinica: form.ilFattoEStoriaClinica } : {}),
        ...(form.anamnesiFamiliare ? { anamnesiFamiliare: form.anamnesiFamiliare } : {}),
        ...(form.anamnesiFisiologica ? { anamnesiFisiologica: form.anamnesiFisiologica } : {}),
        ...(pesoKg != null ? { pesoKg } : {}),
        ...(altezzaCm != null ? { altezzaCm } : {}),
        ...(form.anamnesiPatologicaRemota ? { anamnesiPatologicaRemota: form.anamnesiPatologicaRemota } : {}),
        ...(form.anamnesiPatologicaProssima ? { anamnesiPatologicaProssima: form.anamnesiPatologicaProssima } : {}),
        ...(form.anamnesiFarmacologica ? { anamnesiFarmacologica: form.anamnesiFarmacologica } : {}),
        ...(form.anamnesiLavorativa ? { anamnesiLavorativa: form.anamnesiLavorativa } : {}),
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
      {sections.map((section) => {
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
                {section.id === 'paziente' && (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Nome e Cognome</Label>
                        <Input value={form.patientFullName} onChange={(e) => setForm({ ...form, patientFullName: e.target.value })} placeholder="es. Massarenti Daniela" />
                        <p className="text-xs text-muted-foreground mt-1">Apparirà nell&apos;intestazione della perizia</p>
                      </div>
                      <div>
                        <Label>Data di nascita</Label>
                        <Input type="date" value={form.patientDateOfBirth} onChange={(e) => setForm({ ...form, patientDateOfBirth: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <Label>Indirizzo di residenza</Label>
                      <Input value={form.patientAddress} onChange={(e) => setForm({ ...form, patientAddress: e.target.value })} placeholder="es. Via Todeschini 37, 37126 Verona" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Codice Fiscale</Label>
                        <Input value={form.patientFiscalCode} onChange={(e) => setForm({ ...form, patientFiscalCode: e.target.value.toUpperCase() })} placeholder="es. MSSDNL45B42A944J" maxLength={16} />
                      </div>
                      <div>
                        <Label>Telefono</Label>
                        <Input value={form.patientPhone} onChange={(e) => setForm({ ...form, patientPhone: e.target.value })} placeholder="es. 333 816 5222" />
                      </div>
                    </div>
                  </div>
                )}
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
                        <Label>Specialita</Label>
                        <Input value={form.specialita ?? ''} onChange={(e) => setForm({ ...form, specialita: e.target.value })} placeholder="es. Ortopedia, Medicina Legale" />
                        <p className="text-xs text-muted-foreground mt-1">Specializzazione medica del perito</p>
                      </div>
                      <div>
                        <Label>N. Iscrizione Albo</Label>
                        <Input value={form.alboNumber ?? ''} onChange={(e) => setForm({ ...form, alboNumber: e.target.value })} placeholder="es. 12345 - Ordine Medici di Verona" />
                        <p className="text-xs text-muted-foreground mt-1">Numero di iscrizione all&apos;Albo professionale</p>
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

                {section.id === 'esameObiettivo' && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-muted-foreground flex-1">
                        Inserisci i risultati dell&apos;esame obiettivo eseguito durante la visita medico-legale. Queste informazioni appariranno nella sezione &quot;Visita del Periziando&quot; del report.
                      </p>
                      <DictationButton
                        size="sm"
                        variant="icon-label"
                        caseId={caseId}
                        contextHint="esame obiettivo medico-legale, soggettivo, obiettivo, periziando"
                        onTranscript={(text) => {
                          const prev = form.esameObiettivo ?? '';
                          const sep = prev.length > 0 && !prev.endsWith('\n') ? '\n' : '';
                          setForm({ ...form, esameObiettivo: `${prev}${sep}${text}` });
                        }}
                      />
                    </div>
                    <Textarea
                      value={form.esameObiettivo ?? ''}
                      onChange={(e) => setForm({ ...form, esameObiettivo: e.target.value })}
                      placeholder={"SOGGETTIVAMENTE — Il periziando riferisce:\n- Sintomatologia attuale...\n\nOBIETTIVAMENTE — All'esame obiettivo si rileva:\n- Esame obiettivo generale...\n- Esame locale/specialistico..."}
                      className="min-h-[200px] font-mono text-sm"
                    />
                  </div>
                )}

                {section.id === 'quesiti' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">
                        I quesiti formulati dal giudice a cui il report deve rispondere punto per punto.
                      </p>
                      <span className={`text-xs font-medium ${quesiti.length >= 20 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {quesiti.length}/20
                      </span>
                    </div>
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
                      <div className="relative">
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
                          className="min-h-[80px] pr-12"
                        />
                        <div className="absolute right-2 top-2">
                          <DictationButton
                            size="icon"
                            variant="icon-only"
                            caseId={caseId}
                            contextHint="quesito del giudice, perizia, responsabilita medica"
                            onTranscript={(text) => {
                              const sep = newQuesito.length > 0 && !newQuesito.endsWith(' ') ? ' ' : '';
                              setNewQuesito(`${newQuesito}${sep}${text}`);
                            }}
                            className="h-7 w-7"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={addQuesito}
                          disabled={!newQuesito.trim() || quesiti.length >= 20}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Aggiungi quesito
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" disabled={quesiti.length >= 20}>
                              <FileText className="mr-1 h-3 w-3" />
                              Carica template
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-72 max-h-64 overflow-y-auto">
                            {CASE_TYPES.map((ct) => (
                              <DropdownMenuItem
                                key={ct.value}
                                onClick={() => {
                                  const templates = getQuestiTemplates(ct.value as CaseType);
                                  if (templates.length === 0) return;
                                  const newItems = [...templates].filter((t) => !quesiti.includes(t));
                                  if (newItems.length === 0) {
                                    toast.info('Questi quesiti sono già presenti');
                                    return;
                                  }
                                  const remaining = 20 - quesiti.length;
                                  const toAdd = newItems.slice(0, remaining);
                                  setQuesiti([...quesiti, ...toAdd]);
                                  toast.success(`${toAdd.length} quesiti caricati da "${ct.label}"`);
                                }}
                              >
                                {ct.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                )}

                {section.id === 'ilFatto' && (
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs text-muted-foreground flex-1">
                        Ricostruzione dell&apos;evento e dell&apos;iter clinico, scritta da te. Questo testo appare nel report nella sezione &quot;Il Fatto e la Storia Clinica&quot; senza essere rielaborato dall&apos;AI.
                      </p>
                      <DictationButton
                        size="sm"
                        variant="icon-label"
                        caseId={caseId}
                        contextHint="il fatto e la storia clinica, evento indice, iter diagnostico terapeutico, perizia medico-legale"
                        onTranscript={(text) => {
                          const prev = form.ilFattoEStoriaClinica;
                          const sep = prev.length > 0 && !prev.endsWith('\n') ? '\n' : '';
                          setForm({ ...form, ilFattoEStoriaClinica: `${prev}${sep}${text}` });
                        }}
                      />
                    </div>
                    <Textarea
                      value={form.ilFattoEStoriaClinica}
                      onChange={(e) => setForm({ ...form, ilFattoEStoriaClinica: e.target.value })}
                      placeholder={'es. In data ... il/la sig./sig.ra ... riportava ... Veniva condotto/a presso il PS di ..., dove veniva posta diagnosi di ... Seguivano controlli ...'}
                      className="min-h-[200px] text-sm"
                    />
                  </div>
                )}

                {section.id === 'anamnesi' && (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Dati anamnestici raccolti dal perito. Confluiscono nel report nella sezione &quot;Dati Anamnestici&quot; come testo tuo (l&apos;AI non li rielabora). Compila solo i campi pertinenti.
                    </p>
                    <AnamnesiTextarea
                      label="Anamnesi familiare"
                      caseId={caseId}
                      contextHint="anamnesi familiare, perizia medico-legale"
                      placeholder="es. Nega familiarità per patologie di rilievo..."
                      value={form.anamnesiFamiliare}
                      onChange={(t) => setForm({ ...form, anamnesiFamiliare: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi fisiologica"
                      caseId={caseId}
                      contextHint="anamnesi fisiologica, perizia medico-legale"
                      placeholder="es. Nato/a a termine; alvo e diuresi regolari; non fumatore/trice..."
                      value={form.anamnesiFisiologica}
                      onChange={(t) => setForm({ ...form, anamnesiFisiologica: t })}
                    />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Peso (kg)</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.1"
                          value={form.pesoKg}
                          onChange={(e) => setForm({ ...form, pesoKg: e.target.value })}
                          placeholder="es. 70"
                        />
                      </div>
                      <div>
                        <Label>Altezza (cm)</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={form.altezzaCm}
                          onChange={(e) => setForm({ ...form, altezzaCm: e.target.value })}
                          placeholder="es. 175"
                        />
                      </div>
                    </div>
                    {(() => {
                      const bmi = computeBMI(parseOptionalPositive(form.pesoKg), parseOptionalPositive(form.altezzaCm));
                      return bmi ? (
                        <p className="text-xs text-muted-foreground">
                          BMI calcolato:{' '}
                          <span className="font-medium text-foreground">{String(bmi.value).replace('.', ',')}</span>{' '}
                          ({bmi.category}) — incluso automaticamente nell&apos;anamnesi fisiologica del report
                        </p>
                      ) : null;
                    })()}
                    <AnamnesiTextarea
                      label="Anamnesi patologica remota"
                      caseId={caseId}
                      contextHint="anamnesi patologica remota, patologie pregresse, perizia medico-legale"
                      placeholder="es. Pregressa frattura del polso sx (2015); ipertensione arteriosa in terapia..."
                      value={form.anamnesiPatologicaRemota}
                      onChange={(t) => setForm({ ...form, anamnesiPatologicaRemota: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi patologica prossima"
                      caseId={caseId}
                      contextHint="anamnesi patologica prossima, evento, perizia medico-legale"
                      placeholder="es. In data ... a seguito di ... lamenta..."
                      value={form.anamnesiPatologicaProssima}
                      onChange={(t) => setForm({ ...form, anamnesiPatologicaProssima: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi farmacologica"
                      caseId={caseId}
                      contextHint="anamnesi farmacologica, terapie, farmaci, perizia medico-legale"
                      placeholder="es. Assume ...; nega allergie note a farmaci"
                      value={form.anamnesiFarmacologica}
                      onChange={(t) => setForm({ ...form, anamnesiFarmacologica: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi lavorativa"
                      caseId={caseId}
                      contextHint="anamnesi lavorativa, occupazione, perizia medico-legale"
                      placeholder="es. Impiegato/a; attività che richiede..."
                      value={form.anamnesiLavorativa}
                      onChange={(t) => setForm({ ...form, anamnesiLavorativa: t })}
                    />
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
          variant="approve"
          className="w-full text-base py-6"
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
