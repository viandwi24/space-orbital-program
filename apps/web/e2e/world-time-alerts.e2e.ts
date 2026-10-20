import { expect, test } from '@playwright/test';
import { debugSetOrbit, launchTwoStage, watchErrors } from './support';

/**
 * Plan 247: warp stops at 1x, not 10x, when a vessel falls into the atmosphere, and the bell says
 * why. (Construction, power, deadline and crew stops are covered by the sim tests.)
 */
test('rails warp into the atmosphere stops at 1x and the bell says so', async ({ page }) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await launchTwoStage(page);
	// an orbit that dips to 40 km, started at its apoapsis
	await debugSetOrbit(page, { apoapsis: 200_000, periapsis: 40_000, m0: Math.PI });
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 10, y: 10 } });
	for (let i = 0; i < 6; i++) await page.keyboard.press('.');
	await expect(page.getByTestId('hud-warp')).not.toHaveText(/^1[x×]$/, { timeout: 10_000 });
	await expect(page.getByTestId('hud-warp')).toHaveText(/^1[x×]$/, { timeout: 120_000 });
	await page.getByTestId('status-bell').click();
	await expect(page.getByTestId('bell-feed')).toContainText('entered the atmosphere');
	expect(errors).toEqual([]);
});
