/**
 * Overlay DETERMINISTICO dei metadati perizia sull'intestazione (audit
 * 2026-09-10, invariante I8 e reperti Fase 1): ciò che il perito ha scritto nel
 * form (data del sinistro, propri dati di carta intestata, anagrafica del
 * periziando) arriva sulla carta SEMPRE e tale e quale, mai passando dal
 * modello, che poteva ometterlo, storpiarlo o lasciarlo null. Il modello resta
 * la fonte solo per ciò che il perito non ha scritto. Pura, idempotente.
 */
import type { HeaderData } from './header-schema';
import type { CaseType, PeriziaMetadata } from '@/types';

/** DD/MM/YYYY da DD/MM/YYYY, DD.MM.YYYY, DD-MM-YYYY o ISO; null se non è una data. */
export function toItalianDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  let d: number; let m: number; let y: number;
  const it = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (it) { d = Number(it[1]); m = Number(it[2]); y = Number(it[3]); }
  else if (iso) { y = Number(iso[1]); m = Number(iso[2]); d = Number(iso[3]); }
  else return null;
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

function nonEmpty(value: string | null | undefined): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  return v.length > 0 ? v : null;
}

/** Ambito dal tipo caso scelto dal perito, usato solo se il modello non lo ha dato. */
export function ambitoFromCaseType(caseType: CaseType | string | null | undefined): HeaderData['oggetto']['ambito'] {
  switch (caseType) {
    case 'rc_auto':
    case 'generica':
      return 'rc_civile';
    case 'ortopedica':
    case 'oncologica':
    case 'ostetrica':
    case 'anestesiologica':
    case 'infezione_nosocomiale':
    case 'errore_diagnostico':
      return 'malpractice';
    default:
      return null;
  }
}

export function applyPeriziaMetadataToHeader(
  data: HeaderData,
  meta: PeriziaMetadata | null | undefined,
  caseType?: CaseType | string | null,
): HeaderData {
  const m = meta ?? {};
  const perito = {
    ...(data.perito ?? { nome: null, qualifica: null, specializzazione: null, iscrizioneAlbo: null }),
  };
  const ctuName = nonEmpty(m.ctuName);
  if (ctuName) perito.nome = ctuName;
  const ctuTitle = nonEmpty(m.ctuTitle);
  if (ctuTitle) perito.qualifica = ctuTitle;
  const specialita = nonEmpty(m.specialita);
  if (specialita) perito.specializzazione = specialita;
  const albo = nonEmpty(m.alboNumber);
  if (albo) perito.iscrizioneAlbo = albo;
  const email = nonEmpty(m.ctuEmail);
  if (email) perito.email = email;
  const pec = nonEmpty(m.ctuPec);
  if (pec) perito.pec = pec;
  const hasPerito = Boolean(perito.nome || perito.qualifica || perito.specializzazione || perito.iscrizioneAlbo || perito.email || perito.pec);

  const paziente = { ...data.paziente };
  const nome = nonEmpty(m.patientFullName);
  if (nome) paziente.nome = nome;
  const dob = toItalianDate(m.patientDateOfBirth);
  if (dob) paziente.dataNascita = dob;
  const residenza = nonEmpty(m.patientAddress);
  if (residenza) paziente.residenza = residenza;
  const cf = nonEmpty(m.patientFiscalCode);
  if (cf) paziente.codiceFiscale = cf.toUpperCase();
  const tel = nonEmpty(m.patientPhone);
  if (tel) paziente.telefono = tel;

  const oggetto = { ...data.oggetto };
  const sinistro = toItalianDate(m.dataSinistro);
  if (sinistro) oggetto.dataEvento = sinistro;
  if (!oggetto.ambito) oggetto.ambito = ambitoFromCaseType(caseType);

  return { ...data, perito: hasPerito ? perito : data.perito, paziente, oggetto };
}
