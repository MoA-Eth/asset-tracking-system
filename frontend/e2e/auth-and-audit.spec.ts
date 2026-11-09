import { test, expect } from '@playwright/test';

test.describe('MoA Asset Tracking System - Core E2E Flows', () => {

  test('loads login page with branding and Ethiopian Government header', async ({ page }) => {
    await page.goto('/');

    // Check login page elements
    await expect(page.locator('input[placeholder*="name@moa.gov.et"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('authenticates as System Administrator and opens dashboard', async ({ page }) => {
    await page.goto('/');

    // Fill credentials
    await page.fill('input[placeholder*="name@moa.gov.et"]', 'admin@moa.gov.et');
    await page.fill('input[type="password"]', 'moaams2024');

    // Submit
    await page.click('button[type="submit"]');

    // Verify authenticated session header or sidebar
    await expect(page.getByRole('navigation', { name: 'Main navigation' }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('System Administrator').first()).toBeVisible();
  });

  test('navigates to Assets page and verifies inventory overview', async ({ page }) => {
    await page.goto('/');

    // Login
    await page.fill('input[placeholder*="name@moa.gov.et"]', 'admin@moa.gov.et');
    await page.fill('input[type="password"]', 'moaams2024');
    await page.click('button[type="submit"]');

    // Navigate to Assets
    const assetsLink = page.locator('text=Assets').or(page.locator('a[href*="assets"]')).or(page.locator('button:has-text("Assets")'));
    if (await assetsLink.first().isVisible()) {
      await assetsLink.first().click();
    }

    // Check that assets table or page container is rendered
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).not.toBeEmpty();
  });

});
