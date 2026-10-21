/**
 * Power (plan 208, ADR 0214): a probe with a sun-tracking array charges by day and not at night,
 * and at zero charge it is uncontrolled: the "Uncontrolled" chip and an "Out of power" notice.
 * The state comes from the debug API of plan 203.
 */
import { expect, test, type Page } from '@playwright/test';
import {
	debugAmount,
	debugSetLocation,
	debugSetResource,
	watchErrors,
	openDock,
	loadHangarExample
} from './support';

const EC = 'stock.electric-charge';

/** Imports a probe design into the vessel library, opens it and launches it from the pad. */
async function launchProbe(page: Page): Promise<void> {
	const design = {
		formatVersion: 3,
		name: 'Power probe',
		parts: ['stock.probe-core', 'stock.solar-array-large', 'stock.battery-large'].map(
			(part, index) => ({
				index,
				part,
				parent: index === 0 ? null : { index: index - 1, parentNode: 'bottom', node: 'top' }
			})
		),
		stages: []
	};
	await page.goto('/vab');
	// opening from the library replaces what the Hangar holds; start from the example, as a player would
	await loadHangarExample(page, 'loadTwoStage');
	await page.goto('/vab?library');
	const library = page.getByRole('dialog', { name: 'Vessel library' });
	await expect(library).toBeVisible();
	await library.locator('input[type=file]').setInputFiles({
		name: 'power-probe.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(design))
	});
	await expect(library.getByRole('status')).toHaveText('Imported Power probe.');
	await library
		.getByRole('listitem')
		.filter({ hasText: 'Power probe' })
		.getByRole('button', { name: 'Open' })
		.click();
	await expect(page.getByText('Opened Power probe.')).toBeVisible();
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

test('a probe charges by day, not at night, and at zero charge it is uncontrolled', async ({
	page
}) => {
	const errors = watchErrors(page);
	await launchProbe(page);

	// deploy the array from the vessel panel's Parts tab
	await openDock(page, 'host.parts');
	const deploy = page.locator('[data-testid$="-setDeployed"]').first();
	await expect(deploy).toBeVisible({ timeout: 30_000 });
	await deploy.click();
	await expect(deploy).toHaveAttribute('aria-checked', 'true');

	// on the pad the Sun stands about 30 degrees up: the charge rises
	await debugSetResource(page, { resource: EC, fraction: 0.1 });
	const low = await debugAmount(page, EC);
	await expect.poll(() => debugAmount(page, EC), { timeout: 30_000 }).toBeGreaterThan(low + 5);

	// on the far side of the planet it is night: the charge does not rise
	await debugSetLocation(page, { kind: 'surface', latitude: 0, longitude: Math.PI });
	await page.waitForTimeout(2_000);
	const night = await debugAmount(page, EC);
	await page.waitForTimeout(12_000);
	expect(await debugAmount(page, EC)).toBeLessThanOrEqual(night + 1e-6);
	await expect(page.getByTestId('hud-uncontrolled')).toHaveCount(0);

	// empty: uncontrolled for want of power, and a notice says so
	await debugSetResource(page, { resource: EC, amount: 0 });
	await expect(page.getByTestId('hud-uncontrolled')).toContainText('Uncontrolled');
	await expect(page.getByTestId('hud-uncontrolled')).toContainText('no power');
	await expect(page.getByText('Out of power').first()).toBeVisible();
	// and the bell of the world layout keeps it (plan 205)
	await page.getByTestId('status-bell').click();
	await expect(page.getByTestId('bell-feed')).toContainText(
		'Out of power: a probe is uncontrolled'
	);
	expect(errors).toEqual([]);
});
