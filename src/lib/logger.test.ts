import { describe, it, expect, vi, afterEach } from 'vitest';

describe('logger', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    // Force re-import to pick up new env
    vi.resetModules();
  });

  it('should log info when LOG_LEVEL=info', async () => {
    // Arrange
    vi.stubEnv('LOG_LEVEL', 'info');
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { logger } = await import('./logger');

    // Act
    logger.info('test-tag', 'hello info');

    // Assert
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[test-tag] hello info');
  });

  it('should not log debug when LOG_LEVEL=info', async () => {
    // Arrange
    vi.stubEnv('LOG_LEVEL', 'info');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logger } = await import('./logger');

    // Act
    logger.debug('test-tag', 'hello debug');

    // Assert
    expect(spy).not.toHaveBeenCalled();
  });

  it('should log error regardless of level', async () => {
    // Arrange
    vi.stubEnv('LOG_LEVEL', 'error');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { logger } = await import('./logger');

    // Act
    logger.error('test-tag', 'critical failure');

    // Assert
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('[test-tag] critical failure');
  });

  it('should default to info level when LOG_LEVEL is not set', async () => {
    // Arrange
    vi.stubEnv('LOG_LEVEL', '');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { logger } = await import('./logger');

    // Act
    logger.debug('tag', 'debug msg');
    logger.info('tag', 'info msg');

    // Assert — debug should be suppressed, info should pass
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
  });

  it('should log debug when LOG_LEVEL=debug', async () => {
    // Arrange
    vi.stubEnv('LOG_LEVEL', 'debug');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const { logger } = await import('./logger');

    // Act
    logger.debug('test-tag', 'debug message');

    // Assert
    expect(spy).toHaveBeenCalledOnce();
  });

  it('should log warn when LOG_LEVEL=warn', async () => {
    // Arrange
    vi.stubEnv('LOG_LEVEL', 'warn');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { logger } = await import('./logger');

    // Act
    logger.warn('tag', 'a warning');
    logger.info('tag', 'info suppressed');

    // Assert
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('should treat invalid LOG_LEVEL as info', async () => {
    // Arrange
    vi.stubEnv('LOG_LEVEL', 'nonsense');
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { logger } = await import('./logger');

    // Act
    logger.debug('tag', 'debug msg');
    logger.info('tag', 'info msg');

    // Assert — falls back to info, so debug is suppressed
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledOnce();
  });
});
