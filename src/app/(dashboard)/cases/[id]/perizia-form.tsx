'use client';

import { useState, useTransition, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Loader2, ArrowRight, X, Plus, ChevronDown, ChevronRight, CheckCircle2, Info,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { updateCase, getLastPeritoDefaults } from '../../actions';
import { usePeriziaDraft } from './use-perizia-draft';
import { buildVisibleSections } from './perizia-form-sections';
import { mergeDraftForm, formatDraftAge, type PeriziaDraft } from '@/lib/perizia-draft-storage';
import { isValidItalianDate } from '@/lib/validators/date-format';
import type { CaseData, PeriziaMetadataUI } from './types';
import { computeBMI } from '@/services/synthesis/anamnesi-template';

// --- Section config ---

/** Module id della perizia medico-legale di Responsabilità Civile. */
const RC_CIVILE_MODULE_ID = 'perizia_ml_rc_civile';

/** Campi data dell'intestazione: testo libero, validati come date reali (1.4). */
const HEADER_DATE_FIELDS = [
  'dataIncarico', 'dataOperazioni', 'dataDeposito', 'termineBozza', 'termineOsservazioni',
] as const;

const DATE_FORMAT_HINT = 'Data non valida — usa il formato GG/MM/AAAA (es. 15/01/2025)';

/** I 6 campi del professionista prefillabili dall'ultimo caso (1.5). */
const PERITO_FIELDS = ['ctuName', 'ctuTitle', 'specialita', 'alboNumber', 'ctuEmail', 'ctuPec'] as const;

/** Parsa un input numerico (accetta virgola IT) → numero positivo o undefined. */
function parseOptionalPositive(value: string): number | undefined {
  const n = Number(value.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Input data intestazione: bordo rosso + messaggio se la data non esiste (1.4). */
function HeaderDateInput({
  label, value, hint, onChange,
}: {
  label: string;
  value: string;
  hint?: string;
  onChange: (text: string) => void;
}) {
  const invalid = value.trim() !== '' && !isValidItalianDate(value);
  return (
    <div>
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="es. 15/01/2025"
        aria-invalid={invalid || undefined}
        className={invalid ? 'border-destructive focus-visible:ring-destructive' : undefined}
      />
      {invalid ? (
        <p className="text-xs text-destructive mt-1" role="alert">{DATE_FORMAT_HINT}</p>
      ) : hint ? (
        <p className="text-sm text-muted-foreground mt-1">{hint}</p>
      ) : null}
    </div>
  );
}

/** Campo textarea con label, riusato per le sottosezioni anamnesi. */
function AnamnesiTextarea({
  label, value, placeholder, onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
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
  caseId, caseData, onSaved, onProceedToNext, onDirtyChange,
}: {
  caseId: string;
  caseData: CaseData;
  onSaved: () => void;
  onProceedToNext?: () => void;
  /** Notifica il wizard quando il form ha modifiche non salvate (blocca l'auto-advance). */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const existing = useMemo(() => caseData.perizia_metadata ?? {}, [caseData.perizia_metadata]);
  const isRC = caseData.module_id === RC_CIVILE_MODULE_ID;
  // Stragiudiziale (schema Antoniazzi): nessun contesto giudiziario → niente
  // intestazione del Tribunale, termini processuali o Quesiti del Giudice.
  const isStragiudiziale = caseData.case_role === 'stragiudiziale';
  // RC perizie collect anamnesi + "Il Fatto" from the perito; other case types don't.
  const sections = useMemo(
    () => buildVisibleSections({ role: caseData.case_role, isRC }),
    [isRC, caseData.case_role],
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
    tipoProcedimento: existing.tipoProcedimento ?? '',
    ambitoPenale: existing.ambitoPenale ?? false,
    decesso: existing.decesso ?? false,
    oggettoIncarico: existing.oggettoIncarico ?? '',
    judgeName: existing.judgeName ?? '',
    giudiceQualifica: existing.giudiceQualifica ?? '',
    ctuName: existing.ctuName ?? '',
    ctuTitle: existing.ctuTitle ?? '',
    specialita: existing.specialita ?? '',
    alboNumber: existing.alboNumber ?? '',
    ctuEmail: existing.ctuEmail ?? '',
    ctuPec: existing.ctuPec ?? '',
    collaboratoreName: existing.collaboratoreName ?? '',
    collaboratoreTitle: existing.collaboratoreTitle ?? '',
    coCtuName: existing.coCtuName ?? '',
    coCtuTitle: existing.coCtuTitle ?? '',
    ctpRicorrente: existing.ctpRicorrente ?? '',
    ctpResistente: existing.ctpResistente ?? '',
    parteRicorrente: existing.parteRicorrente ?? '',
    parteResistente: existing.parteResistente ?? '',
    dataIncarico: existing.dataIncarico ?? '',
    dataOperazioni: existing.dataOperazioni ?? '',
    dataDeposito: existing.dataDeposito ?? '',
    termineBozza: existing.termineBozza ?? '',
    termineOsservazioni: existing.termineOsservazioni ?? '',
    provvedimentiOrdinanza: existing.provvedimentiOrdinanza ?? '',
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
  // Sezioni del report escluse: gestite dal selettore nello step Elaborazione
  // (processing-section). Qui NON c'è più il picker, ma il valore va preservato:
  // updateCase riscrive l'intero perizia_metadata, quindi reinseriamo il valore
  // salvato per non azzerare le esclusioni impostate nello step successivo.
  const [excludedSections, setExcludedSections] = useState<string[]>(existing.excludedReportSections ?? []);

  // Latest form state for async callbacks (prefill) without stale closures.
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; });

  // --- 1.2: bozza automatica + dirty tracking + beforeunload (use-perizia-draft) ---
  const draftPayload = useMemo(
    () => ({ form, quesiti, excludedSections }),
    [form, quesiti, excludedSections],
  );

  const handleRestoreDraft = useCallback((draft: PeriziaDraft) => {
    setForm((prev) => mergeDraftForm(prev, draft.form));
    setQuesiti(draft.quesiti);
    setExcludedSections(draft.excludedSections);
    toast.success('Bozza ripristinata');
  }, []);

  const {
    isDirty, draftBanner, restoreDraft, discardDraft, markSaved, absorbIntoBaseline,
  } = usePeriziaDraft({
    caseId,
    payload: draftPayload,
    savedUpdatedAt: caseData.updated_at ?? null,
    onDirtyChange,
    onRestore: handleRestoreDraft,
  });

  // --- 1.5: prefill dati del perito dall'ultimo caso (solo campi vuoti) ---
  const [peritoPrefilled, setPeritoPrefilled] = useState(false);
  const prefillAttemptedRef = useRef(false);
  useEffect(() => {
    if (prefillAttemptedRef.current) return;
    prefillAttemptedRef.current = true;
    // Solo se il caso non ha già dati del perito salvati.
    const hasSavedPeritoData = PERITO_FIELDS.some((f) => (existing[f] ?? '').trim().length > 0);
    if (hasSavedPeritoData) return;
    let active = true;
    void getLastPeritoDefaults().then(({ defaults }) => {
      if (!active || !defaults) return;
      // Riempi SOLO i campi ancora vuoti al momento della risposta.
      const patch: Partial<Record<(typeof PERITO_FIELDS)[number], string>> = {};
      for (const field of PERITO_FIELDS) {
        const value = defaults[field];
        if (value && formRef.current[field].trim() === '') patch[field] = value;
      }
      if (Object.keys(patch).length === 0) return;
      setForm((prev) => ({ ...prev, ...patch }));
      // Il prefill non è una modifica dell'utente: non deve marcare il form
      // come sporco né far scattare autosave/guard (viene salvato col Prosegui).
      absorbIntoBaseline(patch as Record<string, string>);
      setPeritoPrefilled(true);
    });
    return () => { active = false; };
  }, [existing, absorbIntoBaseline]);

  // --- 1.4: date intestazione non valide (blocca il Prosegui finché corrette) ---
  const invalidDateFields = useMemo(
    () => HEADER_DATE_FIELDS.filter((f) => form[f].trim() !== '' && !isValidItalianDate(form[f])),
    [form],
  );

  // Track which sections are open — first incomplete one starts open
  const sectionFilled = useMemo(() => {
    const filled: Record<string, boolean> = {};
    for (const section of sections) {
      if (section.id === 'quesiti') {
        filled[section.id] = quesiti.length > 0;
      } else {
        filled[section.id] = section.fields.some((f) => {
          const v = form[f as keyof typeof form];
          return typeof v === 'string' && v.trim().length > 0;
        });
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
    // 1.4: una data malformata non deve mai finire nell'intestazione depositata.
    if (invalidDateFields.length > 0) {
      setOpenSections((prev) => ({ ...prev, date: true }));
      toast.error('Controlla le date: formato non valido. Usa GG/MM/AAAA (es. 15/01/2025).');
      return;
    }
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
        // rc-mvp: i campi giudiziali (tribunale, RG, giudice, ambito penale,
        // decesso, termini ordinanza, quesiti, CTP, co-CTU) non esistono più
        // in PeriziaMetadata — lo schema zod strict li rifiuterebbe.
        ...(form.ctuName ? { ctuName: form.ctuName } : {}),
        ...(form.ctuTitle ? { ctuTitle: form.ctuTitle } : {}),
        ...(form.specialita ? { specialita: form.specialita } : {}),
        ...(form.alboNumber ? { alboNumber: form.alboNumber } : {}),
        ...(form.ctuEmail ? { ctuEmail: form.ctuEmail } : {}),
        ...(form.ctuPec ? { ctuPec: form.ctuPec } : {}),
        ...(form.collaboratoreName ? { collaboratoreName: form.collaboratoreName } : {}),
        ...(form.collaboratoreTitle ? { collaboratoreTitle: form.collaboratoreTitle } : {}),
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
        ...(excludedSections.length > 0 ? { excludedReportSections: excludedSections } : {}),
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
        // 1.2: salvataggio riuscito → la bozza locale non serve più.
        markSaved();
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
      {/* 1.2: banner di ripristino bozza non salvata */}
      {draftBanner && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm flex-1 min-w-[200px]">
            Trovata una bozza non salvata ({formatDraftAge(draftBanner.savedAt)}). Vuoi ripristinarla?
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={discardDraft}>
              Scarta
            </Button>
            <Button size="sm" onClick={restoreDraft}>
              Ripristina
            </Button>
          </div>
        </div>
      )}

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
                <strong>Tutti i campi sono facoltativi</strong>: puoi premere Prosegui subito e tornare qui quando vuoi. Questi dati vengono inseriti nell&apos;intestazione formale della perizia esportata e nel prompt di generazione. Puoi tornare a compilarli in qualsiasi momento.
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
                  <span className="text-sm font-semibold">
                    {section.id === 'parti' && isStragiudiziale ? 'Il Perito' : section.title}
                  </span>
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
                        <Input value={form.patientFullName} onChange={(e) => setForm({ ...form, patientFullName: e.target.value })} placeholder="es. Mario Esempi" />
                        <p className="text-sm text-muted-foreground mt-1">Apparirà nell&apos;intestazione della perizia</p>
                      </div>
                      <div>
                        <Label>Data di nascita</Label>
                        <Input type="date" value={form.patientDateOfBirth} onChange={(e) => setForm({ ...form, patientDateOfBirth: e.target.value })} />
                      </div>
                    </div>
                    <div>
                      <Label>Indirizzo di residenza</Label>
                      <Input value={form.patientAddress} onChange={(e) => setForm({ ...form, patientAddress: e.target.value })} placeholder="es. via degli Esempi 1, 00000 Città" />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Codice Fiscale</Label>
                        <Input value={form.patientFiscalCode} onChange={(e) => setForm({ ...form, patientFiscalCode: e.target.value.toUpperCase() })} placeholder="es. XXXXXX00X00X000X" maxLength={16} />
                      </div>
                      <div>
                        <Label>Telefono</Label>
                        <Input value={form.patientPhone} onChange={(e) => setForm({ ...form, patientPhone: e.target.value })} placeholder="es. 000 0000000" />
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
                        <p className="text-sm text-muted-foreground mt-1">Il tribunale che ha conferito l&apos;incarico</p>
                      </div>
                      <div>
                        <Label>Sezione</Label>
                        <Input value={form.sezione} onChange={(e) => setForm({ ...form, sezione: e.target.value })} placeholder="es. Sezione Centrale Civile" />
                      </div>
                      <div>
                        <Label>Numero RG</Label>
                        <Input value={form.rgNumber} onChange={(e) => setForm({ ...form, rgNumber: e.target.value })} placeholder="es. 1234/2025" />
                        <p className="text-sm text-muted-foreground mt-1">Numero di Ruolo Generale del procedimento</p>
                      </div>
                    </div>
                    <div>
                      <Label>Tipo di procedimento</Label>
                      <Input value={form.tipoProcedimento ?? ''} onChange={(e) => setForm({ ...form, tipoProcedimento: e.target.value })} placeholder="es. Accertamento tecnico preventivo (ex art. 696 bis c.p.c.)" />
                      <p className="text-sm text-muted-foreground mt-1">Appare nell&apos;intestazione formale (ATP, CTU, ecc.)</p>
                    </div>
                    <div>
                      <Label>Ambito (CTU/CTP)</Label>
                      <div className="flex gap-2 mt-1">
                        <Button type="button" size="sm" variant={form.ambitoPenale ? 'outline' : 'default'} onClick={() => setForm({ ...form, ambitoPenale: false })}>Civile</Button>
                        <Button type="button" size="sm" variant={form.ambitoPenale ? 'default' : 'outline'} onClick={() => setForm({ ...form, ambitoPenale: true })}>Penale</Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Penale: causa dell&apos;evento/morte + profili di colpa, senza ITT/ITP n&eacute; tabelle SIMLA.</p>
                    </div>
                    <div>
                      <Label>Periziando</Label>
                      <div className="flex gap-2 mt-1">
                        <Button type="button" size="sm" variant={form.decesso ? 'outline' : 'default'} onClick={() => setForm({ ...form, decesso: false })}>Vivente</Button>
                        <Button type="button" size="sm" variant={form.decesso ? 'default' : 'outline'} onClick={() => setForm({ ...form, decesso: true })}>Deceduto</Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Deceduto: considerazioni su causa della morte e danno iure proprio/hereditatis (senza ITT/ITP), operazioni peritali senza visita.</p>
                    </div>
                    <div>
                      <Label>Oggetto dell&apos;incarico (opzionale)</Label>
                      <Input value={form.oggettoIncarico} onChange={(e) => setForm({ ...form, oggettoIncarico: e.target.value })} placeholder="es. alla vicenda clinica e alle cause del decesso" />
                      <p className="text-sm text-muted-foreground mt-1">Sostituisce &quot;alla vicenda clinica&quot; nel conferimento. Inizia con la preposizione (&quot;alla...&quot;, &quot;alle...&quot;).</p>
                    </div>
                    <div>
                      <Label>Provvedimenti dell&apos;ordinanza (opzionale)</Label>
                      <Textarea
                        value={form.provvedimentiOrdinanza}
                        onChange={(e) => setForm({ ...form, provvedimentiOrdinanza: e.target.value })}
                        placeholder={'es. Il Giudice autorizza il CTU ad acquisire documentazione presso le strutture sanitarie e ad avvalersi di ausiliari...'}
                        className="min-h-[80px] text-sm mt-1"
                      />
                      <p className="text-sm text-muted-foreground mt-1">Autorizzazioni e istruzioni dell&apos;ordinanza riprodotte nell&apos;intestazione (es. liquidazione ex D.P.R. 115/2002)</p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Giudice</Label>
                        <Input value={form.judgeName} onChange={(e) => setForm({ ...form, judgeName: e.target.value })} placeholder="es. Dott. Mario Esempi" />
                      </div>
                      <div>
                        <Label>Qualifica giudice</Label>
                        <Input value={form.giudiceQualifica} onChange={(e) => setForm({ ...form, giudiceQualifica: e.target.value })} placeholder="es. Giudice Delegato / Giudice Istruttore" />
                        <p className="text-sm text-muted-foreground mt-1">Se vuoto: &quot;Giudice Delegato&quot; per ATP, &quot;Giudice Istruttore&quot; altrimenti</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Fondo spese</Label>
                        <Input value={form.fondoSpese} onChange={(e) => setForm({ ...form, fondoSpese: e.target.value })} placeholder="es. Euro 1.800,00" />
                        <p className="text-sm text-muted-foreground mt-1">Importo stanziato dal giudice per le spese peritali</p>
                      </div>
                    </div>
                  </div>
                )}

                {section.id === 'parti' && (
                  <div className="space-y-4">
                    {peritoPrefilled && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        Dati professionista precompilati dall&apos;ultimo caso — modificali se serve.
                      </p>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>CTU (nome)</Label>
                        <Input value={form.ctuName} onChange={(e) => setForm({ ...form, ctuName: e.target.value })} placeholder="es. Dott. Mario Esempi" />
                        <p className="text-sm text-muted-foreground mt-1">Nome completo del Consulente Tecnico d&apos;Ufficio</p>
                      </div>
                      <div>
                        <Label>Qualifica CTU</Label>
                        <Input value={form.ctuTitle} onChange={(e) => setForm({ ...form, ctuTitle: e.target.value })} placeholder="es. medico legale presso..." />
                        <p className="text-sm text-muted-foreground mt-1">Specializzazione e affiliazione professionale</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Specialita</Label>
                        <Input value={form.specialita ?? ''} onChange={(e) => setForm({ ...form, specialita: e.target.value })} placeholder="es. Specialista in Ortopedia; Specialista in Medicina Legale" />
                        <p className="text-sm text-muted-foreground mt-1">Specializzazioni del perito (separale con ; per andare a capo nella carta intestata)</p>
                      </div>
                      <div>
                        <Label>N. Iscrizione Albo</Label>
                        <Input value={form.alboNumber ?? ''} onChange={(e) => setForm({ ...form, alboNumber: e.target.value })} placeholder="es. 12345 - Ordine Medici di Verona" />
                        <p className="text-sm text-muted-foreground mt-1">Numero di iscrizione all&apos;Albo professionale</p>
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>E-mail perito</Label>
                        <Input value={form.ctuEmail ?? ''} onChange={(e) => setForm({ ...form, ctuEmail: e.target.value })} placeholder="es. nome@studio.it" />
                        <p className="text-sm text-muted-foreground mt-1">Mostrata nella carta intestata</p>
                      </div>
                      <div>
                        <Label>PEC perito</Label>
                        <Input value={form.ctuPec ?? ''} onChange={(e) => setForm({ ...form, ctuPec: e.target.value })} placeholder="es. nome@pec.omceo..." />
                        <p className="text-sm text-muted-foreground mt-1">Posta elettronica certificata</p>
                      </div>
                    </div>
                    {/* Ausiliario / Co-CTU / parti / CTP: solo ambito giudiziario (CTU/CTP) */}
                    {!isStragiudiziale && (
                    <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Ausiliario (nome)</Label>
                        <Input value={form.collaboratoreName ?? ''} onChange={(e) => setForm({ ...form, collaboratoreName: e.target.value })} placeholder="es. Dott.ssa Anna Esempi" />
                        <p className="text-sm text-muted-foreground mt-1">Specialista che assiste il CTU (se nominato)</p>
                      </div>
                      <div>
                        <Label>Ausiliario (specializzazione)</Label>
                        <Input value={form.collaboratoreTitle ?? ''} onChange={(e) => setForm({ ...form, collaboratoreTitle: e.target.value })} placeholder="es. Specialista in Neurologia" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Co-CTU / Collegio (nome)</Label>
                        <Input value={form.coCtuName ?? ''} onChange={(e) => setForm({ ...form, coCtuName: e.target.value })} placeholder="es. Prof. Secondo Perito" />
                        <p className="text-sm text-muted-foreground mt-1">Secondo perito PARITETICO del collegio (conferimento plurale e firma collegiale). Diverso dall&apos;ausiliario.</p>
                      </div>
                      <div>
                        <Label>Co-CTU (qualifica)</Label>
                        <Input value={form.coCtuTitle ?? ''} onChange={(e) => setForm({ ...form, coCtuTitle: e.target.value })} placeholder="es. specialista in Cardiologia" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>Parte Ricorrente</Label>
                        <Input value={form.parteRicorrente} onChange={(e) => setForm({ ...form, parteRicorrente: e.target.value })} placeholder="Nome parte ricorrente" />
                      </div>
                      <div>
                        <Label>Parte Resistente</Label>
                        <Input value={form.parteResistente} onChange={(e) => setForm({ ...form, parteResistente: e.target.value })} placeholder="es. Azienda Ospedaliera di Esempio" />
                      </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label>CTP Ricorrente</Label>
                        <Input value={form.ctpRicorrente} onChange={(e) => setForm({ ...form, ctpRicorrente: e.target.value })} placeholder="es. Dott.ssa Anna Esempi" />
                      </div>
                      <div>
                        <Label>CTP Resistente</Label>
                        <Input value={form.ctpResistente} onChange={(e) => setForm({ ...form, ctpResistente: e.target.value })} placeholder="es. Dott. Paolo Esempi" />
                      </div>
                    </div>
                    </>
                    )}
                  </div>
                )}

                {section.id === 'date' && (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <HeaderDateInput
                      label="Data conferimento incarico"
                      value={form.dataIncarico}
                      onChange={(t) => setForm({ ...form, dataIncarico: t })}
                    />
                    <HeaderDateInput
                      label="Data inizio operazioni"
                      value={form.dataOperazioni}
                      onChange={(t) => setForm({ ...form, dataOperazioni: t })}
                    />
                    <HeaderDateInput
                      label="Termine bozza ai CC.TT.P."
                      hint="Termine per l'inoltro della bozza ai consulenti di parte"
                      value={form.termineBozza}
                      onChange={(t) => setForm({ ...form, termineBozza: t })}
                    />
                    <HeaderDateInput
                      label="Termine osservazioni CC.TT.P."
                      value={form.termineOsservazioni}
                      onChange={(t) => setForm({ ...form, termineOsservazioni: t })}
                    />
                    <HeaderDateInput
                      label="Termine deposito"
                      value={form.dataDeposito}
                      onChange={(t) => setForm({ ...form, dataDeposito: t })}
                    />
                  </div>
                )}

                {section.id === 'esameObiettivo' && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Inserisci i risultati dell&apos;esame obiettivo eseguito durante la visita medico-legale. Queste informazioni appariranno nella sezione &quot;Visita del Periziando&quot; del report.
                    </p>
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
                        disabled={!newQuesito.trim() || quesiti.length >= 20}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Aggiungi quesito
                      </Button>
                    </div>
                  </div>
                )}

                {section.id === 'ilFatto' && (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Ricostruzione dell&apos;evento e dell&apos;iter clinico, scritta da te. Questo testo appare nel report nella sezione &quot;Il Fatto e la Storia Clinica&quot; senza essere rielaborato dall&apos;AI.
                    </p>
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
                      placeholder="es. Nega familiarità per patologie di rilievo..."
                      value={form.anamnesiFamiliare}
                      onChange={(t) => setForm({ ...form, anamnesiFamiliare: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi fisiologica"
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
                      placeholder="es. Pregressa frattura del polso sx (2015); ipertensione arteriosa in terapia..."
                      value={form.anamnesiPatologicaRemota}
                      onChange={(t) => setForm({ ...form, anamnesiPatologicaRemota: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi patologica prossima"
                      placeholder="es. In data ... a seguito di ... lamenta..."
                      value={form.anamnesiPatologicaProssima}
                      onChange={(t) => setForm({ ...form, anamnesiPatologicaProssima: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi farmacologica"
                      placeholder="es. Assume ...; nega allergie note a farmaci"
                      value={form.anamnesiFarmacologica}
                      onChange={(t) => setForm({ ...form, anamnesiFarmacologica: t })}
                    />
                    <AnamnesiTextarea
                      label="Anamnesi lavorativa"
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
          {isDirty
            ? 'Modifiche non salvate — premi Prosegui per salvarle (bozza locale attiva)'
            : 'Puoi tornare a compilare in qualsiasi momento'}
        </p>
      </div>
    </div>
  );
}
