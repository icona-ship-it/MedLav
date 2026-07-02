import type { PeriziaMetadata } from '@/types';

interface PctDocument {
  fileName: string;
  fileType: string;
}

interface PctExportParams {
  periziaMetadata: PeriziaMetadata;
  synthesis: string;
  documents: PctDocument[];
  caseCode: string;
}

/**
 * Escape XML special characters to prevent injection and malformed output.
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate PCT (Processo Civile Telematico) XML for court filing.
 * Structure follows the DepositoAtti format used by Italian courts.
 */
export function generatePctXml(params: PctExportParams): string {
  const { periziaMetadata, synthesis, documents, caseCode } = params;

  const tribunale = escapeXml(periziaMetadata.tribunale ?? '');
  const rgNumber = escapeXml(periziaMetadata.rgNumber ?? '');
  const judgeName = escapeXml(periziaMetadata.judgeName ?? '');
  const ctuName = escapeXml(periziaMetadata.ctuName ?? '');
  const dataDeposito = new Date().toISOString().split('T')[0];

  const allegatiEntries = documents
    .map(
      (doc) =>
        `      <Allegato nome="${escapeXml(doc.fileName)}" tipo="${escapeXml(doc.fileType)}" />`,
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<DepositoAtti xmlns="urn:it:gov:giustizia:pct">
  <IntestazioneAtti>
    <Tribunale>${tribunale}</Tribunale>
    <NumeroRG>${rgNumber}</NumeroRG>
    <Giudice>${judgeName}</Giudice>
    <CTU>${ctuName}</CTU>
    <DataDeposito>${dataDeposito}</DataDeposito>
  </IntestazioneAtti>
  <Relazione>
    <Oggetto>Relazione peritale medico-legale — Caso ${escapeXml(caseCode)}</Oggetto>
    <Testo>${escapeXml(synthesis)}</Testo>
  </Relazione>
  <Allegati>
${allegatiEntries}
  </Allegati>
</DepositoAtti>`;

  return xml;
}
