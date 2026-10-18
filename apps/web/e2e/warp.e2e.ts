import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, debugSetOrbit, launchTwoStage, watchErrors } from './support';

/** Plan 206 (ADR 0202): warp-to an apsis stops just before it; a clamped request says why. */
const HOME_MU = 3.5316e12;

/** Seconds from now to the next apoapsis of the focused vessel. */
const toApoapsis = (page: Page): Promise<number> =>
	page.evaluate((mu) => {
		const api = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): { orbit?: { a: number; e: number; m0: number; epoch: number } } | null;
					state(): unknown;
				};
			}
		).__orbitalDebug;
		const o = api.vessel()?.orbit;
		const t = Number(document.querySelector('[data-testid="world-clock"]')?.getAttribute('data-t'));
		if (!o) return NaN;
		const n = Math.sqrt(mu / o.a ** 3);
		const m = (((o.m0 + n * (t - o.epoch)) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
		return ((((Math.PI - m) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) / n;
	}, HOME_MU);

test('warp-to Ap stops within the margin before apoapsis', async ({ page }) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await debugSetOrbit(page, { apoapsis: 200_000, periapsis: 100_000, m0: 0.2 });
	const before = await toApoapsis(page);
	expect(before).toBeGreaterThan(300);
	await page.getByTestId('warp-to-ap').click();
	await expect(page.getByTestId('hud-warp')).not.toHaveText('1x', { timeout: 10_000 });
	await expect(page.getByTestId('hud-warp')).toHaveText('1x', { timeout: 90_000 });
	const left = await toApoapsis(page);
	expect(left).toBeGreaterThan(0);
	expect(left).toBeLessThan(20); // the 15 s margin, and the frames since
	expect(errors).toEqual([]);
});

test('at 10 km a 1k× request is clamped and the time bar shows the reason', async ({ page }) => {
	const errors = watchErrors(page);
	await launchTwoStage(page);
	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0,
		altitude: 10_000,
		speed: 250
	});
	// six steps up: 2, 4, 10, 50, 100, 1k; the sim grants 10×
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 10, y: 10 } });
	for (let i = 0; i < 6; i++) await page.keyboard.press('.');
	await expect(page.getByTestId('hud-warp')).toHaveText('10x');
	await expect(page.getByTestId('warp-reason')).toHaveText('Max 10× — in the atmosphere');
	expect(errors).toEqual([]);
});
