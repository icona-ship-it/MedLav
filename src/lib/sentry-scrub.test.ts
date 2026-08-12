import { describe, it, expect } from 'vitest';
import { scrubClinicalData, scrubSentryEvent, scrubSentryTransaction } from './sentry-scrub';

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

describe('scrub — lacune del 2° giro avversariale (breadcrumb.data + transaction)', () => {
  it('scrubba breadcrumb.data (url della query di ricerca), non solo bc.message', () => {
    const event = {
      breadcrumbs: [{
        category: 'fetch',
        data: { url: '/api/search?q=paziente a@b.it tel 3331234567', method: 'GET', status_code: 200 },
      }],
    };
    scrubSentryEvent(event);
    const url = (event.breadcrumbs[0].data as { url: string }).url;
    expect(url).toContain('[EMAIL_REDACTED]');
    expect(url).toContain('[PHONE_REDACTED]');
    expect(url).not.toContain('a@b.it');
  });

  it('scrubSentryTransaction ripulisce request.query_string e span.data', () => {
    const tx = {
      request: { query_string: 'q=CF RSSMRA80A01H501U', data: { body: 'x' }, cookies: { s: 'y' } },
      spans: [{ description: 'GET a@b.it', data: { 'http.url': '/api/search?q=3331234567' } }],
      user: { id: 'u1', email: 'a@b.it', ip_address: '1.2.3.4' },
    };
    scrubSentryTransaction(tx);
    expect(tx.request.query_string).toContain('[CF_REDACTED]');
    expect(tx.request.data).toBeUndefined();
    expect(tx.spans[0].description).toContain('[EMAIL_REDACTED]');
    expect((tx.spans[0].data as { 'http.url': string })['http.url']).toContain('[PHONE_REDACTED]');
    expect(tx.user).toEqual({ id: 'u1' }); // solo id, via email/ip
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
