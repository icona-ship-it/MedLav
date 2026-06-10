import type { CausalNexusCriteria } from './types';

export const CAUSAL_NEXUS_CRITERIA: readonly CausalNexusCriteria[] = [
  {
    name: 'Condicio sine qua non (test "ma per")',
    description: 'Il danno non si sarebbe verificato "se non per" la condotta del sanitario. Si valuta se, eliminando mentalmente la condotta censurabile, il danno si sarebbe comunque prodotto.',
    legalReferences: [
      'Art. 40 c.p. (rapporto di causalità)',
      'Art. 41 c.p. (concorso di cause)',
    ],
    whenToApply: 'Test base per ogni valutazione di nesso causale. Applicare sempre come primo step.',
  },
  {
    name: 'Perdita di chance',
    description: 'Anche se non è certo che la condotta corretta avrebbe evitato il danno, la condotta errata ha privato il paziente di una chance concreta di guarigione o miglioramento. Si valuta la probabilità perduta, non la certezza dell\'esito.',
    legalReferences: [
      'Cass. civ. SU n. 576/2008 (riconoscimento perdita di chance come danno autonomo)',
      'Cass. civ. n. 21619/2007 (chance come bene giuridicamente rilevante)',
    ],
    whenToApply: 'Quando il nesso causale diretto non è dimostrabile con certezza ma esiste una probabilità concreta (anche < 50%) che una diagnosi/trattamento tempestivo avrebbe migliorato l\'esito. Particolarmente rilevante in ambito oncologico e diagnostico.',
  },
  {
    name: 'Causalità proporzionale ("più probabile che non")',
    description: 'In ambito civilistico il nesso causale si accerta con il criterio del "più probabile che non" (> 50% di probabilità), diversamente dal penale che richiede la certezza "oltre ogni ragionevole dubbio".',
    legalReferences: [
      // Citazione corretta (scorecard 2026-06-10): la 30328/2002 è Cass. PENALE
      // SS.UU. (sent. Franzese, standard "oltre ogni ragionevole dubbio") — il
      // criterio civilistico del "più probabile che non" è delle SS.UU. civili 2008.
      'Cass. civ. SU n. 576/2008 e n. 581/2008 (criterio civilistico del "più probabile che non")',
      'Cass. pen. SU n. 30328/2002 (sent. Franzese — standard PENALE "oltre ogni ragionevole dubbio", richiamata a contrasto)',
    ],
    whenToApply: 'Standard probatorio da applicare in tutte le valutazioni civilistiche. In sede penale il criterio è più rigoroso.',
  },
  {
    name: 'Causalità adeguata',
    description: 'La condotta censurabile era idonea, secondo l\'id quod plerumque accidit (ciò che generalmente accade), a produrre il tipo di danno verificatosi. Si esclude il nesso se il danno è una conseguenza del tutto imprevedibile e anomala.',
    legalReferences: [
      'Art. 1223 c.c. (risarcimento: danno emergente e lucro cessante)',
      'Art. 1227 c.c. (concorso del fatto colposo del creditore)',
    ],
    whenToApply: 'Per verificare che il danno rientri nella tipologia di rischi prevedibili collegati alla condotta. Esclude nessi causali aberranti.',
  },
  {
    name: 'Concause',
    description: 'Valutazione delle concause preesistenti (patologie pregresse), simultanee (concomitanti) e sopravvenute (successive alla condotta). Le concause non interrompono il nesso causale a meno che non siano da sole sufficienti a determinare l\'evento (causa sopravvenuta autonoma).',
    legalReferences: [
      'Art. 41 c.p. comma 2 (concorso di cause: irrilevanza concause salvo causa sopravvenuta sufficiente)',
      'Cass. civ. n. 15991/2011 (concause e ripartizione responsabilità)',
    ],
    whenToApply: 'Quando il paziente presenta patologie preesistenti o fattori di rischio che possono aver contribuito al danno. Fondamentale per la quantificazione del danno attribuibile.',
  },
] as const;

/**
 * Format causal nexus criteria as text for prompt injection.
 */
export function formatCausalNexusForPrompt(): string {
  return CAUSAL_NEXUS_CRITERIA
    .map((c) => `- **${c.name}**: ${c.description}\n  Riferimenti: ${c.legalReferences.join('; ')}\n  Applicare quando: ${c.whenToApply}`)
    .join('\n\n');
}
