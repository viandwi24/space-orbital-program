import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, watchErrors } from './support';

/**
 * Plan 209 (ADR 0203 point 4): a capsule under its parachute. Placed 3 km up falling at 400 m/s
 * (Unsafe air for a main chute), it is staged: the chute waits Armed until the air slows the
 * capsule, semi-deploys, opens fully at 1 000 m and the capsule lands intact.
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
		}
	],
	stages: [[1]]
};

const status = (page: Page) => page.locator('[data-testid$="-status"]').first();

test('staged in a fast fall, the chute goes Armed, Semi-deployed, Deployed and the capsule lands', async ({
	page
}) => {
	test.skip(test.info().project.name !== 'chromium', 'one engine is enough for the descent');
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await page.goto('/vab');
	await page.evaluate((d) => localStorage.setItem('orbital.design', JSON.stringify(d)), capsule);
	await page.goto('/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });

	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await page.getByTestId('vessel-tab-parts').click();
	await expect(status(page)).toHaveText('Stowed', { timeout: 30_000 });

	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0.3,
		altitude: 3_000,
		speed: 400,
		climb: -Math.PI / 2
	});
	// Space to the flight, not to a panel button: a click outside would close the panel
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('Space');
	await expect(status(page)).toHaveText('Armed', { timeout: 10_000 });
	await expect(page.locator('[data-testid$="-safety"]').first()).toHaveText('Unsafe');
	await expect(status(page)).toHaveText('Semi-deployed', { timeout: 30_000 });
	await expect(status(page)).toHaveText('Deployed', { timeout: 60_000 });

	// the last kilometre at about 6 m/s: physics warp shortens the wait
	const faster = page.getByRole('button', { name: 'Faster time warp' });
	for (const x of ['2x', '4x', '10x']) {
		await faster.click();
		await expect(page.getByTestId('hud-warp')).toHaveText(x);
	}
	await expect(page.getByTestId('hud-phase-text')).toContainText('Landed', { timeout: 120_000 });
	await expect(page.getByText(/destroyed|broke off|Vessel lost/)).toHaveCount(0);
	expect(errors).toEqual([]);
});
