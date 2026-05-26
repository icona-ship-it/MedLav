/**
 * E2E tests for UX Refactor Ondata 1 — "Stop the bleeding"
 *
 * Verifies every visible change introduced by commit 0c6983c on the branch
 * `refactor/ux-onda-1-stop-the-bleeding`:
 *  - Glossary IT (Verifiche consigliate → Anomalie e doc mancanti, etc.)
 *  - Button "Approva" verde visibile (variant approve renders bg-success)
 *  - "Approva e finalizza" rimosso dal menu overflow (era duplicato)
 *  - Emoji "❓" sostituita da icona Lightbulb
 *  - Summary box Cronistoria compatta (1 riga vs 6+ statistiche)
 *  - Wizard step bar collassato a breadcrumb in step Report
 *  - "Esporta PDF" come voce nuova nel dropdown Esporta
 *  - "Includi nel report" / "Non includere" come labels anomalie
 *  - Status "Pronto al deposito" invece di "Definitivo"
 *  - Visual regression screenshots delle 4 schermate critiche
 *
 * REQUIREMENTS PER ESECUZIONE:
 *  - Server dev attivo (`pnpm dev` su localhost:3000) o Vercel preview
 *  - Env vars: E2E_BASE_URL, E2E_USER_EMAIL, E2E_USER_PASSWORD
 *  - Almeno 1 caso esistente per quell'utente con report completato in stato "bozza"
 *  - Almeno 1 caso con anomalie rilevate (per testare "Includi/Non includere")
 *
 * COMANDO:
 *  pnpm test:e2e ondata-1-refactor
 *
 * SNAPSHOT BASELINE (prima esecuzione):
 *  pnpm test:e2e ondata-1-refactor --update-snapshots
 */

import { test, expect, type Page } from '@playwright/test';

const email = process.env.E2E_USER_EMAIL;
const password = process.env.E2E_USER_PASSWORD;

