import { expect, test } from '@playwright/test';
import { watchErrors } from './support';

/**
 * Plan 248: the world shell works on every page. Warp from the Space Center, the Debug panel from
 * the Hangar, Save and Load in the menu, and the clock chip that lifts the Hangar's pause.
 */
test('warp from the Space Center, Debug and the menu from the Hangar', async ({ page }) => {
	const errors = watchErrors(page);
	await page.goto('/space-center');
	await expect(page.getByTestId('world-clock')).toBeVisible({ timeout: 60_000 });
	await page.getByRole('button', { name: 'Time warp 100×' }).click();
	await expect(page.getByTestId('hud-warp')).toHaveText('100×', { timeout: 10_000 });
	await page.getByRole('button', { name: 'Time warp 1×' }).click();
	await expect(page.getByTestId('hud-warp')).toHaveText('1×', { timeout: 10_000 });

	await page.getByTestId('sc-label-stock.hangar').click({ timeout: 60_000 });
	await page.getByTestId('sc-open').click();
	await page.waitForURL('**/vab');
	await expect(page.getByTestId('time-chip')).toHaveText('PAUSED · HANGAR');

	await page.keyboard.press('Alt+F12');
	await expect(page.getByTestId('debug-tab-cheats')).toBeVisible({ timeout: 10_000 });
	await page.keyboard.press('Escape');

	await page.getByTestId('nav-menu').click();
	await expect(page.getByTestId('nav-load')).toBeVisible();
	await expect(page.getByTestId('nav-debug')).toBeVisible();
	await page.getByTestId('nav-menu').click();

	// the chip lifts the Hangar's pause
	await page.getByTestId('time-chip').click();
	await expect(page.getByTestId('time-chip')).toHaveCount(0);
	expect(errors).toEqual([]);
});
