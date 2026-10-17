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
