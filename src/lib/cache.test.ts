import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
}));

import { revalidateTag } from 'next/cache';
import { CACHE_TAGS, revalidateCase, revalidateCases } from './cache';

describe('cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should have expected CACHE_TAGS values', () => {
    // Assert
    expect(CACHE_TAGS.CASES).toBe('cases');
    expect(CACHE_TAGS.CASE_DETAIL).toBe('case-detail');
    expect(CACHE_TAGS.PROFILE).toBe('profile');
    expect(CACHE_TAGS.GUIDELINES).toBe('guidelines');
  });

  it('should revalidate case-detail and cases tags when revalidateCase is called', () => {
    // Arrange
    const caseId = 'case-abc-123';

    // Act
    revalidateCase(caseId);

    // Assert
    expect(revalidateTag).toHaveBeenCalledWith(CACHE_TAGS.CASE_DETAIL);
    expect(revalidateTag).toHaveBeenCalledWith(CACHE_TAGS.CASES);
    expect(revalidateTag).toHaveBeenCalledTimes(2);
  });

  it('should revalidate only cases tag when revalidateCases is called', () => {
    // Arrange
    const userId = 'user-xyz';

    // Act
    revalidateCases(userId);

    // Assert
    expect(revalidateTag).toHaveBeenCalledWith(CACHE_TAGS.CASES);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
  });
});
