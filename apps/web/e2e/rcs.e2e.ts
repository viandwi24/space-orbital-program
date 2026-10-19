/**
 * RCS (plan 211, ADR 0216): an RCS probe in low orbit; R turns RCS on, holding H translates on
 * monopropellant, and with the monoprop gone the pill says so. The state comes from the debug API.
 */
import { expect, test, type Page } from '@playwright/test';
import { debugAmount, debugSetOrbit, debugSetResource, watchErrors } from './support';

const MONO = 'stock.monopropellant';

async function launchRcsProbe(page: Page): Promise<void> {
	const blocks = [0, 1, 2, 3].map((k) => ({
		index: 2 + k,
		part: 'stock.rcs-block',
		parent: {
			index: 1,
			parentNode: 'surface',
			node: 'radial',
			radial: { angle: (k * Math.PI) / 2, y: 0 }
		}
	}));
	const design = {
		formatVersion: 3,
		name: 'RCS probe',
		parts: [
			{ index: 0, part: 'stock.probe-core', parent: null },
			{
				index: 1,
				part: 'stock.monoprop-tank',
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			...blocks
		],
		stages: []
	};
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.goto('/vab?library');
	const library = page.getByRole('dialog', { name: 'Vessel library' });
	await library.locator('input[type=file]').setInputFiles({
		name: 'rcs-probe.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(design))
	});
	await expect(library.getByRole('status')).toHaveText('Imported RCS probe.');
	await library
		.getByRole('listitem')
		.filter({ hasText: 'RCS probe' })
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

/** The focused vessel's speed, m/s, from the debug API. */
const speed = (page: Page) =>
	page.evaluate(() => {
		const v = (
			window as unknown as {
				__orbitalDebug: { vessel(): { velocity: { x: number; y: number; z: number } } | null };
			}
		).__orbitalDebug.vessel();
		return v ? Math.hypot(v.velocity.x, v.velocity.y, v.velocity.z) : NaN;
	});

test('R turns RCS on, H translates on monopropellant, and an empty tank says so', async ({
	page
}) => {
	const errors = watchErrors(page);
	await launchRcsProbe(page);
	await debugSetOrbit(page, { apoapsis: 100_000, periapsis: 100_000 });
	const pill = page.getByTestId('hud-rcs');
	await expect(pill).toHaveAttribute('aria-label', 'RCS off', { timeout: 20_000 });
	await page
		.locator('canvas')
		.first()
		.click({ position: { x: 20, y: 20 } });

	await page.keyboard.press('KeyR');
	await expect(pill).toHaveAttribute('aria-label', 'RCS on', { timeout: 10_000 });

	const mono = await debugAmount(page, MONO);
	const v0 = await speed(page);
	await page.keyboard.down('KeyH');
	await page.waitForTimeout(2_000);
	await page.keyboard.up('KeyH');
	await expect.poll(() => debugAmount(page, MONO), { timeout: 10_000 }).toBeLessThan(mono - 0.1);
	expect(Math.abs((await speed(page)) - v0)).toBeGreaterThan(0.05);

	await debugSetResource(page, { resource: MONO, amount: 0 });
	await expect(pill).toHaveAttribute('aria-label', 'RCS: no propellant', { timeout: 10_000 });
	expect(errors).toEqual([]);
});
