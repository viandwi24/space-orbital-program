/**
 * Launch stability (plan 047): a fresh launch must reach and keep the `flying` state. The page
 * text is asserted for the "Vessel lost" card for a few seconds after the HUD appears, because
 * the loss used to show up one HUD period (100 ms) after the first frame. Console errors are the
 * smoke suite's business, not this test's.
 */
import { expect, test } from '@playwright/test';
import { launchTwoStage } from './support';

test('a fresh launch stays on the pad: no "Vessel lost" card', async ({ page }) => {
	await launchTwoStage(page);
	// Several HUD periods and sim ticks; the card replaces the HUD, so poll the page text.
	for (let i = 0; i < 20; i += 1) {
		const lost = await page.getByText('Vessel lost').count();
		if (lost > 0) {
			const shown = (
				await page
					.locator('body')
					.innerText()
					.catch(() => '')
			).slice(0, 1000);
			throw new Error(`Vessel lost on the pad. Page text:\n${shown}`);
		}
		await page.waitForTimeout(150);
	}
	await expect(page.getByTestId('hud-met')).toBeVisible();
});

test('Hangar, Launch screen, flight: the vessel stands on the chosen pad (plan 094)', async ({
	page
}) => {
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.getByRole('button', { name: /^Launch/ }).click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	const pad = page.getByTestId('launch-facility-legacy-pad');
	await pad.click();
	await expect(pad).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByTestId('launch-design').first()).toContainText('Two-stage');
	await expect(page.getByTestId('launch-go')).toHaveText(/Launch from pad/);
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	// standing on the pad: landed on the home planet, and still there a moment later
	await expect(page.getByText(/landed on home/i).first()).toBeVisible({ timeout: 30_000 });
	await page.waitForTimeout(2000);
	await expect(page.getByText('Vessel lost')).toHaveCount(0);
	// the choice was for this flight only
	expect(await page.evaluate(() => localStorage.getItem('orbital.launch'))).toBeNull();
});
