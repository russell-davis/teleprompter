import { test, expect } from '@playwright/test';

test.describe('Focus Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
  });

  test('F key enters focus mode', async ({ page }) => {
    await page.keyboard.press('f');
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
    await expect(page.getByTestId('focus-mode-button')).toHaveClass(/active/);
  });

  test('Focus button enters focus mode', async ({ page }) => {
    await page.getByTestId('focus-mode-button').click();
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
  });

  test('focus mode hides header and hints', async ({ page }) => {
    await page.keyboard.press('f');
    await expect(page.getByTestId('header')).not.toBeVisible();
    await expect(page.getByTestId('keyboard-hints')).not.toBeVisible();
    await expect(page.getByTestId('help-hint')).not.toBeVisible();
  });

  test('only current block is visible in focus mode', async ({ page }) => {
    await page.keyboard.press('f');
    await expect(page.getByTestId('block-0')).toBeVisible();
    // Other blocks should not be visible
    await expect(page.getByTestId('block-1')).not.toBeVisible();
  });

  test('navigation works in focus mode', async ({ page }) => {
    await page.keyboard.press('f');
    await expect(page.getByTestId('block-0')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.getByTestId('block-0')).not.toBeVisible();
    await expect(page.getByTestId('block-1')).toBeVisible();
  });

  test('Escape exits focus mode', async ({ page }) => {
    await page.keyboard.press('f');
    await expect(page.locator('body')).toHaveClass(/focus-mode/);

    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
  });

  test('F key toggles focus mode off', async ({ page }) => {
    await page.keyboard.press('f');
    await expect(page.locator('body')).toHaveClass(/focus-mode/);

    await page.keyboard.press('f');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
  });

  test('cannot enter focus mode from edit mode', async ({ page }) => {
    // Enter edit mode first
    await page.keyboard.press('e');
    await expect(page.locator('body')).toHaveClass(/edit-mode/);

    // Try to enter focus mode
    await page.keyboard.press('f');
    await expect(page.locator('body')).not.toHaveClass(/focus-mode/);
    await expect(page.locator('body')).toHaveClass(/edit-mode/);
  });
});
