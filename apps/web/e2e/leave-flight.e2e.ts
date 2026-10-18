import { expect, test } from '@playwright/test';
import { debugSetLocation, launchTwoStage, watchErrors } from './support';

/** Plan 205 (ADR 0201 point 9): leaving an active flight asks; the vessel keeps flying in the world. */
const altitude = (page: import('@playwright/test').Page): Promise<number> =>
	page.evaluate(() => {
		const api = (
			window as unknown as {
				__orbitalDebug: { vessel(): { position: { x: number; y: number; z: number } } | null };
			}
		).__orbitalDebug;
		const p = api.vessel()?.position;
		return p ? Math.hypot(p.x, p.y, p.z) : NaN;
	});

test('leaving Flight at 5 km asks; "Leave anyway" goes on and the vessel keeps moving', async ({
	page
}) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0,
		altitude: 5000,
		speed: 150
	});
	await page.getByTestId('nav-space-center').click();
	await expect(page.getByTestId('leave-flight')).toBeVisible();
	await page.getByTestId('leave-stay').click();
	await expect(page).toHaveURL(/\/flight/);

	await page.getByTestId('nav-space-center').click();
	await page.getByTestId('leave-anyway').click();
	await page.waitForURL('**/space-center');
	const first = await altitude(page);
	expect(Number.isFinite(first)).toBe(true);
	await expect.poll(() => altitude(page), { timeout: 20_000 }).not.toBeCloseTo(first, 0);
	expect(errors).toEqual([]);
});
