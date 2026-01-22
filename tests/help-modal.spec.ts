import { test, expect } from '@playwright/test';

test.describe('Help Modal', () => {
  test('? key opens help modal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    await page.getByTestId('present-button').click();

    await page.keyboard.press('?');
    await expect(page.getByTestId('help-modal-overlay')).toBeVisible();
    await expect(page.getByTestId('help-modal')).toBeVisible();
    await expect(page.getByTestId('help-title')).toHaveText('How to Use Teleprompter');
  });

  test('help button opens help modal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    await page.getByTestId('present-button').click();

    await page.getByTestId('help-button').click();
    await expect(page.getByTestId('help-modal-overlay')).toBeVisible();
  });

  test('help hint opens help modal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    await page.getByTestId('present-button').click();

    await page.getByTestId('help-hint').click();
    await expect(page.getByTestId('help-modal-overlay')).toBeVisible();
  });

  test('Got it button closes help modal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    await page.getByTestId('present-button').click();

    await page.keyboard.press('?');
    await expect(page.getByTestId('help-modal-overlay')).toBeVisible();

    await page.getByTestId('help-dismiss-button').click();
    await expect(page.getByTestId('help-modal-overlay')).not.toBeVisible();
  });

  test('clicking outside closes help modal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    await page.getByTestId('present-button').click();

    await page.keyboard.press('?');
    await expect(page.getByTestId('help-modal-overlay')).toBeVisible();

    // Click on the overlay background
    await page.getByTestId('help-modal-overlay').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('help-modal-overlay')).not.toBeVisible();
  });

  test('Escape closes help modal', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    await page.getByTestId('present-button').click();

    await page.keyboard.press('?');
    await expect(page.getByTestId('help-modal-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('help-modal-overlay')).not.toBeVisible();
  });

  test('help shows automatically on first visit', async ({ page }) => {
    // Clear localStorage before visiting
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('teleprompter-help-seen'));

    await page.goto('/example');
    await page.getByTestId('present-button').click();

    // Wait for the timeout (500ms) plus some buffer
    await page.waitForTimeout(700);

    await expect(page.getByTestId('help-modal-overlay')).toBeVisible();
  });

  test('help does not show on return visits', async ({ page }) => {
    // Set the localStorage flag first
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));

    await page.goto('/example');
    await page.getByTestId('present-button').click();

    // Wait to ensure help doesn't auto-open
    await page.waitForTimeout(700);

    await expect(page.getByTestId('help-modal-overlay')).not.toBeVisible();
  });

  test('help modal contains expected sections', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    await page.getByTestId('present-button').click();

    await page.keyboard.press('?');

    // Check for expected content
    await expect(page.getByTestId('help-modal')).toContainText('Modes');
    await expect(page.getByTestId('help-modal')).toContainText('Block Types');
    await expect(page.getByTestId('help-modal')).toContainText('Keyboard Shortcuts');
    await expect(page.getByTestId('help-modal')).toContainText('Present mode');
    await expect(page.getByTestId('help-modal')).toContainText('Edit mode');
    await expect(page.getByTestId('help-modal')).toContainText('Focus mode');
  });
});
