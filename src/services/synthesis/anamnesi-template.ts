/**
 * Renderizza la sezione "Dati Anamnestici" dai campi compilati dal perito
 * nel form info-perizia (perizie RC medico-legali).
 *
 * **Contratto**: come `header-template.ts`, ciò che il perito inserisce è
 * DETERMINISTICO — l'AI non lo narra né lo reinventa. Le sottosezioni vuote
 * sono OMESSE (no testo inventato). Se nessun dato è presente, ritorna stringa
 * vuota e il caller (resolveSectionPlan) lascia la sezione alla generazione LLM.
 *
 * Funzioni pure: nessun side-effect, nessuna dipendenza da data/ora.
 */

import type { PeriziaMetadata } from '@/types';

export interface BmiResult {
  /** BMI arrotondato a 1 decimale (kg / m²) */
  value: number;
  /** Categoria OMS in italiano */
  category: string;
}

/**
 * Calcola il BMI (kg / m²) e la categoria OMS.
 * Ritorna null se peso o altezza mancano o non sono validi (≤ 0 / non finiti).
 */
export function computeBMI(pesoKg?: number, altezzaCm?: number): BmiResult | null {
  if (!isPositiveFinite(pesoKg) || !isPositiveFinite(altezzaCm)) {
    return null;
  }
  const meters = altezzaCm / 100;
  const raw = pesoKg / (meters * meters);
  if (!Number.isFinite(raw)) return null;
  const value = Math.round(raw * 10) / 10;
  return { value, category: bmiCategory(value) };
}

function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'sottopeso';
  if (bmi < 25) return 'normopeso';
  if (bmi < 30) return 'sovrappeso';
  if (bmi < 35) return 'obesità di I grado';
  if (bmi < 40) return 'obesità di II grado';
  return 'obesità di III grado';
}

interface AnamnesiSub {
  heading: string;
  value?: string;
}

/**
 * Renderizza il markdown del CORPO della sezione Anamnesi dai campi del perito.
 * Il titolo della sezione ("## Dati Anamnestici") è aggiunto a valle dall'assembler;
 * qui produciamo solo le sottosezioni valorizzate.
 * Ritorna stringa vuota se non c'è alcun dato.
 */
export function renderAnamnesiMarkdown(pm: PeriziaMetadata): string {
  const subs: AnamnesiSub[] = [
    { heading: 'Anamnesi familiare', value: pm.anamnesiFamiliare },
    { heading: 'Anamnesi fisiologica', value: renderFisiologica(pm) },
    { heading: 'Anamnesi patologica remota', value: pm.anamnesiPatologicaRemota },
    { heading: 'Anamnesi patologica prossima', value: pm.anamnesiPatologicaProssima },
    { heading: 'Anamnesi farmacologica', value: pm.anamnesiFarmacologica },
    { heading: 'Anamnesi lavorativa', value: pm.anamnesiLavorativa },
  ];

  const blocks: string[] = [];
  for (const sub of subs) {
    const text = sub.value?.trim();
    if (text) {
      blocks.push(`**${sub.heading}**\n\n${text}`);
    }
  }

  return blocks.join('\n\n');
}

/**
 * Anamnesi fisiologica: testo libero del perito + riga antropometrica
 * (peso / altezza / BMI) calcolata in modo deterministico.
 */
function renderFisiologica(pm: PeriziaMetadata): string | undefined {
  const parts: string[] = [];

  const text = pm.anamnesiFisiologica?.trim();
  if (text) parts.push(text);

  const anthro: string[] = [];
  if (isPositiveFinite(pm.pesoKg)) anthro.push(`Peso ${formatNum(pm.pesoKg)} kg`);
  if (isPositiveFinite(pm.altezzaCm)) anthro.push(`Altezza ${formatNum(pm.altezzaCm)} cm`);
  const bmi = computeBMI(pm.pesoKg, pm.altezzaCm);
  if (bmi) anthro.push(`BMI ${formatNum(bmi.value)} (${bmi.category})`);
  if (anthro.length > 0) parts.push(anthro.join(' · '));

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function isPositiveFinite(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function formatNum(n: number): string {
  // Italiano: virgola decimale, niente decimali superflui
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
}
