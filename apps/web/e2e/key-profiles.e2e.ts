/**
 * Key profiles (plan 216, ADR 0206): the KSP profile by default (B brakes, Alt+2 prograde, node keys
 * only in the map with a node selected), and Orbital classic from Settings (C brakes).
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors, openDock } from './support';

/** A pod on a tank with a wheel on its side (a Brakes group), imported into the library and launched. */
async function launchRover(page: Page): Promise<void> {
	const design = {
		formatVersion: 3,
		name: 'Brake test',
		parts: [
			{ index: 0, part: 'stock.command-pod', parent: null },
			{
				index: 1,
				part: 'stock.tank-small',
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 2,
				part: 'stock.wheel',
				parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle: 0, y: 0 } }
			}
		],
		stages: []
	};
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.goto('/vab?library');
	const library = page.getByRole('dialog', { name: 'Vessel library' });
	await library.locator('input[type=file]').setInputFiles({
		name: 'brake-test.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(design))
	});
	await expect(library.getByRole('status')).toHaveText('Imported Brake test.');
	await library
		.getByRole('listitem')
		.filter({ hasText: 'Brake test' })
		.getByRole('button', { name: 'Open' })
		.click();
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
	await launchRover(page);
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	// the vessel panel lists a vessel's groups while it is in flight; a key wakes it from the pad's rails
	const brakes = page.getByTestId('group-stock.brakes');
	await openDock(page, 'host.vessel');
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } });

	// B is brakes in the KSP profile: the Overview reads Brakes on
	await page.keyboard.press('KeyB');
	await expect(brakes).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 });

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
	await expect(brakes).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
	expect(errors).toEqual([]);
});
