/**
 * The move gizmo (plan 279, ADR 0258): drag a part's x arrow 0.5 m, save, reload, and it stands in
 * the same place (plan 304). Plan 304 adds the plane handles, covered by the renderer's unit tests.
 * Not run while the owner keeps e2e paused.
 */
import { expect, test } from '@playwright/test';
import { loadHangarExample } from './support';

interface Gizmo {
	centre: { x: number; y: number } | null;
	tips: Record<string, { x: number; y: number } | null>;
}
interface Hook {
	partAt(index: number): { x: number; y: number } | null;
	gizmo(): Gizmo | null;
	offsetOf(index: number): { x: number; y: number; z: number };
}
const hook = (page: import('@playwright/test').Page) =>
	page.evaluate(() => {
		const h = (window as unknown as { __orbitalVab: Hook }).__orbitalVab;
		return h.gizmo();
	});

test('a part moved 0.5 m with the gizmo is in the same place after a save and a reload', async ({
	page
}) => {
	test.setTimeout(180_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/vab');
	await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
	await loadHangarExample(page, 'loadTwoStage');
	await page.waitForTimeout(800);

	// select a tank (design index 1) and take the Move tool
	const at = await page.evaluate(() =>
		(window as unknown as { __orbitalVab: Hook }).__orbitalVab.partAt(1)
	);
	expect(at).not.toBeNull();
	await page.mouse.click(at!.x, at!.y);
	await page.getByTestId('tool-move').click();
	await page.waitForTimeout(300);

	const g = await hook(page);
	expect(g?.centre).toBeTruthy();
	const tip = g!.tips.x!;
	// the tip is one metre from the centre on screen: 0.5 m is half that distance
	const dx = (tip.x - g!.centre!.x) * 0.5;
	const dy = (tip.y - g!.centre!.y) * 0.5;
	const grab = {
		x: g!.centre!.x + (tip.x - g!.centre!.x) * 0.7,
		y: g!.centre!.y + (tip.y - g!.centre!.y) * 0.7
	};
	await page.mouse.move(grab.x, grab.y);
	await page.mouse.down();
	await page.mouse.move(grab.x + dx, grab.y + dy, { steps: 8 });
	await page.mouse.up();

	const offset = await page.evaluate(() =>
		(window as unknown as { __orbitalVab: Hook }).__orbitalVab.offsetOf(1)
	);
	expect(Math.hypot(offset.x, offset.y, offset.z)).toBeCloseTo(0.5, 1);

	await page.getByTestId('menu-save').click();
	await page.waitForTimeout(1500);
	await page.reload();
	await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
	await page.waitForTimeout(1500);
	const again = await page.evaluate(() =>
		(window as unknown as { __orbitalVab: Hook }).__orbitalVab.offsetOf(1)
	);
	expect(again.x).toBeCloseTo(offset.x, 6);
	expect(again.y).toBeCloseTo(offset.y, 6);
	expect(again.z).toBeCloseTo(offset.z, 6);
});
