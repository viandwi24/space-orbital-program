/**
 * Docking (plan 222, ADR 0218): two port probes 20 m apart in low orbit (the second spawned by the
 * plan 203 debug API with the clock paused). Beta holds target on Alpha, Alpha targets Beta's port,
 * holds target, and translates in on RCS; the ports capture into one vessel, and Undock gives
 * both names back.
 */
import { expect, test, type Page } from '@playwright/test';
import { watchErrors, openDock, loadHangarExample } from './support';

const radial = (index: number, parent: number) =>
	[0, 1, 2, 3].map((k) => ({
		index: index + k,
		part: 'stock.rcs-block',
		parent: {
			index: parent,
			parentNode: 'surface',
			node: 'radial',
			radial: { angle: (k * Math.PI) / 2, y: 0 }
		}
	}));

/** A probe with a port on its nose; Alpha also has tanks and four RCS blocks. */
const probe = (name: string, rcs: boolean) => ({
	formatVersion: 3,
	name,
	parts: [
		{ index: 0, part: 'stock.probe-core', parent: null },
		{
			index: 1,
			part: 'stock.docking-port',
			parent: { index: 0, parentNode: 'top', node: 'bottom' }
		},
		{
			index: 2,
			part: 'stock.reaction-wheel',
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		},
		{
			index: 3,
			part: 'stock.monoprop-tank',
			parent: { index: 2, parentNode: 'bottom', node: 'top' }
		},
		// Alpha: three full tanks (about 28 t), so one key press of RCS adds about 0.1 m/s; a
		// software-rendered frame holds the key for most of a second
		...(rcs
			? [4, 5, 6].map((index) => ({
					index,
					part: 'stock.tank-medium',
					parent: { index: index - 1, parentNode: 'bottom', node: 'top' }
				}))
			: []),
		...(rcs ? radial(7, 5) : [])
	],
	stages: []
});

interface Seen {
	radius: number;
	parts: number;
	port: { angle: number; offset: number; distance: number; closing: number } | null;
}

/** The focused vessel from the debug API: distance from the planet's centre, part count, port alignment. */
async function seen(page: Page): Promise<Seen> {
	await page.waitForFunction(() => '__orbitalDebug' in window, null, { timeout: 60_000 });
	return page.evaluate(() => {
		const v = (
			window as unknown as {
				__orbitalDebug: {
					vessel(): {
						position: { x: number; y: number; z: number };
						parts: unknown[];
						target?: { port?: Seen['port'] };
					} | null;
				};
			}
		).__orbitalDebug.vessel()!;
		return {
			radius: Math.hypot(v.position.x, v.position.y, v.position.z),
			parts: v.parts.length,
			port: v.target?.port ?? null
		};
	});
}

async function setOrbit(page: Page, spec: unknown, options?: unknown): Promise<void> {
	const r = await page.evaluate(
		([s, o]) =>
			(
				window as unknown as {
					__orbitalDebug: {
						setOrbit(s: unknown, o: unknown): Promise<{ ok: boolean; reason?: string }>;
					};
				}
			).__orbitalDebug.setOrbit(s, o),
		[spec, options] as const
	);
	if (!r.ok) throw new Error(`setOrbit refused: ${r.reason}`);
}

