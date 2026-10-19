import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { launchTwoStage, watchErrors } from './support';

/**
 * Plan 230 (ADR 0230): a Career Hardcore world forbids revert until World settings makes it
 * easier, and the changelog shows the change; Settings → Saves exports every world to one file
 * that a fresh profile imports.
 */
test('Hardcore: revert is off with its reason until World settings allows it', async ({ page }) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Hard');
	await form.getByRole('radio', { name: 'Career (hardcore)', exact: true }).click();
	await form.getByTestId('rule-stock.reentry-heating').fill('0.5');
	await form.getByTestId('rule-stock.reentry-heating').press('Tab');
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');

	await launchTwoStage(page);
	// the pause menu: Revert is there, closed, with the reason
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 10, y: 10 } });
	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-revert')).toBeDisabled();
	await expect(page.getByTestId('pause-revert-why')).toContainText('does not allow revert');
	await page.keyboard.press('Escape');

	// World settings: allow revert (easier); the way back (harder) is closed
	await page.getByTestId('nav-menu').click();
	await page.getByTestId('nav-world-settings').click();
	const revert = page.getByTestId('ws-rule-stock.allow-revert');
	await expect(revert.locator('option[value="true"]')).toBeEnabled();
	await revert.selectOption('true');
	await expect(page.getByTestId('world-changelog')).toContainText('Allow revert: off → on');
	await expect(page.getByTestId('ws-fixed-stock.allow-revert')).toContainText(
		'already the easiest'
	);
	// re-entry heating at 50 % may go lower, never higher
	const heating = page.getByTestId('ws-rule-stock.reentry-heating');
	await expect(heating).toHaveValue('0.5');
	await expect(heating).toHaveAttribute('max', '0.5');
	await page.keyboard.press('Escape');

	await page.keyboard.press('Escape');
	await expect(page.getByTestId('pause-revert')).toBeEnabled();
	await page.getByTestId('pause-revert').click();
	await page.waitForURL('**/vab');
	expect(errors).toEqual([]);
});

test('Settings → Saves: storage state, export all, import into a fresh profile', async ({
	page,
	browser
}) => {
	test.setTimeout(180_000);
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Backed up');
	await form.getByTestId('world-create').click();
	await expect(
		page.locator('[data-testid="world-card"]').filter({ hasText: 'Backed up' })
	).toHaveCount(1);

	await page.goto('/');
	await page.getByTestId('menu-settings').click();
	await page.getByRole('tab', { name: 'Saves' }).click();
	await expect(page.getByTestId('saves-storage')).toBeVisible();
	await expect(page.getByTestId('saves-storage')).toContainText(
		/browser (keeps|may delete)|cannot be stored/
	);
	const download = page.waitForEvent('download');
	await page.getByTestId('saves-export-all').click();
	const file = await download;
	expect(file.suggestedFilename()).toMatch(/^orbital-backup-.*\.json$/);
	const text = readFileSync(await file.path(), 'utf8');
	expect(JSON.parse(text).worlds.map((w: { name: string }) => w.name)).toContain('Backed up');

	// a fresh profile: nothing there until the backup comes in
	const fresh = await browser.newContext();
	const other = await fresh.newPage();
	await other.goto('/');
	await other.getByTestId('menu-settings').click();
	await other.getByRole('tab', { name: 'Saves' }).click();
	await other.getByTestId('saves-import-file').setInputFiles({
		name: 'backup.json',
		mimeType: 'application/json',
		buffer: Buffer.from(text)
	});
	await expect(other.getByTestId('saves-note')).toContainText(/Imported [1-9]\d* worlds/);
	await other.goto('/worlds');
	await expect(
		other.locator('[data-testid="world-card"]').filter({ hasText: 'Backed up' })
	).toHaveCount(1);
	await fresh.close();
	expect(errors).toEqual([]);
});
