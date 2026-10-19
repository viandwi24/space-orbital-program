import { expect, test, type Page } from '@playwright/test';
import { launchTwoStage } from './support';

/**
 * Plan 202: an unhandled rejection shows the error card over the page instead of a dead page;
 * "Save and reload" saves the world and the page comes back into it.
 */
const worldTime = (page: Page): Promise<number> =>
	page
		.getByTestId('world-clock')
		.getAttribute('data-t')
		.then((t) => Number(t));

test('an unhandled rejection shows the card; Save and reload comes back into the world', async ({
	page
}) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the error hooks');
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Error card');
	await form.getByRole('radio', { name: 'Sandbox', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await launchTwoStage(page);
	await expect.poll(() => worldTime(page), { timeout: 30_000 }).toBeGreaterThan(5);

	// a fault outside any render or load: nothing in the page catches it
	await page.evaluate(() => {
		setTimeout(() => void Promise.reject(new Error('e2e: a promise nobody handled')));
	});
	const card = page.getByTestId('error-card');
	await expect(card).toBeVisible({ timeout: 10_000 });
	await expect(card).toContainText('e2e: a promise nobody handled');

	const before = await worldTime(page);
	await Promise.all([
		page.waitForEvent('load', { timeout: 30_000 }),
		page.getByTestId('error-save-reload').click()
	]);
	await expect(page.getByTestId('error-card')).toHaveCount(0);
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	// the reloaded flight is the saved world, not a new one at t = 0
	await expect.poll(() => worldTime(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(before - 1);
});

test('Continue closes the card and the page keeps running', async ({ page }) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the error hooks');
	await page.goto('/');
	await page.evaluate(() => {
		setTimeout(() => {
			throw new Error('e2e: an uncaught error');
		});
	});
	await expect(page.getByTestId('error-card')).toContainText('e2e: an uncaught error');
	// outside a world there is nothing to save: a plain reload is offered
	await expect(page.getByTestId('error-save-reload')).toHaveCount(0);
	await page.getByTestId('error-dismiss').click();
	await expect(page.getByTestId('error-card')).toHaveCount(0);
});
