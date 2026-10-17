/**
 * The Astronaut Complex and seats at launch (plan 108, ADR 0152): hire two, seat them in a vessel
 * with two pods on the Launch screen, and see both in the flight's crew panel.
 */
import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

const twoPods = {
	formatVersion: 3,
	name: 'Two seats',
	parts: [
		{ index: 0, part: 'stock.command-pod', parent: null },
		{
			index: 1,
			part: 'stock.command-pod',
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		},
		{
			index: 2,
			part: 'stock.tank-medium',
			parent: { index: 1, parentNode: 'bottom', node: 'top' }
		},
		{ index: 3, part: 'stock.engine-lv', parent: { index: 2, parentNode: 'bottom', node: 'top' } }
	],
	stages: [[3]]
};

test('hire two, seat them at Launch, see them in flight', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/astronauts');
	await page.getByTestId('astro-tab').getByRole('radio', { name: 'Applicants' }).click();
	await page.getByTestId('astro-hire-pilot').click();
	await expect(page.getByText('A new pilot joined.')).toBeVisible({ timeout: 30_000 });
	await page.getByTestId('astro-tab').getByRole('radio', { name: 'Applicants' }).click();
	await page.getByTestId('astro-hire-engineer').click();
	await expect(page.getByText('A new engineer joined.')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('astro-member')).toHaveCount(2);

	await page.evaluate((d) => localStorage.setItem('orbital.design', JSON.stringify(d)), twoPods);
	await page.goto('/launch');
	const crew = page.locator('[data-testid^="launch-crew-"]');
	await expect(crew).toHaveCount(2, { timeout: 30_000 });
	await crew.nth(0).click();
	await crew.nth(1).click();
	await expect(page.getByText('Crew · 2 of 2 seats')).toBeVisible();
	await page.getByTestId('launch-go').click();

	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByTestId('crew-row')).toHaveCount(2, { timeout: 30_000 });
	await expect(page.getByTestId('crew-suit').first()).toHaveText('IVA');
	expect(errors).toEqual([]);
});
