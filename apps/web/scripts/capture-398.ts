/**
 * The look check of plan 398 (ADR 0371): the ground drawn by the mesh terrain and by the sphere-traced
 * march (`debug.setLookOff('mesh', …)`), at the pad, 3 km and 12 km, standing. Against a dev server:
 *
 *   SHOT_TAG=after SHOT_URL=http://localhost:5241 bun scripts/capture-398.ts
 *
 * Output: `docs/journal/assets/398-<tag>-<view>-<mesh|march>.jpg` (canvas only). Console errors and
 * warnings are printed: a mesh pipeline that failed to build shows here.
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { placeView, setupVessel, waitForFlight, type View } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const tag = process.env.SHOT_TAG ?? 'after';
const preset = process.env.PRESET ?? 'high';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const views = (process.env.SHOT_VIEWS ?? 'pad,3km,12km').split(',') as View[];

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		'--disable-backgrounding-occluded-windows'
	]
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	deviceScaleFactor: 1,
	baseURL: base
});
await context.addInitScript((p) => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
	localStorage.setItem('orbital.graphics.renderer', 'webgpu');
	localStorage.setItem('orbital.graphics', p);
	localStorage.setItem('orbital.graphics.auto', 'off');
}, preset);
const hangar = await context.newPage();
await setupVessel(hangar);
await hangar.close();

const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
page.on('console', (m) => {
	if (m.type() === 'error' || m.type() === 'warning')
		console.log(`  console ${m.type()}: ${m.text().slice(0, 400)}`);
});
await page.goto('/flight');
await waitForFlight(page, 120_000);
await page.waitForTimeout(4000);

for (const view of views) {
	await placeView(page, view);
	for (const mode of ['mesh', 'march'] as const) {
		await page.evaluate(
			(off) => (window as any).__orbital.renderer().debug.setLookOff('mesh', off),
			mode === 'march'
		);
		await page.waitForTimeout(3000);
		await page
			.locator('canvas')
			.first()
			.screenshot({ path: join(out, `398-${tag}-${view}-${mode}.jpg`), type: 'jpeg', quality: 88 });
		console.log(`shot ${view} ${mode}`);
	}
}
await browser.close();
