import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

/**
 * Worlds (plan 087, ADR 0143): create a Career world, enter it (the Space Center, then the VAB), launch and
 * quicksave in it, and it is listed first with its save.
 */
test('create a Career world, enter it, fly and save in it, and it is listed first', async ({
	page
}) => {
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Moon program');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await expect(form.getByTestId('gravity-n-body')).toBeEnabled();
	await form.getByTestId('world-create').click();

	const first = page.getByTestId('world-card').first();
	await expect(first).toContainText('Moon program');
	await expect(first).toContainText('Career');
	await page.getByTestId('world-enter').click();

	// entering opens the Space Center (plan 091); its Hangar opens the VAB, the launch flies in the world
	await page.waitForURL('**/space-center');
	await page.getByTestId('sc-label-stock.hangar').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	const launch = page.getByRole('button', { name: /^Launch/ });
	await expect(launch).toBeEnabled();
	await launch.click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	// the Launch screen (plan 094)
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	// F5 until the flight can be saved (SwiftShader prepares the scenery for a while)
	await expect
		.poll(
			async () => {
				await page.keyboard.press('F5');
				return (await page.getByRole('status').allTextContents()).some((t) =>
					t.includes('Quicksaved.')
				);
			},
			{ timeout: 90_000, intervals: [2000] }
		)
		.toBe(true);

	await page.goto('/worlds');
	const top = page.getByTestId('world-card').first();
	await expect(top).toContainText('Moon program');
	await expect(top).toContainText('1 save');
	await expect(top).toContainText('Last played');

	// back in the Space Center the world's save runs (plan 096): an upgrade is paid from its funds
	// and written back as the world's newest save
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await page.getByTestId('sc-label-stock.launchpad-s').click({ timeout: 60_000 });
	await page.getByTestId('sc-upgrade').click();
	await expect(page.getByTestId('sc-attention')).toContainText(
		/Launchpad S: Level 1 · upgrading to 2/
	);
	await page.waitForTimeout(1500); // the autosave is written in the background
	await expect
		.poll(
			async () => {
				await page.goto('/worlds');
				return page.getByTestId('world-card').first().innerText();
			},
			{ timeout: 30_000, intervals: [1000] }
		)
		.toContain('2 saves');
	expect(errors).toEqual([]);
});
