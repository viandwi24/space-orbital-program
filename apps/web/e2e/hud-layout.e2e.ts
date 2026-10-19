import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

/**
 * Plan 215 (ADR 0205 points 5 to 7): the flight HUD's regions at three window sizes do not overlap,
 * a tall staging stack scrolls inside, at most four toasts show, and opening the vessel panel does
 * not move the vessel on screen.
 */

/** Pod, five decouplers, a tank and an engine: six stages. */
const tower = {
	formatVersion: 3,
	name: 'Six stages',
	parts: [
		{ index: 0, part: 'stock.command-pod', parent: null },
		...[1, 2, 3, 4, 5].map((i) => ({
			index: i,
			part: 'stock.decoupler',
			parent: { index: i - 1, parentNode: 'bottom', node: 'top' }
		})),
		{ index: 6, part: 'stock.tank-small', parent: { index: 5, parentNode: 'bottom', node: 'top' } },
		{ index: 7, part: 'stock.engine-lv', parent: { index: 6, parentNode: 'bottom', node: 'top' } }
	],
	stages: [[7], [5], [4], [3], [2], [1]]
};

async function fly(page: Page, width: number, height: number): Promise<void> {
	await page.setViewportSize({ width, height });
	await page.addInitScript(() => {
		const stored = JSON.parse(localStorage.getItem('orbital.settings') ?? '{}');
		localStorage.setItem('orbital.settings', JSON.stringify({ ...stored, v: 4, touch: 'off' }));
	});
	await page.goto('/vab');
	await page.evaluate((d) => localStorage.setItem('orbital.design', JSON.stringify(d)), tower);
	await page.goto('/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByTestId('staging')).toBeVisible();
}

/** Visible boxes of the HUD's regions, by name. */
async function regions(page: Page): Promise<Record<string, DOMRect>> {
	return page.evaluate(() => {
		const out: Record<string, DOMRect> = {};
		const pick: Record<string, string> = {
			capsules: '.ui > .tl .capsules',
			toolbar: '.ui > .tb',
			situation: '.ui > .tc [data-testid="hud-phase-text"]',
			staging: '.ui > .bl',
			navball: '.ui > .bc',
			crew: '.ui > .br',
			side: '.ui > .tr'
		};
		for (const [name, sel] of Object.entries(pick)) {
			const el = document.querySelector(sel);
			if (!el) continue;
			const r = el.getBoundingClientRect();
			if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden')
				out[name] = r.toJSON() as DOMRect;
		}
		return out;
	});
}

const overlaps = (a: DOMRect, b: DOMRect): boolean =>
	a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

for (const [width, height] of [
	[1440, 900],
	[1280, 800],
	[1024, 768]
] as const) {
	test(`${width} × ${height}: regions do not overlap, staging scrolls inside, four toasts at most`, async ({
		page
	}) => {
		test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the layout');
		const errors = watchErrors(page);
		await fly(page, width, height);
		const boxes = await regions(page);
		const names = Object.keys(boxes);
		for (let i = 0; i < names.length; i++)
			for (let j = i + 1; j < names.length; j++)
				expect(
					overlaps(boxes[names[i]!]!, boxes[names[j]!]!),
					`${names[i]} and ${names[j]} at ${width} × ${height}`
				).toBe(false);
		// staging stays on screen and scrolls inside its capped box
		const staging = boxes.staging!;
		expect(staging.top).toBeGreaterThanOrEqual(0);
		expect(await page.locator('.ui > .bl').evaluate((el) => getComputedStyle(el).overflowY)).toBe(
			'auto'
		);

		await page.evaluate(() => {
			const api = (
				window as unknown as {
					__orbitalDebug: { toast(kind: string, title: string): void };
				}
			).__orbitalDebug;
			for (let i = 0; i < 6; i++) api.toast('warning', `Warning ${i + 1}`);
		});
		await expect(page.getByText('Warning 6')).toBeVisible();
		expect(await page.locator('.toasts > .toast').count()).toBeLessThanOrEqual(4);
		// the toasts never cover the navball
		const toasts = await page.locator('.toasts').boundingBox();
		expect(overlaps(toasts as DOMRect, boxes.navball!)).toBe(false);
		expect(errors).toEqual([]);
	});
}

test('opening and closing the vessel panel does not move the vessel on screen', async ({
	page
}) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the camera');
	await fly(page, 1440, 900);
	const at = () =>
		page.evaluate(() =>
			(
				window as unknown as {
					__orbitalDebug: { vesselOnScreen(): { x: number; y: number } | null };
				}
			).__orbitalDebug.vesselOnScreen()
		);
	await expect.poll(at, { timeout: 30_000 }).not.toBeNull();
	await page.waitForTimeout(1500);
	const before = (await at())!;
	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await expect(page.getByTestId('vessel-panel')).toBeVisible();
	await page.waitForTimeout(600);
	const open = (await at())!;
	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await page.waitForTimeout(600);
	const closed = (await at())!;
	for (const p of [open, closed]) {
		expect(Math.hypot(p.x - before.x, p.y - before.y)).toBeLessThan(2);
	}
});
