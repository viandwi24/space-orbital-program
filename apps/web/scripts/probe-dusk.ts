/**
 * Does dusk compile anything (plans 414 and 412)? Loads the flight page on the pad, waits until the
 * pipeline count stops moving, moves the sun from the day to well below the horizon with
 * `debug.setSun` and counts the pipelines again; screenshots day and night. Exits 1 if any was built.
 * Headed; a development build; WebGPU.
 *
 *   SHOT_URL=http://localhost:5211 [SHOT_PREFIX=414] bun scripts/probe-dusk.ts
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { setupVessel, waitForFlight } from './lib/frame-matrix';

const out = join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.env.SHOT_PREFIX ?? '414';
const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({
	viewport: { width: 1600, height: 900 },
	deviceScaleFactor: 1,
	baseURL: process.env.SHOT_URL
});
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
	localStorage.setItem('orbital.graphics.renderer', 'webgpu');
	localStorage.setItem('orbital.graphics', 'high');
	localStorage.setItem('orbital.graphics.auto', 'off');
});
const hangar = await context.newPage();
await setupVessel(hangar);
await hangar.close();
const page = await context.newPage();
await page.goto('/flight');
await waitForFlight(page, 120_000);
const count = (): Promise<number> =>
	page.evaluate(() => (window as any).__orbital.renderer().compiles.pipelines.length);
// the background warm-up is done when the count stops moving
for (let last = -1, stable = 0; stable < 4;) {
	await page.waitForTimeout(5000);
	const n = await count();
	stable = n === last ? stable + 1 : 0;
	last = n;
}
const sun = (elevation: number, azimuth: number) =>
	page.evaluate(
		([e, a]) => (window as any).__orbital.renderer().debug.setSun({ elevation: e, azimuth: a }),
		[elevation, azimuth] as [number, number]
	);
await sun(35, 150);
await page.waitForTimeout(4000);
const before = await count();
await page.screenshot({ path: join(out, `${prefix}-pad-day.jpg`), type: 'jpeg', quality: 82 });
for (const e of [10, 3, -3, -8, -14]) {
	await sun(e, 150);
	await page.waitForTimeout(2500);
}
await page.waitForTimeout(5000);
await page.screenshot({ path: join(out, `${prefix}-pad-night.jpg`), type: 'jpeg', quality: 82 });
const after = await count();
console.log(`pipelines before dusk ${before}, after ${after}: ${after - before} built`);
await browser.close();
process.exit(after === before ? 0 : 1);
