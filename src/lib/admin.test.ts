import { describe, it, expect, vi, afterEach } from 'vitest';
import { isAdminUser } from './admin';

describe('isAdminUser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return true when email is in ADMIN_EMAILS', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'admin@medlav.it,superadmin@medlav.it');

    // Act
    const result = isAdminUser('admin@medlav.it');

    // Assert
    expect(result).toBe(true);
  });

  it('should return false when email is not in ADMIN_EMAILS', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'admin@medlav.it');

    // Act
    const result = isAdminUser('user@medlav.it');

    // Assert
    expect(result).toBe(false);
  });

  it('should return false when email is undefined', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'admin@medlav.it');

    // Act
    const result = isAdminUser(undefined);

    // Assert
    expect(result).toBe(false);
  });

  it('should return false when ADMIN_EMAILS is not set', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', '');

    // Act
    const result = isAdminUser('admin@medlav.it');

    // Assert
    expect(result).toBe(false);
  });

  it('should handle case-insensitive comparison', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'Admin@MedLav.IT');

    // Act
    const result = isAdminUser('admin@medlav.it');

    // Assert
    expect(result).toBe(true);
  });

  it('should handle whitespace around emails in ADMIN_EMAILS', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', '  admin@medlav.it , user@test.com  ');

    // Act
    const result = isAdminUser('user@test.com');

    // Assert
    expect(result).toBe(true);
  });

  it('should handle multiple admin emails', () => {
    // Arrange
    vi.stubEnv('ADMIN_EMAILS', 'one@medlav.it,two@medlav.it,three@medlav.it');

    // Act & Assert
    expect(isAdminUser('one@medlav.it')).toBe(true);
    expect(isAdminUser('two@medlav.it')).toBe(true);
    expect(isAdminUser('three@medlav.it')).toBe(true);
    expect(isAdminUser('four@medlav.it')).toBe(false);
  });
});
