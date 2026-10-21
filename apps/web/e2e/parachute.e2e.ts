import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, watchErrors, openDock } from './support';

/**
 * Plan 209 (ADR 0203 point 4): a capsule under its parachute. Placed 8 km up falling at 800 m/s
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

	await openDock(page, 'host.parts');
	await expect(status(page)).toHaveText('Stowed', { timeout: 30_000 });

	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0.3,
		altitude: 8_000,
		speed: 800,
		climb: -Math.PI / 2
	});
	// every status and airflow text the panel shows, in order: Armed can last well under a second
	await page.evaluate(() => {
		const seen: string[] = [];
		(window as unknown as { chuteSeen: string[] }).chuteSeen = seen;
		const read = (): void => {
			const s = document.querySelector('[data-testid$="-status"]')?.textContent ?? '';
			const a = document.querySelector('[data-testid$="-safety"]')?.textContent ?? '';
			const line = `${s}/${a}`;
			if (seen.at(-1) !== line) seen.push(line);
		};
		new MutationObserver(read).observe(document.body, {
			subtree: true,
			childList: true,
			characterData: true
		});
	});
	// Space to the flight, not to a panel button: a click outside would close the panel
	await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
	await page.keyboard.press('Space');
	await expect(status(page)).toHaveText('Deployed', { timeout: 60_000 });
	const seen = await page.evaluate(() => (window as unknown as { chuteSeen: string[] }).chuteSeen);
	const statuses = seen.map((l) => l.split('/')[0]).filter((x, i, a) => x !== a[i - 1]);
	expect(statuses.slice(statuses.indexOf('Armed'))).toEqual(['Armed', 'Semi-deployed', 'Deployed']);
	expect(seen).toContain('Armed/Unsafe'); // it waited out the Unsafe air

	// the last stretch under the full canopy, near the ground at its descent speed
	await debugSetLocation(page, {
		kind: 'air',
		latitude: 0,
		longitude: 0.3,
		altitude: 60,
		speed: 6,
		climb: -Math.PI / 2
	});
	await expect(status(page)).toHaveText('Deployed');
	await expect(page.getByTestId('hud-phase-text')).toContainText('Landed', { timeout: 60_000 });
	await expect(page.getByText(/destroyed|broke off|Vessel lost/)).toHaveCount(0);
	expect(errors).toEqual([]);
});
