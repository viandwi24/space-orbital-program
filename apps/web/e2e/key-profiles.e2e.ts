/**
 * Key profiles (plan 216, ADR 0206): the KSP profile by default (B brakes, Alt+2 prograde, node keys
 * only in the map with a node selected), and Orbital classic from Settings (C brakes).
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors } from './support';

/** /vab → the glider (it has wheels, so a Brakes group) → Launch → /flight. */
async function launchGlider(page: Page): Promise<void> {
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the glider' }).click();
	const launch = page.getByRole('button', { name: /^Launch/ });
	await expect(launch).toBeEnabled();
	await launch.click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await expect(page.getByTestId('hud-met')).toBeVisible({ timeout: 60_000 });
}

/** The focused vessel's snapshot fields through the debug API (plan 203). */
const vesselState = (page: Page) =>
	page.evaluate(() => {
		const api = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): {
						sas?: { mode: string };
						nodes?: unknown[];
						actions?: { groups?: Array<{ id: string; state: string }> };
					} | null;
				};
			}
		).__orbitalDebug;
		const v = api.vessel();
		return {
			sas: v?.sas?.mode ?? null,
			nodes: v?.nodes?.length ?? 0,
			brakes: v?.actions?.groups?.find((g) => g.id === 'stock.brakes')?.state ?? null
		};
	});

test('KSP keys by default, Orbital classic from Settings, node keys only on a selected node', async ({
	page
}) => {
	const errors = watchErrors(page);
	await launchGlider(page);
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	const brakes = page.getByTestId('group-stock.brakes');
	await page.getByRole('button', { name: 'Vessel panel' }).click();
	await expect(brakes).toBeVisible({ timeout: 30_000 });
	const before = await brakes.getAttribute('aria-checked');
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } });

	// B is brakes in the KSP profile
	await page.keyboard.press('KeyB');
	await expect(brakes).not.toHaveAttribute('aria-checked', before ?? '', { timeout: 10_000 });
	const braked = await brakes.getAttribute('aria-checked');

	// Alt+2 is SAS prograde
	await page.keyboard.press('Alt+Digit2');
	await expect
		.poll(async () => (await vesselState(page)).sas, { timeout: 10_000 })
		.toBe('prograde');

	// in the map with no node selected, I does nothing
	await page.keyboard.press('KeyM');
	await page.keyboard.press('KeyI');
	await page.waitForTimeout(1_000);
	expect((await vesselState(page)).nodes).toBe(0);
	await page.keyboard.press('KeyM');

	// Orbital classic: C is brakes again
	await page.keyboard.press('Escape');
	await page.getByTestId('pause-settings').click();
	const dialog = page.getByRole('dialog', { name: 'Settings' });
	await dialog.getByRole('tab', { name: 'Controls' }).click();
	await dialog.getByRole('radio', { name: 'Orbital classic' }).click();
	await expect(dialog.getByRole('radio', { name: 'Orbital classic' })).toBeChecked();
	await page.keyboard.press('Escape');
	await page.keyboard.press('Escape'); // the pause menu
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } });
	await page.keyboard.press('KeyC');
	await expect(brakes).not.toHaveAttribute('aria-checked', braked ?? '', { timeout: 10_000 });
	expect(errors).toEqual([]);
});
