/**
 * Anonymization service for medico-legal reports.
 * Removes PII (codice fiscale, phone, email, names) from text.
 * GDPR Art. 9 compliant.
 */

import type { PeriziaMetadata } from '@/types';

export interface AnonymizationResult {
  anonymizedText: string;
  replacementCount: number;
  replacements: Array<{ original: string; replacement: string; type: string }>;
}

/**
 * Italian Codice Fiscale pattern.
 * Format: 6 letters + 2 digits + 1 letter + 2 digits + 1 letter + 3 digits + 1 letter
 */
const CF_REGEX = /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi;

/**
 * Italian phone numbers: +39, 0XX, 3XX patterns.
 */
const PHONE_REGEX = /(?:\+39\s?)?(?:0\d{1,4}[\s.-]?\d{4,8}|3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})/g;

/**
 * Email addresses.
 */
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/**
 * Professional titles followed by a capitalized name (Dott./Prof./Sig. etc.)
 * Matches: "Dott. Mario Rossi", "Prof.ssa Anna Bianchi", "Sig. Giovanni Verdi"
 */
const TITLE_NAME_REGEX = /(?:Dott\.?(?:ssa|\.ssa)?|Prof\.?(?:ssa|\.ssa)?|Sig\.?(?:ra|\.ra)?|Avv\.?|Ing\.?)\s+[A-Z][a-zàèéìòù]+(?:\s+[A-Z][a-zàèéìòù]+){0,2}/g;

/**
 * Anonymize text by replacing PII with placeholders.
 * Optionally uses perizia metadata to replace specific names.
 */
export function anonymizeText(params: {
  text: string;
  periziaMetadata?: PeriziaMetadata;
}): AnonymizationResult {
  const { text, periziaMetadata } = params;
  let result = text;
  const replacements: AnonymizationResult['replacements'] = [];

  // 1. Replace specific names from perizia metadata first (most accurate)
  if (periziaMetadata) {
    const nameReplacements = buildNameReplacements(periziaMetadata);
    for (const { name, replacement } of nameReplacements) {
      if (name && name.length > 2) {
        const escaped = escapeRegex(name);
        const nameRegex = new RegExp(escaped, 'gi');
        const matches = result.match(nameRegex);
        if (matches) {
          for (const match of matches) {
            replacements.push({ original: match, replacement, type: 'nome_parte' });
          }
          result = result.replace(nameRegex, replacement);
        }
      }
    }
  }

  // 2. Codice Fiscale
  result = replaceWithTracking(result, CF_REGEX, '[CF OMESSO]', 'codice_fiscale', replacements);

  // 3. Phone numbers
  result = replaceWithTracking(result, PHONE_REGEX, '[TELEFONO OMESSO]', 'telefono', replacements);

  // 4. Email addresses
  result = replaceWithTracking(result, EMAIL_REGEX, '[EMAIL OMESSA]', 'email', replacements);

  // 5. Professional title + name patterns
  result = replaceWithTracking(result, TITLE_NAME_REGEX, '[NOME OMESSO]', 'nome_professionista', replacements);

  return {
    anonymizedText: result,
    replacementCount: replacements.length,
    replacements,
  };
}

/**
 * Build name → replacement mappings from perizia metadata.
 */
function buildNameReplacements(metadata: PeriziaMetadata): Array<{ name: string; replacement: string }> {
  const entries: Array<{ name: string; replacement: string }> = [];

  if (metadata.parteRicorrente) {
    entries.push({ name: metadata.parteRicorrente, replacement: 'PARTE RICORRENTE' });
  }
  if (metadata.parteResistente) {
    entries.push({ name: metadata.parteResistente, replacement: 'PARTE RESISTENTE' });
  }
  if (metadata.ctuName) {
    entries.push({ name: metadata.ctuName, replacement: '[CTU]' });
  }
  if (metadata.ctpRicorrente) {
    entries.push({ name: metadata.ctpRicorrente, replacement: '[CTP RICORRENTE]' });
  }
  if (metadata.ctpResistente) {
    entries.push({ name: metadata.ctpResistente, replacement: '[CTP RESISTENTE]' });
  }
  if (metadata.judgeName) {
    entries.push({ name: metadata.judgeName, replacement: '[GIUDICE]' });
  }
  if (metadata.collaboratoreName) {
    entries.push({ name: metadata.collaboratoreName, replacement: '[COLLABORATORE CTU]' });
  }

  // Sort by name length descending to replace longer names first
  return entries.sort((a, b) => b.name.length - a.name.length);
}

/**
 * Replace regex matches with a placeholder and track replacements.
 */
function replaceWithTracking(
  text: string,
  regex: RegExp,
  replacement: string,
  type: string,
  tracking: AnonymizationResult['replacements'],
): string {
  const matches = text.match(regex);
  if (matches) {
    for (const match of matches) {
      tracking.push({ original: match, replacement, type });
    }
  }
  return text.replace(regex, replacement);
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
