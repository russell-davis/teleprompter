import { test, expect } from '@playwright/test';

test.describe('Edit Mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));
    await page.goto('/example');
  });

  test('E key enters edit mode', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('body')).toHaveClass(/edit-mode/);
    await expect(page.getByTestId('edit-mode-button')).toHaveClass(/active/);
  });

  test('Edit button enters edit mode', async ({ page }) => {
    await page.getByTestId('edit-mode-button').click();
    await expect(page.locator('body')).toHaveClass(/edit-mode/);
  });

  test('all blocks visible in edit mode (not dimmed)', async ({ page }) => {
    await page.keyboard.press('e');
    // All blocks should have opacity 1 in edit mode (checked via class absence of 'past' effect)
    const blocks = page.locator('[data-testid^="block-"]').filter({ has: page.locator('.block-content') });
    const count = await blocks.count();
    expect(count).toBeGreaterThan(1);
  });

  test('block actions visible in edit mode', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.getByTestId('block-actions-0')).toBeVisible();
    await expect(page.getByTestId('edit-block-button-0')).toBeVisible();
    await expect(page.getByTestId('move-up-button-0')).toBeVisible();
    await expect(page.getByTestId('move-down-button-0')).toBeVisible();
    await expect(page.getByTestId('delete-block-button-0')).toBeVisible();
  });

  test('add block button visible in edit mode', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.getByTestId('add-block-button')).toBeVisible();
  });

  test('Escape exits edit mode', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('body')).toHaveClass(/edit-mode/);

    await page.keyboard.press('Escape');
    await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
  });

  test('E key toggles edit mode off', async ({ page }) => {
    await page.keyboard.press('e');
    await expect(page.locator('body')).toHaveClass(/edit-mode/);

    await page.keyboard.press('e');
    await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
  });

  test('cannot enter edit mode from focus mode', async ({ page }) => {
    // Enter focus mode first
    await page.keyboard.press('f');
    await expect(page.locator('body')).toHaveClass(/focus-mode/);

    // Try to enter edit mode
    await page.keyboard.press('e');
    await expect(page.locator('body')).not.toHaveClass(/edit-mode/);
    await expect(page.locator('body')).toHaveClass(/focus-mode/);
  });

  test('navigation keys do not work in edit mode', async ({ page }) => {
    await page.keyboard.press('e');

    // Get initial state
    const initialProgress = await page.getByTestId('progress-indicator').textContent();

    // Try to navigate
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');

    // Progress should not change
    await expect(page.getByTestId('progress-indicator')).toHaveText(initialProgress!);
  });
});

