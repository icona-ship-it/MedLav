import { describe, it, expect } from 'vitest';
import { generatePctXml } from './pct-export';
import type { PeriziaMetadata } from '@/types';

function makeDefaultParams() {
  const periziaMetadata: PeriziaMetadata = {
    tribunale: 'Tribunale di Milano',
    rgNumber: '1234/2024',
    judgeName: 'Dott. Marco Bianchi',
    ctuName: 'Dott. Anna Verdi',
  };
  return {
    periziaMetadata,
    synthesis: 'Il paziente presenta una frattura composta del femore.',
    documents: [
      { fileName: 'cartella_clinica.pdf', fileType: 'application/pdf' },
      { fileName: 'rx_femore.jpg', fileType: 'image/jpeg' },
    ],
    caseCode: 'CASO-001',
  };
}

describe('generatePctXml', () => {
  it('should generate valid XML structure', () => {
    // Arrange
    const params = makeDefaultParams();

    // Act
    const xml = generatePctXml(params);

    // Assert
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<DepositoAtti xmlns="urn:it:gov:giustizia:pct">');
    expect(xml).toContain('<IntestazioneAtti>');
    expect(xml).toContain('<Tribunale>Tribunale di Milano</Tribunale>');
    expect(xml).toContain('<NumeroRG>1234/2024</NumeroRG>');
    expect(xml).toContain('<Giudice>Dott. Marco Bianchi</Giudice>');
    expect(xml).toContain('<CTU>Dott. Anna Verdi</CTU>');
    expect(xml).toContain('<Relazione>');
    expect(xml).toContain('<Oggetto>Relazione peritale medico-legale — Caso CASO-001</Oggetto>');
    expect(xml).toContain('<Allegati>');
    expect(xml).toContain('</DepositoAtti>');
  });

  it('should escape XML special characters', () => {
    // Arrange
    const params = makeDefaultParams();
    params.periziaMetadata.tribunale = 'Tribunale "Civile" & Penale <Sezione>';
    params.synthesis = 'Paziente con lesione da taglio > 5cm & infezione';
    params.caseCode = 'CASO-<001>';

    // Act
    const xml = generatePctXml(params);

    // Assert
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&lt;');
    expect(xml).toContain('&gt;');
    expect(xml).toContain('&quot;');
    expect(xml).not.toContain('<Sezione>');
    expect(xml).not.toContain('"Civile"</');
  });

  it('should include all documents as Allegati', () => {
    // Arrange
    const params = makeDefaultParams();
    params.documents = [
      { fileName: 'doc1.pdf', fileType: 'application/pdf' },
      { fileName: 'doc2.pdf', fileType: 'application/pdf' },
      { fileName: 'img1.jpg', fileType: 'image/jpeg' },
    ];

    // Act
    const xml = generatePctXml(params);

    // Assert
    expect(xml).toContain('nome="doc1.pdf"');
    expect(xml).toContain('nome="doc2.pdf"');
    expect(xml).toContain('nome="img1.jpg"');
    expect(xml).toContain('tipo="application/pdf"');
    expect(xml).toContain('tipo="image/jpeg"');
    // Should have 3 Allegato entries
    const allegatoCount = (xml.match(/<Allegato /g) ?? []).length;
    expect(allegatoCount).toBe(3);
  });

  it('should handle missing periziaMetadata gracefully', () => {
    // Arrange — all optional metadata fields are undefined
    const params = {
      periziaMetadata: {} as PeriziaMetadata,
      synthesis: 'Relazione completa.',
      documents: [],
      caseCode: 'CASO-002',
    };

    // Act
    const xml = generatePctXml(params);

    // Assert — should produce valid XML with empty fields, not throw
    expect(xml).toContain('<Tribunale></Tribunale>');
    expect(xml).toContain('<NumeroRG></NumeroRG>');
    expect(xml).toContain('<Giudice></Giudice>');
    expect(xml).toContain('<CTU></CTU>');
    expect(xml).toContain('<Allegati>');
  });

  it('should include DataDeposito as ISO date', () => {
    // Arrange
    const params = makeDefaultParams();

    // Act
    const xml = generatePctXml(params);

    // Assert — date should be in YYYY-MM-DD format
    const dateMatch = xml.match(/<DataDeposito>(\d{4}-\d{2}-\d{2})<\/DataDeposito>/);
    expect(dateMatch).not.toBeNull();
  });

  it('should handle empty documents array', () => {
    // Arrange
    const params = makeDefaultParams();
    params.documents = [];

    // Act
    const xml = generatePctXml(params);

    // Assert
    expect(xml).toContain('<Allegati>');
    expect(xml).toContain('</Allegati>');
    const allegatoCount = (xml.match(/<Allegato /g) ?? []).length;
    expect(allegatoCount).toBe(0);
  });

  it('should escape special characters in document filenames', () => {
    // Arrange
    const params = makeDefaultParams();
    params.documents = [
      { fileName: 'file "special" & <name>.pdf', fileType: 'application/pdf' },
    ];

    // Act
    const xml = generatePctXml(params);

    // Assert
    expect(xml).toContain('nome="file &quot;special&quot; &amp; &lt;name&gt;.pdf"');
  });
});
