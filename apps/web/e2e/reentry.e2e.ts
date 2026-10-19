import { expect, test } from '@playwright/test';
import { debugSetLocation, watchErrors } from './support';

/**
 * Plan 212 (ADR 0204): a capsule entering at 60 km and 2300 m/s heats its shield. The vessel panel
 * shows the shield's temperature bar with the value in text, and the capsule comes down whole under
 * its chute.
 */
const capsule = {
	formatVersion: 3,
	name: 'Capsule',
	parts: [
		{ index: 0, part: 'stock.command-pod', parent: null },
		{
			index: 1,
			part: 'stock.parachute',
			parent: { index: 0, parentNode: 'top', node: 'bottom' }
		},
		{
			index: 2,
			part: 'stock.heat-shield',
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		}
	],
	stages: [[1]]
};

test('the shield heats on entry, the panel shows its temperature, the capsule lands intact', async ({
	page
}) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the entry');
	test.setTimeout(300_000);
	const errors = watchErrors(page);
	await page.goto('/vab');
	await page.evaluate((d) => localStorage.setItem('orbital.design', JSON.stringify(d)), capsule);
	await page.goto('/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await page.getByTestId('vessel-tab-parts').click();

	// 23 degrees down: steep enough to heat, shallow enough for the chute to save it
	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0.3,
		altitude: 60_000,
		speed: 2_300,
		climb: -0.4
	});
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('Space'); // arm the chute
	const shield = page.locator('[data-testid$="-temperature"]').first();
	await expect(shield).toBeVisible({ timeout: 60_000 });
	await expect(shield).toHaveText(/^\d+ K of 3300 K$/);

	// the long glide down is skipped: under the chute's height, then near the ground once it is open
	const where = { kind: 'air', latitude: 0, longitude: 0.3, climb: -Math.PI / 2 };
	await debugSetLocation(page, { ...where, altitude: 1_200, speed: 80 });
	await expect(page.locator('[data-testid$="-status"]').first()).toHaveText('Deployed', {
		timeout: 30_000
	});
	await debugSetLocation(page, { ...where, altitude: 60, speed: 6 });
	await expect(page.getByTestId('hud-phase-text')).toContainText('Landed', { timeout: 60_000 });
	await expect(page.getByText(/destroyed|broke off|burned up|Vessel lost/)).toHaveCount(0);
	expect(errors).toEqual([]);
});
