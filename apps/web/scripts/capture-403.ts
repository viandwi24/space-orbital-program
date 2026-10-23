/**
 * Screens of plan 403 (journal 403): Home from orbit on the night side with city lights off (Low)
 * and on (High). Playwright's Chromium on the Mac's GPU, against a running dev server:
 *
 *   SHOT_URL=http://localhost:5173 [SHOT_BACKEND=webgl] bun scripts/capture-403.ts [prefix]
 *
 * Output: `docs/journal/assets/<prefix>-*.jpg` (prefix `403` by default).
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.argv[2] ?? '403';
const backend = process.env.SHOT_BACKEND ?? 'webgpu';
const altitude = Number(process.env.SHOT_ALT ?? 1_200_000);

const browser = await chromium.launch({
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, baseURL: base });
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
});
const setup = await context.newPage();
await setup.goto('/vab');
await setup.waitForFunction(() => typeof (window as any).__orbitalVab?.loadBooster === 'function');
await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
await setup.waitForTimeout(1500);
await setup.close();

for (const preset of ['low', 'high']) {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	await page.addInitScript(
		([b, p]) => {
			localStorage.setItem('orbital.graphics.renderer', b!);
			localStorage.setItem('orbital.graphics', p!);
			localStorage.setItem('orbital.graphics.auto', 'off');
		},
		[backend, preset]
	);
	await page.goto('/flight');
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{
			timeout: 300_000
		}
	);
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
	await page.waitForTimeout(3000);
	// over the night side: opposite the pad, above the settled lowlands of the lights test
	await page.evaluate(
		([alt]) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				latitude: 0.15,
				longitude: 3.5,
				altitude: alt,
				speed: 0,
				climb: 0
			}),
		[altitude]
	);
	// the bake is 12 passes; give it time
	await page.waitForTimeout(12_000);
	for (const [name, pitch] of [
		['a', 1.2],
		['b', 0.5],
		['c', -0.3]
	] as const) {
		await page.evaluate(
			(p) =>
				(window as any).__orbital
					.renderer()
					.debug.setCamera({ yaw: 0.6, pitch: p, distance: 4000 }),
			pitch
		);
		await page.waitForTimeout(2500);
		await page.screenshot({
			path: join(out, `${prefix}-${preset}-${name}.jpg`),
			type: 'jpeg',
			quality: 82
		});
	}
	await page.close();
}
await browser.close();
