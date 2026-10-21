import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

/**
 * Branch space centers (plan 236, ADR 0229): found a branch through the map picker in a Career
 * world, finish its HQ with the debug API, build a pad and a dish there, see it in the Mission
 * Center as a ground station, and launch from the branch's pad.
 */
type Result = { ok: boolean; reason?: string };
type Debug = {
	setCheat(cheat: string, on?: boolean): Promise<Result>;
	grant(what: { funds?: number }): Promise<Result>;
};
const grant = (page: Page, funds: number) =>
	page.evaluate(
		(f) => (window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.grant({ funds: f }),
		funds
	);
const instantConstruction = (page: Page) =>
	page.evaluate(() =>
		(window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.setCheat(
			'instant-construction',
			true
		)
	);

/** Build mode (plan 248): walk the pointer over the ground until the ghost may be placed, then click. */
async function placeGhost(page: Page): Promise<void> {
	const box = (await page.getByTestId('sc-canvas').boundingBox())!;
	for (const [fx, fy] of [
		[0.7, 0.7],
		[0.8, 0.6],
		[0.3, 0.75],
		[0.6, 0.85],
		[0.2, 0.6],
		[0.85, 0.8],
		[0.5, 0.8]
	] as const) {
		await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
		await page.waitForTimeout(150);
		if ((await page.getByTestId('sc-ghost').innerText()).includes('Click to place')) {
			await page.mouse.down();
			await page.mouse.up();
			return;
		}
	}
	throw new Error('no cell took the building');
}

test('found a branch, finish its HQ, build a pad and a dish, launch from it', async ({ page }) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the branch');
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Branch builders');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	await expect(page.locator('[data-testid^="sc-row-"]')).toHaveCount(4, { timeout: 60_000 });
	// Debug mode from the in-world menu's settings (plan 203), then the API is there
	await page.getByTestId('nav-menu').click();
	await page.getByTestId('nav-settings').click();
	await page.getByRole('tab', { name: 'Game' }).click();
	await page.getByTestId('setting-debug').click();
	await expect(page.getByTestId('setting-debug')).toHaveAttribute('aria-checked', 'true');
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 20_000 });
	expect(await grant(page, 3_000_000)).toMatchObject({ ok: true });
	await expect(page.getByTestId('hud-funds')).toContainText('3,1', { timeout: 10_000 });

	// the picker: walk the equator east of the HQ until a spot is allowed
	await page.getByTestId('sc-found-branch').click();
	const map = page.getByTestId('branch-map');
	await expect(map).toBeVisible();
	const found = page.getByTestId('branch-found');
	let allowed = false;
	for (let f = 0.56; f < 0.95 && !allowed; f += 0.01) {
		// measured each time: the dialog slides in as it opens
		const box = (await map.boundingBox())!;
		await page.mouse.click(box.x + box.width * f, box.y + box.height * 0.5);
		allowed = await found.isEnabled();
	}
	expect(allowed).toBe(true);
	await expect(page.getByTestId('branch-spot')).toContainText(
		'250,000 funds · HQ ready in 20 days'
	);
	// the spot is where the pointer was: on the equator
	await expect(page.getByTestId('branch-spot')).toContainText(/\b0\.\d° [NS],/);
	await page.screenshot({ path: test.info().outputPath('236-branch-picker.jpg'), quality: 85 });
	await page.getByTestId('branch-name').fill('East Branch');
	await found.click();

	// the world saves and reloads with the branch's ground; switch to it
	await page.waitForLoadState('load');
	// the site picker is in the Buildings list (plan 273, ADR 0254 point 2), once the page is back
	const select = page.getByTestId('sc-site');
	await expect(select).toBeAttached({ timeout: 60_000 });
	await page.getByTestId('sc-buildings').click();
	await expect(select).toBeVisible();
	// a world with no save yet keeps what was spent (plan 237): 3,100,000 less the 250,000 founding
	await expect(page.getByTestId('hud-funds')).toContainText('2,850,000', { timeout: 20_000 });
	await select.selectOption('branch-1');
	await expect(page.getByTestId('status-location')).toContainText('East Branch');
	await expect(page.getByTestId('sc-row-branch-1-hq')).toContainText('Under construction');
	// nothing else is built before the HQ
	await page.getByTestId('sc-build').click();
	await page.getByTestId('sc-cat-stock.launch').click();
	await expect(page.getByTestId('sc-build-stock.launchpad-s')).toContainText(
		'The branch HQ is still under construction'
	);

	// the debug API finishes the HQ (and builds what follows at once)
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 20_000 });
	expect(await instantConstruction(page)).toMatchObject({ ok: true });
	await expect(page.getByTestId('sc-row-branch-1-hq')).toContainText('running', {
		timeout: 10_000
	});
	await page.getByTestId('sc-build-stock.launchpad-s').click();
	await placeGhost(page);
	await expect(page.locator('[data-testid^="sc-row-"]')).toHaveCount(2, { timeout: 10_000 });
	await page.getByTestId('sc-cat-stock.comms').click();
	await page.getByTestId('sc-build-stock.tracking-dish').click();
	await placeGhost(page);
	await expect(page.locator('[data-testid^="sc-row-"]')).toHaveCount(3, { timeout: 10_000 });
	await expect(page.getByTestId('sc-problem')).toHaveCount(0);

	// the Mission Center lists it as a ground station
	await page.getByTestId('nav-mission-center').click();
	await page.waitForURL('**/mission-center');
	await expect(page.getByTestId('mc-site-branch-1')).toContainText('Branch', { timeout: 60_000 });
	await expect(page.getByTestId('mc-site-branch-1')).toContainText('Ground station', {
		timeout: 20_000
	});

	// launch from the branch's pad
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	const launch = page.getByRole('button', { name: /^Launch/ });
	await expect(launch).toBeEnabled();
	await launch.click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-site-branch-1').click();
	await expect(page.getByTestId('launch-site-branch-1')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('h1')).toHaveText('East Branch');
	await expect(page.getByTestId('launch-facilities').getByRole('radio')).toHaveCount(1);
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByTestId('hud-phase-text')).toHaveText(/On the pad/, { timeout: 30_000 });
	expect(errors).toEqual([]);
});