async function launch(page: Page, design: ReturnType<typeof probe>): Promise<void> {
	await page.goto('/vab');
	await loadHangarExample(page, 'loadTwoStage');
	await page.goto('/vab?library');
	const library = page.getByRole('dialog', { name: 'Vessel library' });
	await library.locator('input[type=file]').setInputFiles({
		name: 'alpha.json',
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

const port = async (page: Page) => (await seen(page)).port;

/** Pick a target by its label in the Target dock panel (plan 112), opening it when it is not. */
async function pick(page: Page, label: string): Promise<void> {
	const select = page.getByTestId('target-select');
	if (!(await select.isVisible())) await page.getByTestId('dock-tab-host.target').click();
	await select.selectOption({ label });
}

/** Pick a target and fly it with the Target panel's Switch to. */
async function switchTo(page: Page, name: string): Promise<void> {
	await pick(page, name);
	await page.getByTestId('target-switch').click();
	await expect(page.getByText(`Switched to ${name}`).first()).toBeVisible({ timeout: 10_000 });
}

test('two port probes 20 m apart dock on RCS, and Undock gives both names back', async ({
	page
}) => {
	test.setTimeout(300_000);
	const errors = watchErrors(page);
	await launch(page, probe('Alpha', true));
	const canvas = page.locator('canvas').first();
	await canvas.click({ position: { x: 20, y: 20 } });

	// the clock stands while both are placed: 20 m is 3 ms of orbital motion
	const a = (await seen(page)).radius + 100_000;
	await page.keyboard.press('KeyP');
	await expect(page.getByTestId('time-chip')).toHaveText('PAUSED');
	await setOrbit(page, { a, e: 0, i: 0, raan: 0, argp: 0, m0: 0 });
	await setOrbit(
		page,
		{ a, e: 0, i: 0, raan: 0, argp: 0, m0: 20 / a },
		{ design: probe('Beta', false) }
	);
	await page.keyboard.press('KeyP');
	await expect(page.getByTestId('time-chip')).toHaveCount(0);

	// Beta, ahead on the orbit, targets Alpha and holds its port towards it
	await switchTo(page, 'Beta');
	await pick(page, 'Alpha');
	await page.getByTestId('sas-target').click();
	await switchTo(page, 'Alpha');

	// Alpha targets Beta's port: the indicator reads in text
	await pick(page, 'Beta · docking port');
	// RCS on (it turns the heavy stack too), then hold target
	await canvas.click({ position: { x: 20, y: 20 } });
	await page.keyboard.press('KeyR');
	await expect(page.getByTestId('hud-rcs')).toHaveAttribute('aria-label', 'RCS on');
	await page.getByTestId('sas-target').click();
	// a stick input (an attitude command) puts Alpha in flight, and Beta, 20 m off, joins it
	// (ADR 0218 point 5); SAS alone holds on rails
	await canvas.click({ position: { x: 20, y: 20 } });
	await page.keyboard.down('KeyW');
	await page.waitForTimeout(60);
	await page.keyboard.up('KeyW');
	const indicator = page.getByTestId('target-port');
	await expect(indicator).toContainText('offset', { timeout: 20_000 });
	await expect(indicator).toContainText('°');
	await expect
		.poll(async () => (await port(page))?.angle ?? 180, { timeout: 60_000 })
		.toBeLessThan(5);
	const parts = (await seen(page)).parts;

	// short pushes forward until the faces close at 0.08..0.45 m/s (capture needs under 0.5)
	await canvas.click({ position: { x: 20, y: 20 } });
	for (let i = 0; i < 30; i++) {
		const now = await port(page);
		if (!now) break;
		if (now.closing >= 0.08 && now.closing <= 0.45) break;
		const key = now.closing < 0.08 ? 'KeyH' : 'KeyN';
		await page.keyboard.down(key);
		await page.waitForTimeout(30);
		await page.keyboard.up(key);
		await page.waitForTimeout(1_500);
	}
	console.log('docking e2e: approach', JSON.stringify(await port(page)));
	expect((await port(page))?.closing ?? 0).toBeGreaterThan(0.05);

	// one vessel: Alpha now carries Beta's parts, and Beta is not a target any more
	await expect
		.poll(
			async () => {
				const now = await seen(page);
				console.log('docking e2e: waiting', JSON.stringify(now.port), now.parts);
				return now.parts;
			},
			{ timeout: 150_000, intervals: [5_000] }
		)
		.toBeGreaterThan(parts);
	await expect(page.getByText(/First dock/).first()).toBeVisible({ timeout: 10_000 });
	await expect(
		page.getByTestId('target-select').locator('option', { hasText: 'Beta' })
	).toHaveCount(0);

	// Undock from the Parts tab: Beta is back by name
	await openDock(page, 'host.parts');
	const undock = page.locator('[data-testid$="-undock"]').first();
	await expect(undock).toBeVisible({ timeout: 30_000 });
	await undock.click();
	await expect(page.getByText('Undocked Beta').first()).toBeVisible({ timeout: 10_000 });
	await expect.poll(async () => (await seen(page)).parts, { timeout: 10_000 }).toBe(parts);
	await expect(
		page.getByTestId('target-select').locator('option', { hasText: /^Beta$/ })
	).toHaveCount(1);
	expect(errors).toEqual([]);
});
