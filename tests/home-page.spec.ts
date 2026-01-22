import { test, expect } from '@playwright/test';

test.describe('Home Page - Script List', () => {
  test('displays page title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('page-title')).toHaveText('Teleprompter Scripts');
  });

  test('displays scripts list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('scripts-list')).toBeVisible();
  });

  test('displays example script link', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('script-link-example')).toBeVisible();
    await expect(page.getByTestId('script-link-example')).toHaveText('example');
  });

  test('displays new script form', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('new-script-input')).toBeVisible();
    await expect(page.getByTestId('create-script-button')).toBeVisible();
  });

  test('navigates to script when clicking link', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('script-link-example').click();
    await expect(page).toHaveURL('/example');
    await expect(page.getByTestId('teleprompter-view')).toBeVisible();
  });

  test('creates new script with valid name', async ({ page }) => {
    const scriptName = `test-script-${Date.now()}`;
    await page.goto('/');
    await page.getByTestId('new-script-input').fill(scriptName);
    await page.getByTestId('create-script-button').click();

    await expect(page).toHaveURL(`/${scriptName}`);
    await expect(page.getByTestId('teleprompter-view')).toBeVisible();

    // Clean up - delete the script via API
    await page.request.delete(`/api/scripts/${scriptName}`);
  });

  test('does not create script with empty name', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('new-script-input').fill('');
    await page.getByTestId('create-script-button').click();

    // Should stay on home page
    await expect(page).toHaveURL('/');
  });
});
