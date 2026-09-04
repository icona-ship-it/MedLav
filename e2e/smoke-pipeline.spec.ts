/**
 * LegMed E2E smoke — caso dimostrativo (rc-mvp).
 *
 * Verifica il flusso che un medico prova per primo: caso demo → cronistoria
 * con eventi → export HTML con trascrizione e appendice di verifica → CSV.
 * Usa POST /api/demo (dati fittizi, nessun Inngest/Mistral, nessun credito).
 *
 * Run: pnpm test:e2e
 * Env: E2E_BASE_URL, E2E_USER_EMAIL, E2E_USER_PASSWORD
 */

import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const USER_EMAIL = process.env.E2E_USER_EMAIL || '';
const USER_PASSWORD = process.env.E2E_USER_PASSWORD || '';

test.describe.configure({ mode: 'serial' });

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[name="email"]', USER_EMAIL);
  await page.fill('input[name="password"]', USER_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/', { timeout: 15_000 });
}

async function createDemoCase(page: Page): Promise<{ caseId: string; code: string; existed: boolean }> {
  const csrfCookie = (await page.context().cookies()).find((c) => c.name === 'csrf-token');
  const response = await page.request.post(`${BASE_URL}/api/demo`, {
    headers: csrfCookie ? { 'x-csrf-token': csrfCookie.value } : {},
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.success).toBe(true);
  expect(body.data.caseId).toBeTruthy();
  expect(body.data.code).toMatch(/^DEMO-\d{4}-\d{3}$/);
  return body.data;
}

test.describe('Smoke: caso dimostrativo', () => {
  test.skip(!USER_EMAIL || !USER_PASSWORD, 'E2E credentials not configured');

  let demoCaseId = '';

  test('login e creazione del caso demo (idempotente)', async ({ page }) => {
    await login(page);
    const first = await createDemoCase(page);
    demoCaseId = first.caseId;
    const second = await createDemoCase(page);
    expect(second.caseId).toBe(first.caseId);
    expect(second.existed).toBe(true);
  });

  test('la pagina del caso mostra la cronistoria con gli eventi', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');
    await login(page);
    await page.goto(`${BASE_URL}/cases/${demoCaseId}`, { timeout: 30_000 });
    await expect(page.getByText('DEMO', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-event-id]').first()).toBeVisible({ timeout: 15_000 });
    expect(await page.locator('[data-event-id]').count()).toBeGreaterThanOrEqual(5);
  });

  test('export HTML: trascrizione per documento e appendice di verifica', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');
    await login(page);
    const response = await page.request.get(`${BASE_URL}/api/cases/${demoCaseId}/export/html?inline=true`);
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html).toContain('<!DOCTYPE html');
    expect(html).toContain('Trascrizione dei documenti');
    expect(html).toContain('Appendice di verifica');
    expect(html).toContain('Riferito nel documento');
    expect(html).toContain('Programmato / previsto');
    // Universo fittizio presente, nessun tag macchina nel depositabile
    expect(html).toContain('Cittàdemo');
    expect(html).not.toContain('<!--MEDLAV');
  });

  test('export HTML anonimizzato: nessun nome del periziando', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');
    await login(page);
    const response = await page.request.get(`${BASE_URL}/api/cases/${demoCaseId}/export/html?inline=true&anonymize=true`);
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html.toLowerCase()).not.toContain('demprova');
  });

  test('export CSV (200 o 403 se piano senza export)', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');
    await login(page);
    const response = await page.request.get(`${BASE_URL}/api/cases/${demoCaseId}/export/csv`);
    if (response.ok()) {
      const csv = await response.text();
      const lines = csv.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2);
    } else {
      expect(response.status()).toBe(403);
    }
  });
});
