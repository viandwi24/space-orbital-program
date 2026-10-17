/**
 * Small screens in emulation (plan 055, ADR 0091): touch tablets at the sizes we support must not
 * have panels over each other or taps taken by the wrong element; phones get the right notice. It
 * is the desktop engine with a touch screen and a viewport, not a device (`product/browser-support.md`).
 * Chromium only; `E2E_SHOTS=1` also writes the JPG screenshots of `docs/journal/assets/055-*.jpg`.
 */
import { devices, expect, test, type Page } from '@playwright/test';
import { resolve } from 'node:path';

import { launchTwoStage, watchErrors } from './support';

const SHOTS = process.env.E2E_SHOTS === '1';
const shotDir = resolve(import.meta.dirname, '../../../docs/journal/assets');

async function shot(page: Page, name: string): Promise<void> {
	if (!SHOTS) return;
	await page.screenshot({ path: `${shotDir}/055-${name}.jpg`, type: 'jpeg', quality: 85 });
}

test.use({ ...devices['Desktop Chrome'], hasTouch: true });
test.beforeEach(({}, info) => {
	test.skip(info.project.name !== 'chromium', 'small screens are checked in one engine');
});

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}
const boxOf = async (page: Page, selector: string): Promise<Box> => {
	const box = await page.locator(selector).first().boundingBox();
	if (!box) throw new Error(`no box for ${selector}`);
	return box;
};
const overlap = (a: Box, b: Box): number => {
	const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
	const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
	return w > 0 && h > 0 ? w * h : 0;
};

for (const size of [
	{ name: 'tablet-1024x768', width: 1024, height: 768 },
	{ name: 'tablet-1180x820', width: 1180, height: 820 }
]) {
	test(`${size.name}: the flight panels clear the instrument deck and the touch controls clear the script panel`, async ({
		page
	}) => {
		const errors = watchErrors(page);
		await page.setViewportSize({ width: size.width, height: size.height });
		await launchTwoStage(page);
		await expect(page.getByTestId('touch-controls')).toBeVisible();
		await page.getByRole('button', { name: 'Script panel' }).tap();
		await expect(page.getByLabel('Script source')).toBeVisible();
		// let the insets and the deck measurement settle
		await page.waitForTimeout(400);

		const deck = await boxOf(page, '.deck');
		for (const [name, selector] of [
			['script panel', '.script'],
			['orbit and maneuver strip', '.bl'],
			['right column', '.tr']
		] as const) {
			const box = await boxOf(page, selector);
			expect(overlap(box, deck), `${name} overlaps the instrument deck`).toBe(0);
		}
		// the throttle track is not under the script panel, nor under the deck
		const track = await boxOf(page, '[data-testid="touch-throttle"]');
		expect(overlap(track, await boxOf(page, '.script'))).toBe(0);
		expect(overlap(track, deck)).toBe(0);
		// nothing of the touch overlay takes a tap meant for the script panel's last controls
		const run = page.getByRole('button', { name: 'Run', exact: true });
		await run.scrollIntoViewIfNeeded();
		const hit = await run.evaluate((el) => {
			const r = el.getBoundingClientRect();
			const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
			return top === el || el.contains(top);
		});
		expect(hit, 'the Run button receives taps').toBe(true);
		await shot(page, `${size.name}-flight-script-touch`);
		expect(errors).toEqual([]);
	});

	test(`${size.name}: with the guide showing, the touch throttle is clear of it and of the deck`, async ({
		page
	}) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await launchTwoStage(page);
		await expect(page.getByTestId('touch-controls')).toBeVisible();
		await page.waitForTimeout(400);
		const track = await boxOf(page, '[data-testid="touch-throttle"]');
		const left = await boxOf(page, '.tl');
		expect(overlap(track, left), 'the throttle track is under the top-left stack').toBe(0);
		const full = await boxOf(page, '[data-testid="touch-full"]');
		expect(overlap(full, left), 'the Full button is under the top-left stack').toBe(0);
		expect(overlap(track, await boxOf(page, '.deck'))).toBe(0);
	});

	test(`${size.name}: the target card is reachable by scrolling the right column`, async ({
		page
	}) => {
		await page.setViewportSize({ width: size.width, height: size.height });
		await launchTwoStage(page);
		await page.waitForTimeout(400);
		const column = page.locator('.tr');
		const reach = await column.evaluate((el) => ({
			scrollable: el.scrollHeight > el.clientHeight,
			bottom: el.getBoundingClientRect().bottom
		}));
		const deck = await boxOf(page, '.deck');
		expect(reach.bottom).toBeLessThanOrEqual(deck.y);
		// scroll the column to its end: the Target card is then fully inside the column
		await column.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		const target = page.getByText('Target', { exact: true }).first();
		const t = (await target.boundingBox())!;
		const c = await boxOf(page, '.tr');
		expect(t.y + t.height).toBeLessThanOrEqual(c.y + c.height + 1);
		if (reach.scrollable) expect(t.y).toBeGreaterThanOrEqual(c.y - 1);
	});
}

test('the menu and the VAB have no horizontal scroll at the supported sizes', async ({ page }) => {
	for (const [width, height] of [
		[1024, 768],
		[1180, 820],
		[1366, 1024]
	] as const) {
		await page.setViewportSize({ width, height });
		for (const path of ['/', '/vab']) {
			await page.goto(path);
			await page.waitForLoadState('networkidle');
			const overflow = await page.evaluate(
				() => document.documentElement.scrollWidth - document.documentElement.clientWidth
			);
			expect(overflow, `${path} at ${width}x${height}`).toBeLessThanOrEqual(0);
		}
	}
});

test('the page covers the whole screen and reads the safe-area insets', async ({ page }) => {
	await page.goto('/');
	const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
	expect(viewport).toContain('viewport-fit=cover');
	// env() is 0 on a screen without a notch, but the tokens must resolve to lengths
	const resolved = await page.evaluate(() => {
		const probe = document.createElement('div');
		probe.style.paddingTop = 'var(--safe-top)';
		document.body.append(probe);
		const value = getComputedStyle(probe).paddingTop;
		probe.remove();
		return value;
	});
	expect(resolved).toMatch(/^\d+(\.\d+)?px$/);
});

for (const phone of [
	{ name: 'phone-portrait-390x844', width: 390, height: 844, screen: 'phone-portrait' },
	{ name: 'phone-landscape-844x390', width: 844, height: 390, screen: 'phone-landscape' },
	{ name: 'tablet-portrait-768x1024', width: 768, height: 1024, screen: 'tablet-portrait' }
]) {
	test(`${phone.name}: the notice says which screen this is and can be dismissed`, async ({
		page
	}) => {
		await page.setViewportSize({ width: phone.width, height: phone.height });
		await page.goto('/');
		const notice = page.getByTestId('small-screen-notice');
		await expect(notice).toBeVisible();
		await expect(notice).toHaveAttribute('data-screen', phone.screen);
		await shot(page, `${phone.name}-menu-notice`);
		// the notice does not cover more than half of the screen
		const box = (await notice.boundingBox())!;
		expect(box.height).toBeLessThan(phone.height / 2);
		await page.getByTestId('small-screen-continue').tap();
		await expect(notice).toHaveCount(0);
	});
}

test('rotating a phone from portrait to landscape updates the notice', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await expect(page.getByTestId('small-screen-notice')).toHaveAttribute(
		'data-screen',
		'phone-portrait'
	);
	await page.setViewportSize({ width: 844, height: 390 });
	await expect(page.getByTestId('small-screen-notice')).toHaveAttribute(
		'data-screen',
		'phone-landscape'
	);
});
