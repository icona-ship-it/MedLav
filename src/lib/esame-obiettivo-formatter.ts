/**
 * Format structured physical examination data into professional Italian text.
 */

export interface DistrictData {
  id: string;
  label: string;
  examined: boolean;
  findings: string;
}

export interface GeneralInfo {
  altezza?: string;
  peso?: string;
  deambulazione?: string;
  condizioni?: string;
}

export function formatEsameObiettivo(districts: DistrictData[], generalInfo?: GeneralInfo): string {
  const parts: string[] = [];

  // General info preamble
  if (generalInfo) {
    const generalParts: string[] = [];
    if (generalInfo.condizioni) {
      generalParts.push(`Condizioni generali: ${generalInfo.condizioni}`);
    }
    if (generalInfo.altezza || generalInfo.peso) {
      const measures: string[] = [];
      if (generalInfo.altezza) measures.push(`altezza ${generalInfo.altezza} cm`);
      if (generalInfo.peso) measures.push(`peso ${generalInfo.peso} kg`);
      generalParts.push(`Parametri antropometrici: ${measures.join(', ')}`);
    }
    if (generalInfo.deambulazione) {
      generalParts.push(`Deambulazione: ${generalInfo.deambulazione}`);
    }
    if (generalParts.length > 0) {
      parts.push(`All'esame obiettivo il periziando presenta le seguenti condizioni.\n\n${generalParts.join('.\n')}.`);
    }
  }

  if (parts.length === 0) {
    parts.push('All\'esame obiettivo il periziando presenta le seguenti condizioni.');
  }

  // Examined districts
  const examined = districts.filter((d) => d.examined && d.findings.trim());
  if (examined.length > 0) {
    for (const district of examined) {
      parts.push(`**${district.label}**: ${district.findings.trim()}`);
    }
  }

  // Non-examined districts summary
  const notExamined = districts.filter((d) => !d.examined);
  if (notExamined.length > 0 && examined.length > 0) {
    const names = notExamined.map((d) => d.label.toLowerCase()).join(', ');
    parts.push(`Distretti non esaminati: ${names}.`);
  }

  return parts.join('\n\n');
}
