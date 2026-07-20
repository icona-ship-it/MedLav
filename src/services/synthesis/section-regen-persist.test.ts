import { describe, expect, it } from 'vitest';
import { persistRegeneratedSection } from './section-regen-persist';
import type { ReportGenerationMetadata } from '@/db/schema/reports';

interface InsertedRow { table: string; row: Record<string, unknown> }

function makeAdminMock(options?: { failReportsInsert?: boolean }) {
  const inserted: InsertedRow[] = [];
  return {
    inserted,
    client: {
      from(table: string) {
        return {
          insert: async (row: Record<string, unknown>) => {
            if (table === 'reports' && options?.failReportsInsert) {
              return { error: { message: 'insert boom', code: '500' } };
            }
            inserted.push({ table, row });
            return { error: null };
          },
        };
      },
    },
  };
}

const UPDATED_SYNTHESIS = '## Il Fatto e la Storia Clinica\nContenuto invariato.\n\n## Epicrisi\nNuova epicrisi rigenerata.\n';

function baseParams(admin: ReturnType<typeof makeAdminMock>['client']) {
  return {
    admin,
    caseId: 'case-1',
    userId: 'user-1',
    sectionId: 'epicrisi',
    currentVersion: 3,
    currentMetadata: null,
    updatedSynthesis: UPDATED_SYNTHESIS,
  };
}

describe('persistRegeneratedSection', () => {
  it('should insert a new report version bumping the current one', async () => {
    const mock = makeAdminMock();

    const result = await persistRegeneratedSection(baseParams(mock.client));

    const reportRow = mock.inserted.find((i) => i.table === 'reports')?.row;
    expect(result.version).toBe(4);
    expect(reportRow?.version).toBe(4);
    expect(reportRow?.report_status).toBe('bozza');
    expect(reportRow?.synthesis).toBe(UPDATED_SYNTHESIS);
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it('should start from version 1 when the report has no version yet', async () => {
    const mock = makeAdminMock();

    const result = await persistRegeneratedSection({ ...baseParams(mock.client), currentVersion: null });

    expect(result.version).toBe(1);
  });

  it('should reset the regenerated section state to auto preserving the others', async () => {
    const mock = makeAdminMock();
    const currentMetadata = {
      sections: {
        epicrisi: { status: 'edited' },
        spese_mediche: { status: 'locked' },
      },
    } as ReportGenerationMetadata;

    await persistRegeneratedSection({ ...baseParams(mock.client), currentMetadata });

    const meta = mock.inserted.find((i) => i.table === 'reports')?.row.generation_metadata as ReportGenerationMetadata;
    expect(meta.sections?.epicrisi?.status).toBe('auto');
    expect(meta.sections?.spese_mediche?.status).toBe('locked');
  });

  it('should update the originalSynthesis baseline only for the regenerated section and refresh the snapshot hash', async () => {
    const mock = makeAdminMock();
    const currentMetadata = {
      originalSynthesis: '## Il Fatto e la Storia Clinica\nContenuto invariato.\n\n## Epicrisi\nVecchia bozza AI.\n',
      generationSnapshot: { reportSha256: 'vecchio-hash', generatedAt: '2026-01-01T00:00:00.000Z' },
    } as ReportGenerationMetadata;

    await persistRegeneratedSection({ ...baseParams(mock.client), currentMetadata });

    const meta = mock.inserted.find((i) => i.table === 'reports')?.row.generation_metadata as ReportGenerationMetadata;
    expect(meta.originalSynthesis).toContain('Nuova epicrisi rigenerata.');
    expect(meta.originalSynthesis).toContain('Contenuto invariato.');
    expect(meta.originalSynthesis).not.toContain('Vecchia bozza AI.');
    expect(meta.generationSnapshot?.reportSha256).not.toBe('vecchio-hash');
  });

  it('should prune the claim findings of the regenerated section keeping the others', async () => {
    const mock = makeAdminMock();
    const currentMetadata = {
      claimVerification: {
        findings: [
          { sectionId: 'epicrisi', verdict: 'non_supportato', claim: 'vecchio claim' },
          { sectionId: 'anamnesi', verdict: 'non_supportato', claim: 'altro claim' },
        ],
        unsupportedCount: 2,
        unverifiableCount: 0,
      },
    } as unknown as ReportGenerationMetadata;

    await persistRegeneratedSection({ ...baseParams(mock.client), currentMetadata });

    const meta = mock.inserted.find((i) => i.table === 'reports')?.row.generation_metadata as ReportGenerationMetadata;
    expect(meta.claimVerification?.findings).toHaveLength(1);
    expect(meta.claimVerification?.findings?.[0]?.sectionId).toBe('anamnesi');
    expect(meta.claimVerification?.unsupportedCount).toBe(1);
  });

  it('should persist the provided imageAnalysis into the metadata', async () => {
    const mock = makeAdminMock();
    const imageAnalysis = [{ storagePath: 'ocr-images/doc/p1-f1.png' }] as ReportGenerationMetadata['imageAnalysis'];

    await persistRegeneratedSection({ ...baseParams(mock.client), imageAnalysis });

    const meta = mock.inserted.find((i) => i.table === 'reports')?.row.generation_metadata as ReportGenerationMetadata;
    expect(meta.imageAnalysis).toEqual(imageAnalysis);
  });

  it('should write an audit log row with section id and extra metadata', async () => {
    const mock = makeAdminMock();

    await persistRegeneratedSection({
      ...baseParams(mock.client),
      instruction: 'enfatizza il nesso',
      auditExtra: { batchId: 'batch-123' },
    });

    const auditRow = mock.inserted.find((i) => i.table === 'audit_log')?.row;
    expect(auditRow?.action).toBe('report.section_regenerated');
    expect(auditRow?.entity_id).toBe('case-1');
    const auditMeta = auditRow?.metadata as Record<string, unknown>;
    expect(auditMeta.sectionId).toBe('epicrisi');
    expect(auditMeta.instruction).toBe('enfatizza il nesso');
    expect(auditMeta.batchId).toBe('batch-123');
    expect(auditMeta.version).toBe(4);
  });

  it('should throw when the report insert fails so the caller can refund', async () => {
    const mock = makeAdminMock({ failReportsInsert: true });

    await expect(persistRegeneratedSection(baseParams(mock.client))).rejects.toThrow('insert boom');
    expect(mock.inserted.find((i) => i.table === 'audit_log')).toBeUndefined();
  });
});
