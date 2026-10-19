/**
 * Launch clamps and solid boosters (plan 210, ADR 0203): a probe with two BST-1 solid boosters and
 * two clamps stands on the pad until the first stage; staged, the clamps stay behind, and the
 * boosters burn on with the throttle cut, until they are empty.
 */
import { expect, test, type Page } from '@playwright/test';
import { debugAmount, watchErrors } from './support';

const SOLID = 'stock.solid-fuel';

const sides = (index: number, part: string, symmetry: number, offset: number) =>
	[0, Math.PI].map((a, k) => ({
		index: index + k,
		part,
		parent: {
			index: 1,
			parentNode: 'surface',
			node: 'radial',
			radial: { angle: a + offset, y: 0 }
		},
		symmetry
	}));

const design = {
	formatVersion: 3,
	name: 'Clamped SRB',
	parts: [
		{ index: 0, part: 'stock.probe-core', parent: null },
		{ index: 1, part: 'stock.tank-small', parent: { index: 0, parentNode: 'bottom', node: 'top' } },
		...sides(2, 'stock.booster', 1, 0),
		...sides(4, 'stock.launch-clamp', 2, Math.PI / 2)
	],
	// one stage: the boosters light and the clamps let go together
	stages: [[2, 3, 4, 5]]
};

async function launch(page: Page): Promise<void> {
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.goto('/vab?library');
	const library = page.getByRole('dialog', { name: 'Vessel library' });
	await library.locator('input[type=file]').setInputFiles({
		name: 'clamped-srb.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(design))
	});
	await expect(library.getByRole('status')).toHaveText(`Imported ${design.name}.`);
	await library
		.getByRole('listitem')
		.filter({ hasText: design.name })
		.getByRole('button', { name: 'Open' })
		.click();
	const go = page.getByRole('button', { name: /^Launch/ });
	await expect(go).toBeEnabled();
	await go.click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
}

interface Seen {
	radius: number;
	clamps: number;
}

async function seen(page: Page): Promise<Seen> {
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	return page.evaluate(() => {
		const v = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): {
						position: { x: number; y: number; z: number };
						parts: Array<{ definition: string }>;
					} | null;
				};
			}
		).__orbitalDebug.vessel()!;
		return {
			radius: Math.hypot(v.position.x, v.position.y, v.position.z),
			clamps: v.parts.filter((p) => p.definition === 'stock.launch-clamp').length
		};
	});
}

test('clamps hold the rocket until the first stage; the solid boosters ignore the throttle', async ({
	page
}) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await launch(page);
	const canvas = page.locator('canvas').first();
	await canvas.click({ position: { x: 20, y: 20 } });

	// on the pad with both clamps, and it stays there
	const pad = await seen(page);
	expect(pad.clamps).toBe(2);
	await page.waitForTimeout(3_000);
	expect(Math.abs((await seen(page)).radius - pad.radius)).toBeLessThan(0.5);
	const full = await debugAmount(page, SOLID);
	expect(full).toBeGreaterThan(600);

	// the first stage: the clamps stay behind and the rocket climbs
	await page.keyboard.press('Space');
	await expect.poll(async () => (await seen(page)).clamps, { timeout: 20_000 }).toBe(0);
	await expect
		.poll(async () => (await seen(page)).radius - pad.radius, { timeout: 30_000 })
		.toBeGreaterThan(50);

	// throttle cut: the boosters burn on regardless
	await page.keyboard.press('KeyX');
	const before = await debugAmount(page, SOLID);
	const height = (await seen(page)).radius;
	await page.waitForTimeout(3_000);
	expect(await debugAmount(page, SOLID)).toBeLessThan(before - 5);
	expect((await seen(page)).radius).toBeGreaterThan(height + 20);
	// and burn out
	await expect.poll(() => debugAmount(page, SOLID), { timeout: 120_000 }).toBeLessThan(0.01);
	expect(errors).toEqual([]);
});
