/**
 * Plan 238: the Hangar's camera climbs the whole of a tall vessel, and the page has one top bar.
 * A pod on twelve 4 m tanks (about 50 m, past the old fixed 34 m) is loaded as the draft; the wheel
 * scrolled up takes the camera's target to the top of the stack. The Hangar draws no bar of its own:
 * New, Open, Save and Launch are in the shell's menu bar, the vessel's name in the left column.
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

const TANKS = 12;
const design = {
	formatVersion: 3,
	name: 'Tall stack',
	parts: [
		{ index: 0, part: 'stock.command-pod', parent: null },
		...Array.from({ length: TANKS }, (_, i) => ({
			index: i + 1,
			part: 'stock.tank-medium',
			parent: { index: i, parentNode: 'bottom', node: 'top' }
		}))
	],
	stages: []
};

interface Hook {
	parts(): unknown[];
	camera(): { target: [number, number, number]; panTop: number } | null;
}
const camera = (page: Page) =>
	page.evaluate(() => (window as unknown as { __orbitalVab: Hook }).__orbitalVab.camera()!);

test('the wheel climbs a 50 m stack to its top; one top bar', async ({ page }) => {
	const errors = watchErrors(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/vab');
	await page.evaluate((d) => localStorage.setItem('orbital.design', JSON.stringify(d)), design);
	await page.goto('/vab');
	await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __orbitalVab: Hook }).__orbitalVab.parts().length)
		)
		.toBe(TANKS + 1);

	// the ceiling follows the vessel: well past the old 34 m
	await expect.poll(async () => (await camera(page)).panTop).toBeGreaterThan(48);
	const { panTop } = await camera(page);
	const box = (await page.locator('canvas').first().boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -200);
	await expect.poll(async () => (await camera(page)).target[1]).toBeCloseTo(panTop, 3);
	expect(panTop).toBeGreaterThan(4 * TANKS);

	// one menu bar; the Hangar's own bar is gone, its actions live on
	await expect(page.getByTestId('menu-bar')).toHaveCount(1);
	await expect(page.locator('.vab .top')).toHaveCount(0);
	await expect(page.getByRole('toolbar', { name: 'Vessel file' })).toHaveCount(0);
	for (const id of ['menu-new', 'menu-open', 'menu-save', 'menu-launch'])
		await expect(page.getByTestId(id)).toBeVisible();
	await expect(page.getByRole('button', { name: /^Launch/ })).toHaveCount(1);
	const name = page.getByRole('textbox', { name: 'Vessel name' });
	await expect(name).toHaveValue('Tall stack');
	await expect(page.getByTestId('vab-aircraft')).toBeVisible();
	await expect(page.getByRole('button', { name: 'High-contrast markers' })).toBeVisible();
	expect(errors).toEqual([]);
});
