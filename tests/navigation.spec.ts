import { test, expect } from '@playwright/test';

test.describe('Present Mode Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to avoid help modal auto-opening
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
    // Wait for page to be fully loaded
    await page.waitForSelector('[data-testid="block-0"]');
  });

  test('displays first block as current initially', async ({ page }) => {
    await expect(page.getByTestId('block-0')).toHaveClass(/current/);
    await expect(page.getByTestId('progress-indicator')).toContainText('1 /');
  });

  test('Space key advances to next block', async ({ page }) => {
    await page.keyboard.press('Space');
    await expect(page.getByTestId('block-1')).toHaveClass(/current/);
    await expect(page.getByTestId('block-0')).toHaveClass(/past/);
  });

  test('ArrowDown advances to next block', async ({ page }) => {
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('block-1')).toHaveClass(/current/);
  });

  test('ArrowRight advances to next block', async ({ page }) => {
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('block-1')).toHaveClass(/current/);
  });

  test('ArrowUp goes to previous block', async ({ page }) => {
    // First go to block 2
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('block-2')).toHaveClass(/current/);

    // Now go back
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('block-1')).toHaveClass(/current/);
  });

  test('ArrowLeft goes to previous block', async ({ page }) => {
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('block-0')).toHaveClass(/current/);
  });

  test('cannot go before first block', async ({ page }) => {
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('block-0')).toHaveClass(/current/);
    await expect(page.getByTestId('progress-indicator')).toContainText('1 /');
  });

  test('R key resets to first block', async ({ page }) => {
    // Navigate away from first block
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('block-2')).toHaveClass(/current/);

    // Press R to reset
    await page.keyboard.press('r');
    await expect(page.getByTestId('block-0')).toHaveClass(/current/);
    await expect(page.getByTestId('progress-indicator')).toContainText('1 /');
  });

  test('Reset button resets to first block', async ({ page }) => {
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');

    await page.getByTestId('reset-button').click();
    await expect(page.getByTestId('block-0')).toHaveClass(/current/);
  });

  test('clicking on block navigates to it', async ({ page }) => {
    await page.getByTestId('block-3').click();
    await expect(page.getByTestId('block-3')).toHaveClass(/current/);
  });

  test('Home key goes to first block', async ({ page }) => {
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('Home');
    await expect(page.getByTestId('block-0')).toHaveClass(/current/);
  });

  test('End key goes to last block', async ({ page }) => {
    await page.keyboard.press('End');
    // Get the progress indicator to check we're at the last block
    const progress = await page.getByTestId('progress-indicator').textContent();
    const [current, total] = progress!.split('/').map(s => s.trim());
    expect(current).toBe(total);
  });

  test('back link returns to home page', async ({ page }) => {
    await page.getByTestId('back-to-scripts').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('script-list-page')).toBeVisible();
  });

  test('displays script title', async ({ page }) => {
    await expect(page.getByTestId('script-title')).toHaveText('Example Script');
  });

  test('progress indicator updates when navigating', async ({ page }) => {
    await expect(page.getByTestId('progress-indicator')).toContainText('1 /');
    await page.keyboard.press('Space');
    await expect(page.getByTestId('progress-indicator')).toContainText('2 /');
  });
});