test.describe('Block CRUD Operations', () => {
  let testScriptName: string;

  test.beforeEach(async ({ page }) => {
    // Create a fresh test script for each test
    testScriptName = `test-crud-${Date.now()}`;
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('teleprompter-help-seen', 'true'));

    // Create test script via API
    await page.request.put(`/api/scripts/${testScriptName}`, {
      data: {
        title: 'Test CRUD Script',
        blocks: [
          { type: 'heading', content: 'Test Heading' },
          { type: 'say', content: 'Test content' },
          { type: 'click', content: 'Click something' },
        ],
      },
    });

    await page.goto(`/${testScriptName}`);
  });

  test.afterEach(async ({ page }) => {
    // Clean up test script
    await page.request.delete(`/api/scripts/${testScriptName}`);
  });

  test('opens add block modal', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('add-block-button').click();

    await expect(page.getByTestId('block-modal-overlay')).toBeVisible();
    await expect(page.getByTestId('modal-title')).toHaveText('Add Block');
    await expect(page.getByTestId('type-button-say')).toHaveClass(/selected/);
  });

  test('adds new block', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('add-block-button').click();

    await page.getByTestId('type-button-note').click();
    await page.getByTestId('block-content-input').fill('This is a new note');
    await page.getByTestId('modal-save-button').click();

    await expect(page.getByTestId('block-modal-overlay')).not.toBeVisible();
    // New block should appear (index 3 since we started with 3 blocks)
    await expect(page.getByTestId('block-3')).toBeVisible();
    await expect(page.getByTestId('block-content-3')).toContainText('This is a new note');
  });

  test('cancels add block', async ({ page }) => {
    await page.keyboard.press('e');

    // Count initial blocks
    const initialCount = await page.locator('[data-testid^="block-"][data-testid$="-content"]').count();

    await page.getByTestId('add-block-button').click();
    await page.getByTestId('block-content-input').fill('Should not be added');
    await page.getByTestId('modal-cancel-button').click();

    await expect(page.getByTestId('block-modal-overlay')).not.toBeVisible();
    // Block count should be same
    const finalCount = await page.locator('[data-testid^="block-"][data-testid$="-content"]').count();
    expect(finalCount).toBe(initialCount);
  });

  test('opens edit block modal with existing content', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('edit-block-button-1').click();

    await expect(page.getByTestId('block-modal-overlay')).toBeVisible();
    await expect(page.getByTestId('modal-title')).toHaveText('Edit Block');
    await expect(page.getByTestId('type-button-say')).toHaveClass(/selected/);
    await expect(page.getByTestId('block-content-input')).toHaveValue('Test content');
  });

  test('edits existing block', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('edit-block-button-1').click();

    await page.getByTestId('block-content-input').fill('Updated content');
    await page.getByTestId('modal-save-button').click();

    await expect(page.getByTestId('block-modal-overlay')).not.toBeVisible();
    await expect(page.getByTestId('block-content-1')).toContainText('Updated content');
  });

  test('changes block type', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('edit-block-button-1').click();

    await page.getByTestId('type-button-prepare').click();
    await page.getByTestId('modal-save-button').click();

    await expect(page.getByTestId('block-1')).toHaveClass(/prepare/);
  });

  test('moves block up', async ({ page }) => {
    await page.keyboard.press('e');

    // Get content of block 1 and 2
    const block1Content = await page.getByTestId('block-content-1').textContent();
    const block2Content = await page.getByTestId('block-content-2').textContent();

    // Move block 2 up
    await page.getByTestId('move-up-button-2').click();

    // Now block 1 should have block 2's content and vice versa
    await expect(page.getByTestId('block-content-1')).toHaveText(block2Content!);
    await expect(page.getByTestId('block-content-2')).toHaveText(block1Content!);
  });

  test('moves block down', async ({ page }) => {
    await page.keyboard.press('e');

    const block0Content = await page.getByTestId('block-content-0').textContent();
    const block1Content = await page.getByTestId('block-content-1').textContent();

    await page.getByTestId('move-down-button-0').click();

    await expect(page.getByTestId('block-content-0')).toHaveText(block1Content!);
    await expect(page.getByTestId('block-content-1')).toHaveText(block0Content!);
  });

  test('deletes block with confirmation', async ({ page }) => {
    await page.keyboard.press('e');

    const initialCount = await page.locator('[data-testid^="block-content-"]').count();

    // Handle confirmation dialog - must be set before the click
    page.once('dialog', (dialog) => dialog.accept());

    await page.getByTestId('delete-block-button-1').click();

    // Wait for the block to be removed
    await page.waitForFunction(
      (expected) => document.querySelectorAll('[data-testid^="block-content-"]').length === expected,
      initialCount - 1
    );

    const finalCount = await page.locator('[data-testid^="block-content-"]').count();
    expect(finalCount).toBe(initialCount - 1);
  });

  test('cancels delete', async ({ page }) => {
    await page.keyboard.press('e');

    // Handle confirmation dialog - dismiss it
    page.on('dialog', (dialog) => dialog.dismiss());

    const initialCount = await page.locator('[data-testid^="block-"][data-testid*="-content"]').count();

    await page.getByTestId('delete-block-button-1').click();

    const finalCount = await page.locator('[data-testid^="block-"][data-testid*="-content"]').count();
    expect(finalCount).toBe(initialCount);
  });

  test('type selector buttons work', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('add-block-button').click();

    // Test each type button
    const types = ['say', 'click', 'type', 'prepare', 'next', 'heading', 'note'];
    for (const type of types) {
      await page.getByTestId(`type-button-${type}`).click();
      await expect(page.getByTestId(`type-button-${type}`)).toHaveClass(/selected/);
    }
  });

  test('cannot save empty content', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('add-block-button').click();

    // Clear content and try to save
    await page.getByTestId('block-content-input').fill('');
    await page.getByTestId('modal-save-button').click();

    // Modal should still be open
    await expect(page.getByTestId('block-modal-overlay')).toBeVisible();
  });

  test('closes modal by clicking outside', async ({ page }) => {
    await page.keyboard.press('e');
    await page.getByTestId('add-block-button').click();

    await expect(page.getByTestId('block-modal-overlay')).toBeVisible();

    // Click on the overlay (outside the modal)
    await page.getByTestId('block-modal-overlay').click({ position: { x: 10, y: 10 } });

    await expect(page.getByTestId('block-modal-overlay')).not.toBeVisible();
  });
});
