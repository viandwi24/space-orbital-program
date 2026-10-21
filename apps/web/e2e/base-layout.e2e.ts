import { expect, test, type Page } from '@playwright/test';
import { debugSetOrbit, launchTwoStage, watchErrors } from './support';

/**
 * Plan 233 (ADR 0222 point 1, `refs/space-orbital-program-ui-v2/docs/BASE_LAYOUT.md`): the time
 * bar and the menu bar 44 high at 24 from the edges, the status bar 32 high along the bottom, the
 * bell 26 × 26, the content in the safe area (top 80, sides 24, bottom 56), and nothing above the
 * bars but the two bars. Screenshots at 1920 × 1080 and 1440 × 900 for the journal.
 */

type Box = {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
};

async function box(page: Page, selector: string): Promise<Box> {
	const r = await page
		.locator(selector)
		.first()
		.evaluate((el) => el.getBoundingClientRect().toJSON());
	return r as Box;
}

async function bars(page: Page, width: number, height: number): Promise<void> {
	const time = await box(page, '[data-testid="time-bar"]');
	expect([time.left, time.top, time.height]).toEqual([24, 24, 44]);
	const menu = await box(page, '[data-testid="menu-bar"]');
	expect([width - menu.right, menu.top, menu.height]).toEqual([24, 24, 44]);
	const status = await box(page, '[data-testid="status-bar"]');
	expect([status.left, status.width, status.height, status.bottom]).toEqual([0, width, 32, height]);
	const bell = await box(page, '[data-testid="status-bell"]');
	expect([bell.width, bell.height]).toEqual([26, 26]);
	// the menu bar: page actions | Vessel · Map · Space Center · VAB | Menu (BASE_LAYOUT §3)
	const fixed = page.getByTestId('menu-bar').locator('a');
	expect(await fixed.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([
		'Vessel',
		'Map',
		'Space Center',
		'VAB'
	]);
}

/** Visible elements that reach into the top 80 px outside the two bars (big backdrops aside). */
async function aboveTheBars(page: Page): Promise<string[]> {
	return page.evaluate(() => {
		const bars = [
			...document.querySelectorAll('[data-testid="time-bar"], [data-testid="menu-bar"]')
		];
		const out: string[] = [];
		for (const el of document.body.querySelectorAll('*')) {
			if (bars.some((b) => b.contains(el) || el.contains(b))) continue;
			if (el.closest('[data-testid^="sc-label-"]') || el instanceof HTMLCanvasElement) continue;
			const r = el.getBoundingClientRect();
			// 1 px and smaller: screen-reader text (SvelteKit's route announcer sits at 0, 0)
			if (r.width <= 1 || r.height <= 1 || r.top >= 80 || r.bottom <= 0) continue;
			// the page's own full-window layers (the 3D view, the HUD root) are under the bars by design
			if (r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.5) continue;
			const css = getComputedStyle(el);
			if (css.visibility === 'hidden' || css.display === 'contents' || Number(css.opacity) === 0)
				continue;
			out.push(
				`${el.tagName.toLowerCase()}#${el.id}.${[...el.classList].join('.')} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`
			);
		}
		return out;
	});
}

async function shoot(page: Page, name: string): Promise<void> {
	await page.waitForTimeout(800);
	await page.screenshot({ path: test.info().outputPath(`233-${name}.jpg`), quality: 85 });
}

for (const [width, height] of [
	[1920, 1080],
	[1440, 900]
] as const) {
	test(`${width} × ${height}: the Space Center on the Base layout`, async ({ page }) => {
		test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the layout');
		const errors = watchErrors(page);
		await page.setViewportSize({ width, height });
		await page.goto('/space-center');
		await expect(page.locator('[data-testid^="sc-label-"]').first()).toBeVisible({
			timeout: 60_000
		});
		await bars(page, width, height);
		// v3 (plan 273, V3 §1): the context bar at bottom 52; the Buildings list at top 80, right 24, 280 wide
		const context = await box(page, '[data-testid="sc-overview-bar"]');
		expect([height - context.bottom, context.height]).toEqual([52, 44]);
		await page.getByTestId('sc-buildings').click();
		const side = await box(page, '[data-testid="sc-buildings-list"]');
		expect([side.top, width - side.right, side.width]).toEqual([80, 24, 280]);
		await expect(page.getByTestId('nav-space-center')).toHaveAttribute('aria-current', 'page');
		await expect(page.getByTestId('nav-mission-center')).toBeVisible();
		await expect(page.getByTestId('status-location')).toContainText('Space Center');
		expect(await aboveTheBars(page)).toEqual([]);
		await shoot(page, `space-center-${width}`);
		expect(errors).toEqual([]);
	});

	test(`${width} × ${height}: Flight on the Base layout`, async ({ page }) => {
		test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the layout');
		const errors = watchErrors(page);
		await page.setViewportSize({ width, height });
		// the first-flight guide is not in the design's frame
		await page.addInitScript(() => {
			const stored = JSON.parse(localStorage.getItem('orbital.settings') ?? '{}');
			localStorage.setItem(
				'orbital.settings',
				JSON.stringify({ ...stored, v: 4, tutorial: { status: 'skipped', step: 0 } })
			);
		});
		await launchTwoStage(page);
		await expect(page.getByTestId('staging')).toBeVisible({ timeout: 60_000 });
		await bars(page, width, height);
		// the dock at top 80 and left 24, its Overview open; staging at right 24, bottom 56 (V3 §2.5)
		const left = await box(page, '.ui > .tl');
		expect([left.top, left.left]).toEqual([80, 24]);
		await expect(page.getByTestId('vessel-panel')).toBeVisible();
		const staging = await box(page, '.ui > .br');
		expect([width - staging.right, height - staging.bottom]).toEqual([24, 56]);
		const nav = await box(page, '.ui > .bc');
		expect(height - nav.bottom).toBe(56);
		// the vessel and its situation in the status bar; T+ in the time bar; Vessel active
		await expect(page.getByTestId('status-location')).toContainText('Two-stage');
		await expect(page.getByTestId('hud-phase-text')).toBeVisible();
		await expect(page.getByTestId('hud-met')).toHaveText(/^T\+ /);
		await expect(page.getByTestId('nav-vessel')).toHaveAttribute('aria-current', 'page');
		for (const name of ['Panel dock', 'Navball', 'Staging', 'Change camera'])
			await expect(page.getByTestId('menu-bar').getByRole('button', { name })).toBeVisible();
		expect(await aboveTheBars(page)).toEqual([]);
		// the design's frame: in orbit, the vessel panel open
		await debugSetOrbit(page, { apoapsis: 100_000, periapsis: 100_000 });
		await shoot(page, `flight-${width}`);
		// the navball module: 552 x 232 at 100 % (V3 §2.4)
		const deck = await box(page, '.ui > .bc .deck');
		expect([Math.round(deck.width), Math.round(deck.height)]).toEqual([552, 232]);
		expect(errors).toEqual([]);
	});
}
