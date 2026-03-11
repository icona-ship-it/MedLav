'use client';

import { useState, useMemo } from 'react';
import { Eye } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  formatEsameObiettivo,
  type DistrictData,
  type GeneralInfo,
} from '@/lib/esame-obiettivo-formatter';

const DEFAULT_DISTRICTS: DistrictData[] = [
  { id: 'capo_collo', label: 'Capo/Collo', examined: false, findings: '' },
  { id: 'torace', label: 'Torace', examined: false, findings: '' },
  { id: 'addome', label: 'Addome', examined: false, findings: '' },
  { id: 'arto_sup_dx', label: 'Arto Superiore DX', examined: false, findings: '' },
  { id: 'arto_sup_sx', label: 'Arto Superiore SX', examined: false, findings: '' },
  { id: 'arto_inf_dx', label: 'Arto Inferiore DX', examined: false, findings: '' },
  { id: 'arto_inf_sx', label: 'Arto Inferiore SX', examined: false, findings: '' },
  { id: 'colonna', label: 'Colonna Vertebrale', examined: false, findings: '' },
  { id: 'bacino', label: 'Bacino', examined: false, findings: '' },
  { id: 'cute_cicatrici', label: 'Cute/Cicatrici', examined: false, findings: '' },
  { id: 'esame_neuro', label: 'Esame Neurologico', examined: false, findings: '' },
  { id: 'note_generali', label: 'Note Generali', examined: false, findings: '' },
];

export interface EsameObiettivoStructured {
  districts: DistrictData[];
  generalInfo?: GeneralInfo;
}

interface EsameObiettivoFormProps {
  value: EsameObiettivoStructured | null;
  freeText: string;
  onChange: (structured: EsameObiettivoStructured, formattedText: string) => void;
  onFreeTextChange: (text: string) => void;
}

export function EsameObiettivoForm({
  value, freeText, onChange, onFreeTextChange,
}: EsameObiettivoFormProps) {
  const [useFreeText, setUseFreeText] = useState(!value && !!freeText);
  const [showPreview, setShowPreview] = useState(false);

  const [districts, setDistricts] = useState<DistrictData[]>(
    value?.districts ?? DEFAULT_DISTRICTS.map((d) => ({ ...d })),
  );
  const [generalInfo, setGeneralInfo] = useState<GeneralInfo>(
    value?.generalInfo ?? {},
  );

  const formattedText = useMemo(
    () => formatEsameObiettivo(districts, generalInfo),
    [districts, generalInfo],
  );

  const handleDistrictToggle = (id: string) => {
    const updated = districts.map((d) =>
      d.id === id ? { ...d, examined: !d.examined } : d,
    );
    setDistricts(updated);
    onChange({ districts: updated, generalInfo }, formatEsameObiettivo(updated, generalInfo));
  };

  const handleDistrictFindings = (id: string, findings: string) => {
    const updated = districts.map((d) =>
      d.id === id ? { ...d, findings } : d,
    );
    setDistricts(updated);
    onChange({ districts: updated, generalInfo }, formatEsameObiettivo(updated, generalInfo));
  };

  const handleGeneralInfoChange = (field: keyof GeneralInfo, val: string) => {
    const updated = { ...generalInfo, [field]: val };
    setGeneralInfo(updated);
    onChange({ districts, generalInfo: updated }, formatEsameObiettivo(districts, updated));
  };

  const examinedCount = districts.filter((d) => d.examined).length;

  if (useFreeText) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Esame Obiettivo (testo libero)</Label>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setUseFreeText(false)}
          >
            Passa a modalità strutturata
          </button>
        </div>
        <Textarea
          rows={6}
          value={freeText}
          onChange={(e) => onFreeTextChange(e.target.value)}
          placeholder="Inserisci i dati dell'esame obiettivo..."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label>Esame Obiettivo Strutturato</Label>
          <Badge variant="secondary" className="text-xs">{examinedCount} distretti esaminati</Badge>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="h-3 w-3" />{showPreview ? 'Nascondi' : 'Anteprima'}
          </button>
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() => setUseFreeText(true)}
          >
            Passa a testo libero
          </button>
        </div>
      </div>

      {/* General info */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Altezza (cm)</Label>
          <Input
            value={generalInfo.altezza ?? ''}
            onChange={(e) => handleGeneralInfoChange('altezza', e.target.value)}
            placeholder="170"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Peso (kg)</Label>
          <Input
            value={generalInfo.peso ?? ''}
            onChange={(e) => handleGeneralInfoChange('peso', e.target.value)}
            placeholder="75"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Deambulazione</Label>
          <Input
            value={generalInfo.deambulazione ?? ''}
            onChange={(e) => handleGeneralInfoChange('deambulazione', e.target.value)}
            placeholder="Autonoma / con ausili"
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs">Condizioni generali</Label>
          <Input
            value={generalInfo.condizioni ?? ''}
            onChange={(e) => handleGeneralInfoChange('condizioni', e.target.value)}
            placeholder="Buone / Discrete"
            className="h-8 text-sm"
          />
        </div>
      </div>

      {/* Districts */}
      <div className="grid gap-2 sm:grid-cols-2">
        {districts.map((district) => (
          <div key={district.id} className="rounded-md border p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={district.examined}
                onChange={() => handleDistrictToggle(district.id)}
                className="rounded"
              />
              <span className="text-sm font-medium">{district.label}</span>
            </label>
            {district.examined && (
              <Textarea
                className="mt-2 min-h-[60px] text-sm"
                value={district.findings}
                onChange={(e) => handleDistrictFindings(district.id, e.target.value)}
                placeholder={`Reperti ${district.label.toLowerCase()}...`}
                rows={2}
              />
            )}
          </div>
        ))}
      </div>

      {/* Preview */}
      {showPreview && examinedCount > 0 && (
        <div className="rounded-md border bg-muted/30 p-4">
          <p className="text-xs font-medium text-muted-foreground mb-2">Anteprima testo generato:</p>
          <p className="whitespace-pre-wrap text-sm">{formattedText}</p>
        </div>
      )}
    </div>
  );
}
