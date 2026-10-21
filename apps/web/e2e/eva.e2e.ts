import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, watchErrors, openDock } from './support';

/**
 * EVA v2 (plan 225, ADR 0209): a crewed pod landed on Cinder by the debug API (plan 203). The
 * member steps out and focus moves to the suit, whose HUD shows its propellant. W walks the suit
 * (relative to the view), F grabs the pod's ladder, W climbs it, and B boards at it.
 */
const pod = {
	formatVersion: 3,
	name: 'Lander',
	parts: [
		{ index: 0, part: 'stock.command-pod', parent: null },
		{
			index: 1,
			part: 'stock.reaction-wheel',
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		}
	],
	stages: []
};

type P = { x: number; y: number; z: number };
const focusPosition = (page: Page): Promise<P | null> =>
	page.evaluate(() => {
		const v = (
			window as unknown as { __orbitalDebug: { vessel(): { position: P } | null } }
		).__orbitalDebug.vessel();
		return v ? { ...v.position } : null;
	});
const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

async function hold(page: Page, key: string, ms: number): Promise<void> {
	await page.keyboard.down(key);
	await page.waitForTimeout(ms);
	await page.keyboard.up(key);
}

test('step out on Cinder, walk, grab the ladder, climb and board', async ({ page }) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the EVA keys');
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await page.goto('/vab');
	await page.evaluate((d) => localStorage.setItem('orbital.design', JSON.stringify(d)), pod);
	await page.goto('/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	// the crew is a dock entry since v3 (plan 272, ADR 0253)
	await openDock(page, 'host.crew');
	await expect(page.getByTestId('crew-row')).toHaveCount(1, { timeout: 30_000 });

	await debugSetLocation(page, {
		kind: 'surface',
		body: 'stock.cinder',
		latitude: 0.1,
		longitude: 0.5
	});
	await page.waitForTimeout(3000);

	// step out: the crew panel turns to the suit, its chip reads EVA and its propellant shows
	await page.locator('[data-testid^="crew-eva-"]').first().click();
	await expect(page.getByTestId('crew-eva')).toBeVisible({ timeout: 30_000 });
	await expect(page.getByTestId('suit-propellant')).toContainText('kg', { timeout: 30_000 });
	await expect(page.getByTestId('crew-suit').first()).toHaveText('EVA');
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.waitForTimeout(1500);

	// W walks the suit, S walks it back to the pod
	const start = await focusPosition(page);
	expect(start).not.toBeNull();
	await hold(page, 'KeyW', 600);
	await page.waitForTimeout(400);
	const walked = await focusPosition(page);
	expect(dist(walked!, start!)).toBeGreaterThan(0.3);
	await hold(page, 'KeyS', 600);
	await page.waitForTimeout(800);

	// F grabs the ladder beside the hatch; W climbs it
	await page.keyboard.press('KeyF');
	await expect(page.getByTestId('crew-eva')).toContainText('on a ladder', { timeout: 10_000 });
	const onLadder = await focusPosition(page);
	await hold(page, 'KeyW', 700);
	await page.waitForTimeout(300);
	expect(dist((await focusPosition(page))!, onLadder!)).toBeGreaterThan(0.1);

	// B boards from the ladder: the member is back aboard
	await page.keyboard.press('KeyB');
	await expect(page.getByTestId('crew-eva')).toBeHidden({ timeout: 15_000 });
	await expect(page.getByTestId('crew-row')).toHaveCount(1, { timeout: 15_000 });
	await expect(page.getByTestId('crew-suit').first()).toHaveText('IVA');
	expect(errors).toEqual([]);
});
