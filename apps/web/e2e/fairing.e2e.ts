/**
 * Fairings (plan 219, ADR 0224): a probe on a 1.25 m fairing base; in the Hangar the base gets two
 * sections and is closed; launched and placed 40 km up at 1000 m/s, staging throws the shell off
 * as two panels, and the base's Jettison is spent.
 */
import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, watchErrors } from './support';

const design = {
	formatVersion: 3,
	name: 'Faired probe',
	parts: [
		{ index: 0, part: 'stock.fairing-base', parent: null },
		{
			index: 1,
			part: 'stock.probe-core',
			parent: { index: 0, parentNode: 'top', node: 'bottom' }
		}
	],
	stages: [[0]]
};

interface Hook {
	partAt(index: number): { x: number; y: number } | null;
	parts(): Array<{ index: number; part: string }>;
}

const vesselState = (page: Page) =>
	page.evaluate(() => {
		const api = (
			window as unknown as {
				__orbitalDebug: {
					state(): unknown;
					vessel(): {
						parts: Array<{ definition: string; modules: Record<string, unknown> }>;
					} | null;
				};
			}
		).__orbitalDebug;
		const v = api.vessel()!;
		const base = v.parts.find((p) => p.definition === 'stock.fairing-base')!;
		return (base.modules['stock.fairing'] as { jettisoned: boolean; closed: boolean }) ?? null;
	});

test('build a fairing in the Hangar, launch, and stage it off', async ({ page }) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await page.goto('/vab');
	await page.evaluate((d) => localStorage.setItem('orbital.design', JSON.stringify(d)), design);
	await page.goto('/vab');
	await page.waitForFunction(() => '__orbitalVab' in window, null, { timeout: 60_000 });
	await expect
		.poll(() =>
			page.evaluate(() => (window as unknown as { __orbitalVab: Hook }).__orbitalVab.parts().length)
		)
		.toBe(2);

	// select the base: its fairing editor shows
	await page.waitForTimeout(800); // the camera frames the vessel
	const at = await page.evaluate(() =>
		(window as unknown as { __orbitalVab: Hook }).__orbitalVab.partAt(0)
	);
	await page.mouse.click(at!.x, at!.y);
	const editor = page.getByTestId('fairing-editor');
	await expect(editor).toBeVisible();
	await expect(page.getByTestId('fairing-status')).toContainText('No shell yet');
	await page.getByTestId('fairing-add').click();
	await page.getByTestId('fairing-add').click();
	await expect(page.getByTestId('fairing-section')).toHaveCount(2);
	await page.getByLabel('Section 1 radius').fill('0.8');
	await page.getByLabel('Section 1 radius').press('Enter');
	await page.getByLabel('Section 2 radius').fill('0.8');
	await page.getByLabel('Section 2 radius').press('Enter');
	await page.getByTestId('fairing-close').click();
	await expect(page.getByTestId('fairing-status')).toContainText('Closed');

	// launch it
	await page.getByTestId('menu-launch').click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	expect(await vesselState(page)).toMatchObject({ jettisoned: false, closed: true });

	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0.3,
		altitude: 40_000,
		speed: 1_000,
		climb: 0.3
	});
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } });
	await page.keyboard.press('Space');
	await expect
		.poll(() => vesselState(page), { timeout: 20_000 })
		.toMatchObject({ jettisoned: true });
	// the vessel panel's Jettison is spent
	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await page.getByTestId('vessel-tab-parts').click();
	const jettison = page.locator('[data-testid$="-jettison"]').first();
	if (await jettison.count()) await expect(jettison).toBeDisabled();
	expect(errors).toEqual([]);
});
