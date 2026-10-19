import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

/**
 * Plan 234 (ADR 0228): the deep-space dish built at the Space Center through the debug API, seen
 * from four sides. The screenshots go to `test-results/` for the journal; the owner judges them.
 */
type Debug = {
	send(command: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }>;
};

async function place(page: Page): Promise<string> {
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	for (const [i, j] of [
		[6, 6],
		[-14, 6],
		[6, -14],
		[12, 12],
		[-16, -16],
		[20, 20]
	] as const) {
		const r = await page.evaluate(
			(cell) =>
				(window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.send({
					type: 'place-building',
					site: 'legacy',
					kind: 'stock.deep-space-dish',
					cell,
					rotation: 0,
					id: 'dsn-1'
				}),
			{ i, j }
		);
		if (r.ok) return `${i},${j}`;
	}
	throw new Error('no free 8 × 8 cells for the dish');
}

test('the deep-space dish stands at the Space Center, seen from four sides', async ({ page }) => {
	test.setTimeout(180_000);
	const errors = watchErrors(page);
	await page.goto('/space-center');
	const rows = page.locator('[data-testid^="sc-row-"]');
	await expect(rows.first()).toBeVisible({ timeout: 60_000 });
	const before = await rows.count();
	await place(page);
	await expect(rows).toHaveCount(before + 1, { timeout: 20_000 });
	await expect(page.getByTestId('sc-label-stock.deep-space-dish')).toBeVisible();

	// four views: the opening view, then a quarter turn of the site camera each
	const canvas = page.getByTestId('sc-canvas');
	const box = (await canvas.boundingBox())!;
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	// closer: the wheel zooms the site camera (it looks at the pad) to about half its distance
	await page.mouse.move(cx, cy);
	for (let k = 0; k < 2; k++) {
		await page.mouse.wheel(0, -300);
		await page.waitForTimeout(100);
	}
	await page.waitForTimeout(3_000); // the dish slews from its stow toward the moon
	for (let n = 1; n <= 4; n++) {
		await page.screenshot({
			path: `test-results/deep-space-dish-${n}.jpg`,
			type: 'jpeg',
			quality: 80
		});
		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx + 314, cy - 20, { steps: 10 }); // 0.005 rad/px: about 90°
		await page.mouse.up();
		await page.waitForTimeout(500);
	}
	expect(errors).toEqual([]);
});
