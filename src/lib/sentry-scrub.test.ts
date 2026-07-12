import { describe, it, expect } from 'vitest';
import { scrubClinicalData, scrubSentryEvent } from './sentry-scrub';

describe('scrubClinicalData', () => {
  it('rimuove codice fiscale, email e telefono', () => {
    const out = scrubClinicalData('CF RSSMRA80A01H501U email a@b.it tel 3331234567');
    expect(out).toContain('[CF_REDACTED]');
    expect(out).toContain('[EMAIL_REDACTED]');
    expect(out).toContain('[PHONE_REDACTED]');
    expect(out).not.toContain('RSSMRA80A01H501U');
    expect(out).not.toContain('a@b.it');
  });
});

describe('scrubSentryEvent — minimizzazione Art.9', () => {
  it('scrubba message/exception/breadcrumbs e NON invia body/cookie/header della richiesta', () => {
    // scrubSentryEvent muta in place: assertiamo sull'oggetto originale.
    const event = {
      message: 'errore per a@b.it',
      exception: { values: [{ value: 'stack con tel 3331234567' }] },
      breadcrumbs: [{ message: 'CF RSSMRA80A01H501U' }],
      request: {
        data: { diagnosi: 'frattura scomposta del femore' } as unknown,
        cookies: 'session=abc' as unknown,
        headers: { authorization: 'Bearer x' } as unknown,
        query_string: 'email=a@b.it',
      },
    };
    scrubSentryEvent(event);
    expect(event.message).toContain('[EMAIL_REDACTED]');
    expect(event.exception.values[0].value).toContain('[PHONE_REDACTED]');
    expect(event.breadcrumbs[0].message).toContain('[CF_REDACTED]');
    // I payload della richiesta NON devono partire per Sentry
    expect(event.request.data).toBeUndefined();
    expect(event.request.cookies).toBeUndefined();
    expect(event.request.headers).toBeUndefined();
    expect(event.request.query_string).toContain('[EMAIL_REDACTED]');
  });

  it('riduce il contesto utente al solo id', () => {
    const event = { message: 'x', user: { id: 'u1', email: 'a@b.it', username: 'mario', ip_address: '1.2.3.4' } as Record<string, unknown> };
    scrubSentryEvent(event);
    expect(event.user).toEqual({ id: 'u1' });
  });

  it('scrubba i valori stringa in extra', () => {
    const event = { message: 'x', extra: { note: 'contatto a@b.it', count: 3 } as Record<string, unknown> };
    scrubSentryEvent(event);
    expect(event.extra.note).toContain('[EMAIL_REDACTED]');
    expect(event.extra.count).toBe(3);
  });
});
