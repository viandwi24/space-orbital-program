import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

/**
 * Plan 204 (ADR 0201): one sim per world. Moving between Space Center, Hangar, Mission Center and
 * Flight is client navigation: the page never reloads, the world clock never goes back, and the
 * status bar says when the world was saved.
 */
const simTime = async (page: Page): Promise<number> =>
	Number(await page.getByTestId('world-clock').getAttribute('data-t'));

test('the world clock runs on across pages without a reload', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Shell career');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await page.evaluate(() => ((window as unknown as { __marker: number }).__marker = 42));

	await expect(page.getByTestId('time-bar')).toBeVisible();
	await expect.poll(() => simTime(page), { timeout: 60_000 }).toBeGreaterThan(0);
	let last = await simTime(page);
	const later = async (): Promise<void> => {
		await expect.poll(() => simTime(page), { timeout: 30_000 }).toBeGreaterThan(last);
		last = await simTime(page);
	};

	// Space Center -> Hangar
	await page.getByTestId('sc-label-stock.hangar').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	await later();
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();

	// Hangar -> Space Center -> Mission Center (its page action) -> Flight by the menu bar
	await page.getByTestId('nav-space-center').click();
	await page.waitForURL('**/space-center');
	await page.getByTestId('nav-mission-center').click();
	await page.waitForURL('**/mission-center');
	await later();
	await page.getByTestId('nav-vessel').click();
	await page.waitForURL('**/flight');
	await later();
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });

	// still the same page: no reload happened on the way
	expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
	// a quicksave writes the world; the status bar says how long ago
	await expect
		.poll(
			async () => {
				await page.keyboard.press('F5');
				return page.getByTestId('status-saved').innerText();
			},
			{ timeout: 90_000, intervals: [2000] }
		)
		.toMatch(/^Saved \d+ s ago$/);
	await page.getByTestId('nav-space-center').click();
	await page.waitForURL('**/space-center');
	await later();
	expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42);
	expect(errors).toEqual([]);
});
