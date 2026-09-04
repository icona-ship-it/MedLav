/**
 * Policy "passaggi-chiave per rubrica" (2026-09-04): per ogni tipo di documento
 * clinico, QUALI rubriche del medico la perizia riporta per intero, quali
 * omette, e il tetto di parole. Deriva dai gold del perito Lavini (specifica
 * `scratchpad/spec-doc-sanitaria-lavini-2026-09-04.md`, da lui da confermare);
 * i default qui sotto sono la nostra lettura dei suoi gold e restano
 * SOVRASCRIVIBILI da una policy caricata (JSON) senza toccare il codice.
 * Nessun dato reale: solo etichette.
 */

export type RubricMode = 'passaggi' | 'integrale' | 'una_riga' | 'ometti';

export interface RubricTypePolicy {
  mode: RubricMode;
  /** Rubriche da copiare, in quest'ordine (chiavi del parser). */
  copia: ReadonlyArray<string>;
  /** Se nessuna rubrica di `copia` è presente: copia il corpo/preambolo intero (true) o niente (false). */
  fallbackCorpo: boolean;
  /** Tetto di parole PER RUBRICA (0 = nessun tetto). Oltre: taglio su confine di frase con "[...]". */
  maxParole: number;
}

export interface RubricPolicy {
  version: string;
  tipi: Readonly<Record<string, RubricTypePolicy>>;
  /** Tipo di documento usato quando quello classificato manca dalla policy. */
  tipoDefault: string;
}

const KEY_CLINICAL: ReadonlyArray<string> = ['diagnosi', 'conclusioni', 'prognosi', 'indicazioni'];

export const DEFAULT_RUBRIC_POLICY: RubricPolicy = {
  version: '2026-09-04-default',
  tipoDefault: 'referto_specialistico',
  tipi: {
    // Verbale di Pronto Soccorso / cartella: diagnosi + dimissione + prognosi (+ intervento se c'è).
    // Triage, parametri, laboratorio, consensi, diario infermieristico: MAI.
    cartella_clinica: { mode: 'passaggi', copia: ['anamnesi_prossima', 'esame_obiettivo', 'intervento', 'diagnosi', 'dimissione', 'prognosi', 'indicazioni', 'terapia'], fallbackCorpo: false, maxParole: 400 },
    lettera_dimissione: { mode: 'passaggi', copia: ['anamnesi_prossima', 'intervento', 'diario', 'diagnosi', 'dimissione', 'prognosi', 'indicazioni', 'terapia'], fallbackCorpo: true, maxParole: 350 },
    referto_specialistico: { mode: 'passaggi', copia: ['anamnesi_prossima', 'esame_obiettivo', 'diagnosi', 'conclusioni', 'prognosi', 'indicazioni', 'terapia'], fallbackCorpo: true, maxParole: 300 },
    // Esami strumentali: il referto per intero (sono brevi), con le conclusioni.
    esame_strumentale: { mode: 'integrale', copia: ['referto', 'conclusioni', 'corpo'], fallbackCorpo: true, maxParole: 250 },
    esame_laboratorio: { mode: 'ometti', copia: [], fallbackCorpo: false, maxParole: 0 },
    certificato: { mode: 'una_riga', copia: ['prognosi', 'diagnosi'], fallbackCorpo: false, maxParole: 60 },
    altro: { mode: 'passaggi', copia: KEY_CLINICAL, fallbackCorpo: false, maxParole: 200 },
  },
};

/** Tipi di documento che NON entrano mai nella sezione (hanno sezioni proprie). */
export const RUBRIC_EXCLUDED_DOC_TYPES: ReadonlySet<string> = new Set([
  'spese_mediche', 'memoria_difensiva', 'perizia_precedente', 'perizia_ctp', 'perizia_ctu',
]);

export function policyForType(policy: RubricPolicy, documentType: string | null | undefined): RubricTypePolicy {
  const key = documentType && policy.tipi[documentType] ? documentType : policy.tipoDefault;
  return policy.tipi[key] ?? policy.tipi[policy.tipoDefault]!;
}

/** Valida e carica una policy da oggetto (es. JSON): campi mancanti → default. Puro. */
export function loadRubricPolicy(raw: unknown): RubricPolicy {
  if (!raw || typeof raw !== 'object') return DEFAULT_RUBRIC_POLICY;
  const obj = raw as Record<string, unknown>;
  const tipiRaw = (obj.tipi && typeof obj.tipi === 'object') ? obj.tipi as Record<string, unknown> : {};
  const tipi: Record<string, RubricTypePolicy> = { ...DEFAULT_RUBRIC_POLICY.tipi };
  for (const [tipo, v] of Object.entries(tipiRaw)) {
    if (!v || typeof v !== 'object') continue;
    const t = v as Record<string, unknown>;
    const base = tipi[tipo] ?? DEFAULT_RUBRIC_POLICY.tipi[DEFAULT_RUBRIC_POLICY.tipoDefault]!;
    const mode = t.mode;
    tipi[tipo] = {
      mode: mode === 'passaggi' || mode === 'integrale' || mode === 'una_riga' || mode === 'ometti' ? mode : base.mode,
      copia: Array.isArray(t.copia) ? t.copia.filter((x): x is string => typeof x === 'string') : base.copia,
      fallbackCorpo: typeof t.fallbackCorpo === 'boolean' ? t.fallbackCorpo : base.fallbackCorpo,
      maxParole: typeof t.maxParole === 'number' && t.maxParole >= 0 ? t.maxParole : base.maxParole,
    };
  }
  return {
    version: typeof obj.version === 'string' ? obj.version : DEFAULT_RUBRIC_POLICY.version,
    tipoDefault: typeof obj.tipoDefault === 'string' && tipi[obj.tipoDefault] ? obj.tipoDefault : DEFAULT_RUBRIC_POLICY.tipoDefault,
    tipi,
  };
}
