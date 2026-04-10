/**
 * LegMed E2E Pipeline Smoke Test
 *
 * Verifies the full demo flow: create case → events → report → export.
 * Uses the /api/demo endpoint (instant data, no Inngest/Mistral required).
 *
 * Run: pnpm test:e2e
 * Env vars needed: E2E_BASE_URL, E2E_USER_EMAIL, E2E_USER_PASSWORD
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const USER_EMAIL = process.env.E2E_USER_EMAIL || '';
const USER_PASSWORD = process.env.E2E_USER_PASSWORD || '';

test.describe.configure({ mode: 'serial' });

test.describe('Pipeline Smoke Test', () => {
  test.skip(!USER_EMAIL || !USER_PASSWORD, 'E2E credentials not configured');

  let demoCaseId = '';

  test('login and create demo case', async ({ page }) => {
    // Login
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 15_000 });

    // Create demo case via API (shares browser cookies for auth + CSRF)
    const csrfCookie = (await page.context().cookies()).find((c) => c.name === 'csrf-token');
    const response = await page.request.post(`${BASE_URL}/api/demo`, {
      headers: csrfCookie ? { 'x-csrf-token': csrfCookie.value } : {},
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.caseId).toBeTruthy();
    demoCaseId = body.data.caseId;
  });

  test('case page loads with events', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');

    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 15_000 });

    await page.goto(`${BASE_URL}/cases/${demoCaseId}`, { timeout: 30_000 });

    // Click Cronistoria tab and verify events exist
    const eventsTab = page.getByRole('tab', { name: /cronistoria/i });
    if (await eventsTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await eventsTab.click();
      // Wait for at least one event to render
      await expect(page.locator('[data-event-id]').first()).toBeVisible({ timeout: 15_000 });
    }
  });

  test('report content is present', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');

    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 15_000 });

    await page.goto(`${BASE_URL}/cases/${demoCaseId}`, { timeout: 30_000 });

    // Click Report tab
    const reportTab = page.getByRole('tab', { name: /report/i });
    if (await reportTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await reportTab.click();
      // Verify report has substantial content (not empty)
      const reportArea = page.locator('textarea, .prose, [data-testid="report-editor"]').first();
      await expect(reportArea).toBeVisible({ timeout: 15_000 });
      const text = await reportArea.inputValue().catch(() => reportArea.textContent());
      expect((text ?? '').length).toBeGreaterThan(50);
    }
  });

  test('HTML export works', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');

    // Login first to get auth cookies
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 15_000 });

    const response = await page.request.get(
      `${BASE_URL}/api/cases/${demoCaseId}/export/html?inline=true`,
    );
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('<!DOCTYPE html');
  });

  test('CSV export works', async ({ page }) => {
    test.skip(!demoCaseId, 'Demo case not created');

    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', USER_EMAIL);
    await page.fill('input[name="password"]', USER_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/', { timeout: 15_000 });

    const response = await page.request.get(
      `${BASE_URL}/api/cases/${demoCaseId}/export/csv`,
    );
    // CSV export may require Pro subscription — accept 200 or 403
    if (response.ok()) {
      const csv = await response.text();
      expect(csv.length).toBeGreaterThan(50);
      const lines = csv.trim().split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(2); // header + at least 1 row
    } else {
      expect(response.status()).toBe(403); // Pro required — acceptable
    }
  });
});
