/** Prova a secco pre-demo (2026-06-10): per ogni modulo del focus stampa il
 * piano sezioni risolto (titolo, LLM/placeholder/deterministico) con metadati
 * e eventi campione. Solo lettura, zero API. */
import { resolveSectionPlan } from '../src/services/synthesis/section-catalog';
import { moduleToRole, moduleToCaseTypes } from '../src/types/modules';
import type { ModuleId } from '../src/types/modules';
import type { ConsolidatedEvent } from '../src/services/consolidation/event-consolidator';
import type { PeriziaMetadata } from '../src/types';

const FOCUS: ModuleId[] = [
  'perizia_ml_rc_civile', 'perizia_ml_infortuni', 'perizia_ml_malattia',
  'ctu_civile_rc_civile', 'ctu_civile_resp_prof',
];

const ev = (over: Partial<ConsolidatedEvent>): ConsolidatedEvent => ({
  orderNumber: 1, documentId: 'd1', eventDate: '2025-04-10', datePrecision: 'giorno',
  eventType: 'visita', title: 'Visita', description: 'x', sourceType: 'cartella_clinica',
  diagnosis: null, doctor: null, facility: null, confidence: 90, requiresVerification: false,
  reliabilityNotes: null, sourceText: 'x', sourcePages: [1], discrepancyNote: null, ...over,
} as ConsolidatedEvent);

const pm: PeriziaMetadata = {
  tribunale: 'Tribunale Ordinario di Verona', sezione: 'Seconda Civile', rgNumber: '1234/2026',
  tipoProcedimento: 'Accertamento tecnico preventivo (ex art. 696 bis c.p.c.)',
  judgeName: 'Dott. Mario Esempi', ctuName: 'Dott.ssa Anna Esempi', ctuTitle: 'medico legale',
  quesiti: ['Accerti il CTU le lesioni patite e tenti la conciliazione.'],
  collaboratoreName: 'Dr. Aldo Esempi', ctpRicorrente: 'Dott. B. Esempi',
};

for (const mod of FOCUS) {
  const caseRole = moduleToRole(mod) ?? 'stragiudiziale';
  const caseTypes = moduleToCaseTypes(mod);
  const plan = resolveSectionPlan({
    caseType: caseTypes[0], caseTypes, caseRole, periziaMetadata: pm,
    events: [ev({}), ev({ eventType: 'spesa_medica', title: 'Fattura n. 1/2026, € 100,00' }), ev({ eventType: 'documento_amministrativo' })],
    documentTypes: ['cartella_clinica', 'memoria_difensiva', 'perizia_ctp'],
    moduleId: mod,
  });
  console.log(`\n══ ${mod} (ruolo: ${caseRole}, tipo: ${caseTypes[0]}) — ${plan.length} sezioni`);
  for (const s of plan) {
    const kind = s.isPlaceholder
      ? (s.placeholderText?.includes('MEDLAV:') ? 'DETERMINISTICO' : 'placeholder perito')
      : 'LLM';
    console.log(`  ${String(plan.indexOf(s) + 1).padStart(2)}. ${s.title}  [${kind}]`);
  }
}
