import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show landing page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    // Should redirect to landing
    await expect(page).toHaveURL(/landing/);
    await expect(page.locator('text=MedLav')).toBeVisible();
  });

  test('should show login page with email and password fields', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('text=Accedi')).toBeVisible();
  });

  test('should show registration page with all fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('input[name="fullName"]')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
    await expect(page.locator('text=Registrati')).toBeVisible();
  });

  test('should show forgot password page', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('text=Password dimenticata')).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('should show error on invalid login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'nonexistent@test.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10_000 });
  });

  test('should show error on mismatched passwords during registration', async ({ page }) => {
    await page.goto('/register');
    await page.fill('input[name="fullName"]', 'Test User');
    await page.fill('input[name="email"]', 'test@test.com');
    await page.fill('input[name="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'differentpassword');
    await page.click('button[type="submit"]');
    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page.locator('text=Le password non coincidono')).toBeVisible();
  });

  test('should navigate from login to register and back', async ({ page }) => {
    await page.goto('/login');
    await page.click('text=Registrati');
    await expect(page).toHaveURL(/register/);
    await page.click('text=Accedi');
    await expect(page).toHaveURL(/login/);
  });

  test('should navigate from login to forgot password', async ({ page }) => {
    await page.goto('/login');
    await page.click('text=Password dimenticata?');
    await expect(page).toHaveURL(/forgot-password/);
  });
});
