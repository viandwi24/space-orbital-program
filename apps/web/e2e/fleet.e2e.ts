import { expect, test, type Page } from '@playwright/test';
import { debugSetLocation, launchTwoStage, watchErrors } from './support';

/**
 * Plan 223 (ADR 0208): the Mission Center's fleet list. A vessel landed 50 km from the pad is
 * recovered at a factor below 98 % and the funds rise by the quote; another vessel's new name
 * survives a reload.
 */
type Debug = {
	setDebugMode(on: boolean): Promise<{ ok: boolean; reason?: string }>;
	send(command: Record<string, unknown>): Promise<{ ok: boolean; reason?: string }>;
	vessel(): { id: number } | null;
};
const api = (page: Page) => ({
	debugMode: () =>
		page.evaluate(() =>
			(window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.setDebugMode(true)
		),
	vesselId: () =>
		page.evaluate(
			() => (window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.vessel()!.id
		),
	send: (command: Record<string, unknown>) =>
		page.evaluate(
			(c) => (window as unknown as { __orbitalDebug: Debug }).__orbitalDebug.send(c),
			command
		)
});

const fundsOf = async (page: Page): Promise<number> =>
	Number((await page.getByTestId('hud-funds').locator('b').innerText()).replace(/[^0-9.-]/g, ''));

test('recover a vessel 50 km out at its quote, rename another and keep the name', async ({
	page
}) => {
	test.setTimeout(240_000);
	const errors = watchErrors(page);
	await page.goto('/worlds');
	await page.getByTestId('worlds-create').click();
	const form = page.getByTestId('create-world');
	await form.getByTestId('world-name').fill('Fleet');
	await form.getByRole('radio', { name: 'Career', exact: true }).click();
	await form.getByTestId('world-create').click();
	await page.getByTestId('world-enter').click();
	await page.waitForURL('**/space-center');
	// Debug mode (plan 203): the set-state tools in a Career world are the player's opt-in
	await page.getByTestId('nav-menu').click();
	await page.getByTestId('nav-settings').click();
	await page.locator('#settings-tab-game').click();
	await page.getByTestId('setting-debug').click();
	await page.keyboard.press('Escape');

	await launchTwoStage(page);
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	// landed 50 km east of the Legacy coordinates (Home is 600 km in radius)
	await debugSetLocation(page, { kind: 'surface', latitude: 0, longitude: 50_000 / 600_000 });
	const lander = await api(page).vesselId();
	// a second vessel in orbit, a probe core alone
	const sat = await api(page).send({
		type: 'debug-set-orbit',
		design: {
			formatVersion: 1,
			name: 'Sat',
			parts: [{ index: 0, part: 'stock.probe-core', parent: null }],
			stages: []
		},
		orbit: {
			body: 'stock.home',
			a: 700_000,
			e: 0,
			i: 0,
			raan: 0,
			argp: 0,
			m0: 0
		}
	});
	expect(sat.ok).toBe(true);
	await page.waitForTimeout(3_000); // the lander comes to rest

	await page.goto('/mission-center');
	await expect(page.getByTestId(`mc-row-vessel:${lander}`)).toBeVisible({ timeout: 60_000 });
	// it is a ship (a pod); retype it Probe, then the Probe filter shows it
	await page.getByTestId(`mc-row-vessel:${lander}`).click();
	await page.getByTestId('mc-set-type').selectOption('probe');
	await page.getByTestId('mc-type').selectOption('probe');
	await expect(page.getByTestId(`mc-row-vessel:${lander}`)).toBeVisible();
	await expect(page.locator('[data-testid^="mc-row-vessel:"]')).toHaveCount(1);

	const recover = page.getByTestId('mc-recover');
	await expect(recover).toBeVisible({ timeout: 30_000 });
	const factor = Number(/([\d.]+) %/.exec(await recover.innerText())![1]);
	expect(factor).toBeLessThan(98);
	await recover.click();
	const credit = Number(
		(await page.getByTestId('recover-lines').locator('dd').last().innerText()).replace(
			/[^0-9.-]/g,
			''
		)
	);
	const before = await fundsOf(page);
	await page.getByTestId('recover-confirm').click();
	await expect.poll(() => fundsOf(page), { timeout: 20_000 }).toBeGreaterThan(before);
	expect(Math.abs((await fundsOf(page)) - before - credit)).toBeLessThanOrEqual(2);
	await expect(page.getByTestId(`mc-row-vessel:${lander}`)).toHaveCount(0);

	// rename the other vessel; the name is saved and back after a reload
	await page.getByTestId('mc-type').selectOption('');
	const satRow = page.locator('[data-testid^="mc-row-vessel:"]').filter({ hasText: 'Sat' });
	await satRow.first().click();
	await page.getByTestId('mc-rename').click();
	await page.getByTestId('mc-rename-input').fill('Relay Prime');
	await page.getByTestId('mc-rename-save').click();
	await expect(
		page.locator('[data-testid^="mc-row-vessel:"]').filter({ hasText: 'Relay Prime' })
	).toHaveCount(1);
	await page.waitForTimeout(1_500); // the autosave
	await page.reload();
	await expect(
		page.locator('[data-testid^="mc-row-vessel:"]').filter({ hasText: 'Relay Prime' })
	).toHaveCount(1, { timeout: 60_000 });
	expect(errors).toEqual([]);
});
