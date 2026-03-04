import { test, expect } from '@playwright/test';

/**
 * Dashboard tests require authentication.
 * These test the UI structure and navigation without creating real data.
 * Set E2E_USER_EMAIL and E2E_USER_PASSWORD env vars to run authenticated tests.
 */

test.describe('Dashboard (unauthenticated)', () => {
  test('should redirect to landing when not logged in', async ({ page }) => {
    await page.goto('/cases');
    await expect(page).toHaveURL(/landing/);
  });

  test('should redirect settings to landing when not logged in', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/landing/);
  });
});

test.describe('Dashboard (authenticated)', () => {
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run');

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', email!);
    await page.fill('input[name="password"]', password!);
    await page.click('button[type="submit"]');
    // Wait for redirect to dashboard
    await page.waitForURL('/', { timeout: 15_000 });
  });

  test('should show dashboard after login', async ({ page }) => {
    await expect(page.locator('text=I tuoi casi')).toBeVisible({ timeout: 10_000 });
  });

  test('should navigate to new case page', async ({ page }) => {
    await page.click('text=Nuovo caso');
    await expect(page).toHaveURL(/cases\/new/);
    await expect(page.locator('text=Ruolo perito')).toBeVisible();
    await expect(page.locator('text=Tipo caso')).toBeVisible();
  });

  test('should show settings page with profile', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=Impostazioni')).toBeVisible();
    await expect(page.locator('text=Profilo')).toBeVisible();
    await expect(page.locator('text=I tuoi dati (GDPR)')).toBeVisible();
  });

  test('should create a new case', async ({ page }) => {
    await page.goto('/cases/new');

    // Select role
    await page.click('[data-testid="case-role-select"], select[name="caseRole"]');
    await page.click('text=CTP');

    // Select type
    await page.click('[data-testid="case-type-select"], select[name="caseType"]');
    await page.click('text=Ortopedica');

    // Fill optional fields
    await page.fill('input[name="patientInitials"]', 'M.R.');

    // Submit
    await page.click('button[type="submit"]');

    // Should redirect to case detail
    await page.waitForURL(/cases\/[a-f0-9-]+/, { timeout: 10_000 });
    await expect(page.locator('text=M.R.')).toBeVisible();
  });
});
