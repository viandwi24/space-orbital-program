/**
 * Screens of plan 402 (journal 402): the ground away from the pad with rocks off (Low) and on (High).
 * Playwright's Chromium on the Mac's GPU, against a running dev server:
 *
 *   SHOT_URL=http://localhost:5173 bun scripts/capture-402.ts [prefix]
 *
 * Output: `docs/journal/assets/<prefix>-*.jpg` (prefix `402` by default).
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.argv[2] ?? '402';
const backend = process.env.SHOT_BACKEND ?? 'webgpu';

const browser = await chromium.launch({
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({
	viewport: { width: 1600, height: 900 },
	baseURL: base
});
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
	// far from the pad, on the ground (SHOT_LAT, SHOT_LON: radians; the default is 640 m up, over land)
	await page.evaluate(
		([latitude, longitude]) =>
			(window as any).__orbitalDebug.setLocation({ kind: 'surface', latitude, longitude }),
		[Number(process.env.SHOT_LAT ?? 0.05), Number(process.env.SHOT_LON ?? 0.3)]
	);
	await page.waitForTimeout(6000);
	const rocks = () => page.evaluate(() => (window as any).__orbital.renderer().debug.groundRocks());
	console.log(preset, 'rocks', JSON.stringify(await rocks()));
	await page.screenshot({
		path: join(out, `${prefix}-${preset}-ground.jpg`),
		type: 'jpeg',
		quality: 82
	});
	// close and low: the camera rig's pitch is against the inertial plane, so try a few and keep each
	for (const [name, pitch] of [
		['a', 0.05],
		['b', -0.3]
	] as const) {
		await page.evaluate(
			(p) =>
				(window as any).__orbital.renderer().debug.setCamera({ yaw: 0.6, pitch: p, distance: 9 }),
			pitch
		);
		await page.waitForTimeout(2500);
		console.log(preset, name, 'rocks', JSON.stringify(await rocks()));
		await page.screenshot({
			path: join(out, `${prefix}-${preset}-ground-${name}.jpg`),
			type: 'jpeg',
			quality: 82
		});
	}
	await page.close();
}
await browser.close();
