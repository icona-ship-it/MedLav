import { describe, it, expect, vi, afterEach } from 'vitest';
import { isAdminUser } from './admin';

describe('isAdminUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return true when email is in ADMIN_EMAILS', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'admin@legmed.it,superadmin@legmed.it');

    // Act
    const result = isAdminUser('admin@legmed.it');

    // Assert
    expect(result).toBe(true);
  });

  it('should return false when email is not in ADMIN_EMAILS', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'admin@legmed.it');

    // Act
    const result = isAdminUser('user@legmed.it');

    // Assert
    expect(result).toBe(false);
  });

  it('should return false when email is undefined', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'admin@legmed.it');

    // Act
    const result = isAdminUser(undefined);

    // Assert
    expect(result).toBe(false);
  });

  it('should return false when ADMIN_EMAILS is not set', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', '');

    // Act
    const result = isAdminUser('admin@legmed.it');

    // Assert
    expect(result).toBe(false);
  });

  it('should handle case-insensitive comparison', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'Admin@LegMed.IT');

    // Act
    const result = isAdminUser('admin@legmed.it');

    // Assert
    expect(result).toBe(true);
  });

  it('should handle whitespace around emails in ADMIN_EMAILS', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', '  admin@legmed.it , user@test.com  ');

    // Act
    const result = isAdminUser('user@test.com');

    // Assert
    expect(result).toBe(true);
  });

  it('should handle multiple admin emails', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'one@legmed.it,two@legmed.it,three@legmed.it');

    // Act & Assert
    expect(isAdminUser('one@legmed.it')).toBe(true);
    expect(isAdminUser('two@legmed.it')).toBe(true);
    expect(isAdminUser('three@legmed.it')).toBe(true);
    expect(isAdminUser('four@legmed.it')).toBe(false);
  });
});