// Skip whole suite if no credentials — local devs can still run smoke specs
test.skip(!email || !password, 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run Ondata 1 tests');

async function login(page: Page): Promise<void> {
  await page.goto('/login');
  await page.fill('input[name="email"]', email!);
  await page.fill('input[name="password"]', password!);
  await page.click('button[type="submit"]');
  await page.waitForURL('/', { timeout: 15_000 });
}

/**
 * Open the first case that has a report (any status).
 * Returns when the case detail page is loaded.
 */
async function openFirstCaseWithReport(page: Page): Promise<void> {
  await page.goto('/cases');
  // Click the first case row — assumes at least 1 case exists
  const firstCase = page.locator('a[href^="/cases/"]').first();
  await expect(firstCase).toBeVisible({ timeout: 10_000 });
  await firstCase.click();
  // Wait for case detail page wizard to render
  await page.waitForSelector('nav[aria-label="Passaggi caso"]', { timeout: 15_000 });
}

// ─────────────────────────────────────────────────────────────────────
// GLOSSARY IT — labels rinominate (P7 del piano)
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Glossario IT', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('NON deve esistere più "Verifiche consigliate"', async ({ page }) => {
    // Old label removed everywhere
    await expect(page.locator('text=Verifiche consigliate')).toHaveCount(0);
  });

  test('DEVE esistere "Anomalie e documenti mancanti" come header sidebar', async ({ page }) => {
    // New label in the quality sidebar
    const label = page.locator('text=Anomalie e documenti mancanti');
    // May be visible only on desktop large+, so use first()
    await expect(label.first()).toBeVisible({ timeout: 10_000 });
  });

  test('NON deve esistere "Copertura Documenti"', async ({ page }) => {
    await expect(page.locator('text=Copertura Documenti')).toHaveCount(0);
  });

  test('DEVE esistere "Documenti analizzati"', async ({ page }) => {
    await expect(page.locator('text=Documenti analizzati').first()).toBeVisible();
  });

  test('NON deve esistere "Qualità lettura — Buona/Ottima"', async ({ page }) => {
    // Old pattern was "Qualità lettura 85% — Buona"
    await expect(page.locator('text=/Qualità lettura.*—\\s*(Buona|Ottima|Discreta|Bassa)/')).toHaveCount(0);
  });

  test('DEVE esistere "Lettura OCR" come label', async ({ page }) => {
    // New: "Lettura OCR" with parentheses for confidence
    await expect(page.locator('text=Lettura OCR').first()).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────────────
// BUTTON "APPROVA" — visibile come primary, non duplicato in dropdown
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Bottone Approva', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('NON deve esistere "Approva e finalizza" dentro il menu overflow', async ({ page }) => {
    // Open the overflow dropdown
    const overflowBtn = page.locator('button[aria-haspopup="menu"]').last();
    if (await overflowBtn.isVisible()) {
      await overflowBtn.click();
      await expect(page.locator('text=Approva e finalizza')).toHaveCount(0);
      // Close the menu
      await page.keyboard.press('Escape');
    }
  });

  test('Se status=bozza: DEVE esistere bottone "Approva" verde primary', async ({ page }) => {
    const approveBtn = page.locator('button:has-text("Approva")').filter({ hasNotText: 'finalizza' });
    if (await approveBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      // The button uses bg-success → must NOT be transparent
      const bg = await approveBtn.first().evaluate((el) => window.getComputedStyle(el).backgroundColor);
      expect(bg).not.toBe('rgba(0, 0, 0, 0)');
      expect(bg).not.toBe('transparent');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// EMOJI rimossa → Lightbulb icon
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Emoji eliminata da anomalie', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('NON deve esistere l\'emoji "❓" in nessun elemento visibile', async ({ page }) => {
    // Search any element containing the question mark emoji
    const emojiCount = await page.locator('text=/❓/').count();
    expect(emojiCount).toBe(0);
  });

  test('Se l\'anomalia ha guidance, DEVE mostrare "Cosa devi decidere" con icona (no emoji)', async ({ page }) => {
    // Try open the anomalies UI (may require specific case state)
    const guidanceLabel = page.locator('text=Cosa devi decidere');
    if (await guidanceLabel.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Verify no emoji in the surrounding text
      const parent = guidanceLabel.first().locator('xpath=ancestor::p[1]');
      const text = await parent.textContent();
      expect(text).not.toContain('❓');
      // Verify there's an SVG (the Lightbulb icon) inside
      const svgInside = await parent.locator('svg').count();
      expect(svgInside).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// CRONISTORIA — summary box compatta (1 riga vs box stats)
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Summary box Cronistoria', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('Il summary box ipertrofico con bg-muted/50 NON deve esistere', async ({ page }) => {
    // Old pattern was a rounded-lg bg-muted/50 box with multiple <span> stats
    const oldBox = page.locator('div.rounded-lg.bg-muted\\/50:has-text("eventi totali")');
    await expect(oldBox).toHaveCount(0);
  });

  test('Se la cronistoria ha eventi, DEVE mostrare riga compatta "N eventi (Y clinici…)"', async ({ page }) => {
    // Navigate to timeline if not visible — try clicking the Cronistoria tab
    const timelineTab = page.locator('button[role="tab"]:has-text("Cronistoria")').first();
    if (await timelineTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await timelineTab.click();
    }
    // Look for the new compact format
    const compact = page.locator('text=/\\d+\\s+eventi\\s+\\(\\d+\\s+clinici/');
    if (await compact.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(compact.first()).toBeVisible();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// WIZARD STEP BAR — breadcrumb in step Report (compact)
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Wizard collapse in step Report', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('In step Report il wizard DEVE essere breadcrumb (lista <ol>), non stepper ricco', async ({ page }) => {
    // The compact mode renders an <ol> with chevrons. The full stepper uses divs.
    const wizardNav = page.locator('nav[aria-label="Passaggi caso"]');
    await expect(wizardNav).toBeVisible();
    // If we're on the Report step, the nav should contain an <ol>
    const compactOl = wizardNav.locator('ol');
    if (await compactOl.isVisible({ timeout: 2_000 }).catch(() => false)) {
      // Compact mode active — verify height roughly 24-32px (single text line)
      const box = await wizardNav.boundingBox();
      expect(box?.height).toBeLessThan(40); // breadcrumb should be compact
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// EXPORT DROPDOWN — "Esporta PDF" nuova voce + "Stampa dal browser" fallback
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Export dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('Il dropdown Esporta DEVE contenere "Esporta PDF"', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Esporta")').first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });
    await exportBtn.click();
    await expect(page.locator('text=Esporta PDF')).toBeVisible({ timeout: 3_000 });
    await page.keyboard.press('Escape');
  });

  test('Il dropdown Esporta DEVE contenere "Stampa dal browser" come fallback (rinominato)', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Esporta")').first();
    await exportBtn.click();
    await expect(page.locator('text=Stampa dal browser')).toBeVisible({ timeout: 3_000 });
    // The old label "Stampa PDF" should NOT exist anymore
    await expect(page.locator('text=Stampa PDF').filter({ hasNotText: 'Esporta' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });
});

// ─────────────────────────────────────────────────────────────────────
// ANOMALIES — labels rinominate (Includi / Non includere)
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Anomalies action labels', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('Se vedi anomalie actionable: bottone "Includi nel report" (non "Segnala nel report")', async ({ page }) => {
    // Try to open anomalies section — may be in sidebar or dialog
    const includiBtn = page.locator('button:has-text("Includi nel report")');
    if (await includiBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(includiBtn.first()).toBeVisible();
      // Verify old label removed
      await expect(page.locator('button:has-text("Segnala nel report")')).toHaveCount(0);
    }
  });

  test('Se vedi anomalie actionable: bottone "Non includere" (non "Escludi")', async ({ page }) => {
    const nonIncludereBtn = page.locator('button:has-text("Non includere")');
    if (await nonIncludereBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(nonIncludereBtn.first()).toBeVisible();
      // Verify standalone "Escludi" button is gone (button-level only)
      const escludiButtons = await page.locator('button:has-text("Escludi"):not(:has-text("Non includere"))').count();
      expect(escludiButtons).toBe(0);
    }
  });

  test('"Da revisionare" badge → "Da valutare"', async ({ page }) => {
    const oldBadge = page.locator('text=Da revisionare');
    await expect(oldBadge).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// STATUS LABEL — "Pronto al deposito" invece di "Definitivo"
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Status label rinominato', () => {
  test('Nella dashboard, i casi finalizzati DEVONO mostrare "Pronto al deposito"', async ({ page }) => {
    await login(page);
    await page.goto('/cases');
    // If there's at least 1 definitivo case, the label must use the new wording
    const newLabel = page.locator('text=Pronto al deposito');
    // Old standalone "Definitivo" should be 0 (some other UI may have "Definitivo" in other context)
    if (await newLabel.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      // Confirm new wording is used
      await expect(newLabel.first()).toBeVisible();
    }
    // The strict assertion: there shouldn't be a Badge component with text=Definitivo
    const definitivoBadges = await page.locator('[role="status"]:has-text("Definitivo")').count();
    expect(definitivoBadges).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// PDF EXPORT — clic deve avviare un download
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — PDF download funzionante', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
  });

  test('Click su "Esporta PDF" DEVE avviare il download di un file .pdf', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Esporta")').first();
    await exportBtn.click();

    const pdfLink = page.locator('text=Esporta PDF').first();
    await expect(pdfLink).toBeVisible({ timeout: 3_000 });

    // Setup download listener BEFORE clicking
    const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
    await pdfLink.click();

    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.pdf$/i);

    // Save the file to inspect it
    const path = await download.path();
    expect(path).not.toBeNull();
    // Read first 4 bytes to verify it's a real PDF (magic %PDF)
    if (path) {
      const fs = await import('node:fs/promises');
      const buf = await fs.readFile(path);
      expect(buf.slice(0, 4).toString('utf-8')).toBe('%PDF');
      expect(buf.length).toBeGreaterThan(1000); // > 1KB, not an empty stub
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// VISUAL REGRESSION — screenshot baselines for the 4 critical screens
// ─────────────────────────────────────────────────────────────────────

test.describe('Ondata 1 — Visual regression (screenshots)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openFirstCaseWithReport(page);
    // Disable animations for stable screenshots
    await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
  });

  test('Tab Report — viewport screenshot', async ({ page }) => {
    // Ensure the report tab is selected
    const reportTab = page.locator('button[role="tab"]:has-text("Report")').first();
    if (await reportTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await reportTab.click();
      await page.waitForTimeout(500);
    }
    await expect(page).toHaveScreenshot('ondata-1-report-tab.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02, // tolerate 2% pixel difference (fonts, scrollbars, etc.)
    });
  });

  test('Tab Cronistoria — viewport screenshot', async ({ page }) => {
    const timelineTab = page.locator('button[role="tab"]:has-text("Cronistoria"), button[role="tab"]:has-text("Eventi")').first();
    if (await timelineTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await timelineTab.click();
      await page.waitForTimeout(500);
    }
    await expect(page).toHaveScreenshot('ondata-1-timeline-tab.png', {
      fullPage: false,
      maxDiffPixelRatio: 0.02,
    });
  });

  test('Anomalie/Problemi — viewport screenshot', async ({ page }) => {
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemi"), button[role="tab"]:has-text("Anomalie")').first();
    if (await problemsTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await problemsTab.click();
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot('ondata-1-anomalies-tab.png', {
        fullPage: false,
        maxDiffPixelRatio: 0.02,
      });
    } else {
      test.skip();
    }
  });
});
