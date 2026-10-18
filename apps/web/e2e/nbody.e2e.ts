import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

/** Plan 125 (ADR 0122): a world made with n-body gravity flies, with its rails integrated. */
test('create an n-body world, launch from the Hangar and fly without errors', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Three bodies');
	await form.getByTestId('gravity-n-body').check();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await page.getByTestId('sc-label-stock.hangar').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.getByRole('button', { name: /^Launch/ }).click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await page.waitForTimeout(3_000);
	expect(errors).toEqual([]);
});

test('an n-body world of the 1:1 Sol system fetches DE440 once and flies on it', async ({
	page
}) => {
	const errors = watchErrors(page);
	const fetched: number[] = [];
	page.on('response', (r) => {
		if (r.url().endsWith('/ephemeris/de440-2000-2100.bin.gz')) fetched.push(r.status());
	});
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('JPL');
	await form.getByTestId('world-system').selectOption('sol');
	await form.getByTestId('world-variant-1:1').locator('input').check();
	await form.getByTestId('gravity-n-body').check();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	// the Sol site's buildings are listed and labelled like the Legacy layout (journal 125)
	await expect(page.getByTestId('sc-list')).toContainText('Hangar', { timeout: 60_000 });
	await page.getByTestId('sc-label-stock.hangar').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.getByRole('button', { name: /^Launch/ }).click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 90_000 });
	expect(fetched).toEqual([200]);
	expect(errors).toEqual([]);
});
