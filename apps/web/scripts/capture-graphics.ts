/**
 * The look check of plan 252: five views at the same camera, taken on the MacBook's own display size
 * (1512 x 945 CSS at device scale factor 2) with the Metal backend, so a build before and a build after
 * the Retina quick wins can be put side by side. Canvas only (no HUD). Against a `NODE_ENV=development`
 * build served by `scripts/serve.ts` (the `__orbital` hook):
 *
 *   SHOT_TAG=before SHOT_URL=http://localhost:5211 bun scripts/capture-graphics.ts
 *
 * Output: `docs/journal/assets/252-<tag>-<view>.jpg` for the views pad (noon), sunset (low sun on the
 * pad), 12 km, orbit (100 km) and the Space Center. The vessel is put in place through the debug API.
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const tag = process.env.SHOT_TAG ?? 'after';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const preset = process.env.SHOT_PRESET ?? 'high';

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: 2,
	baseURL: base
});

async function openFlight(): Promise<Page> {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.addInitScript((p) => {
		localStorage.setItem('orbital.graphics', p);
		localStorage.setItem('orbital.graphics.auto', 'off');
		localStorage.setItem('orbital.graphics.features', '');
	}, preset);
	await page.goto('/vab');
	await page.getByRole('button', { name: 'Load the two-stage example' }).click();
	await page.waitForTimeout(1500);
	// the first load compiles the programs; the second is shot
	await page.goto('/flight');
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{
			timeout: 180_000
		}
	);
	await page.goto('/flight');
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{
			timeout: 180_000
		}
	);
	await page.evaluate(async () => {
		await (window as any).__orbital.renderer().precompile();
	});
	await page.waitForTimeout(8000);
	return page;
}

async function shoot(page: Page, view: string): Promise<void> {
	await page.waitForTimeout(6000);
	await page
		.locator('canvas')
		.first()
		.screenshot({ path: join(out, `252-${tag}-${view}.jpg`), type: 'jpeg', quality: 82 });
	const info = await page.evaluate(() => (window as any).__orbital.renderer().debug.info());
	console.log(`  ${view}: ${info.size[0]}x${info.size[1]} px, ${info.preset}`);
}

const call = (page: Page, method: string, arg: unknown) =>
	page.evaluate(([m, a]) => (window as any).__orbitalDebug[m as string](a), [method, arg] as const);

const flight = await openFlight();
await flight.evaluate(() => (window as any).__orbital.renderer().debug.applyPreset('pad-noon'));
await shoot(flight, 'pad');
await flight.evaluate(() => (window as any).__orbital.renderer().debug.applyPreset('pad-low-sun'));
await shoot(flight, 'sunset');
await flight.evaluate(() => (window as any).__orbital.renderer().debug.applyPreset('pad-noon'));
await call(flight, 'setLocation', {
	kind: 'air',
	latitude: 0.009,
	longitude: 0.02,
	altitude: 12_000,
	speed: 150,
	climb: 0
});
await shoot(flight, '12km');
await call(flight, 'setOrbit', { apoapsis: 100_000, periapsis: 100_000 });
await shoot(flight, 'orbit');
await flight.close();

const sc = await context.newPage();
await sc.addInitScript((p) => {
	localStorage.setItem('orbital.graphics', p);
	localStorage.setItem('orbital.graphics.auto', 'off');
}, preset);
await sc.goto('/space-center');
await sc.waitForFunction(() => (window as any).__orbital?.renderer?.(), null, { timeout: 120_000 });
await sc.goto('/space-center');
await sc.waitForFunction(() => (window as any).__orbital?.renderer?.(), null, { timeout: 120_000 });
await sc.waitForTimeout(4000);
await shoot(sc, 'space-center');
await browser.close();
