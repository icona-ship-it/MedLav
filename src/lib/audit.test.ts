import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn().mockReturnValue({ error: null });

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: mockInsert,
    }),
  }),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { logAccess } from './audit';

describe('audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not throw when called (fire-and-forget)', () => {
    // Act & Assert — should complete without throwing
    expect(() => {
      logAccess({
        userId: 'user-1',
        action: 'case.viewed',
        entityType: 'case',
        entityId: 'case-abc',
      });
    }).not.toThrow();
  });

  it('should call supabase insert with correct params', () => {
    // Arrange
    const params = {
      userId: 'user-42',
      action: 'document.downloaded',
      entityType: 'document',
      entityId: 'doc-99',
      metadata: { format: 'docx' },
    };

    // Act
    logAccess(params);

    // Assert
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-42',
      action: 'document.downloaded',
      entity_type: 'document',
      entity_id: 'doc-99',
      metadata: { format: 'docx' },
    });
  });

  it('should default entity_id and metadata to null when omitted', () => {
    // Arrange & Act
    logAccess({
      userId: 'user-1',
      action: 'dashboard.viewed',
      entityType: 'dashboard',
    });

    // Assert
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: 'user-1',
      action: 'dashboard.viewed',
      entity_type: 'dashboard',
      entity_id: null,
      metadata: null,
    });
  });

  it('should not throw when insert returns an error', () => {
    // Arrange
    mockInsert.mockReturnValueOnce({ error: { message: 'DB connection failed' } });

    // Act & Assert
    expect(() => {
      logAccess({
        userId: 'user-1',
        action: 'case.viewed',
        entityType: 'case',
      });
    }).not.toThrow();
  });
});
