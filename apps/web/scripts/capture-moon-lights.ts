/**
 * The moon and hills layers after the light-set change (plan 414, ADR 0374): the Cinder body from 300 km
 * and 3 km, a screenshot of each and the console errors (a failed layer pipeline shows here).
 *
 *   SHOT_URL=http://localhost:5241 SHOT_PREFIX=414ml bun scripts/capture-moon-lights.ts
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { setupVessel, waitForFlight } from './lib/frame-matrix';

const out = join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.env.SHOT_PREFIX ?? '414ml';
const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({
	viewport: { width: 1512, height: 945 },
	baseURL: process.env.SHOT_URL ?? 'http://localhost:5241'
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
page.on('pageerror', (e) => console.log('  pageerror', e.message));
page.on('console', (m) => {
	if (m.type() === 'error') console.log(`  console error: ${m.text().slice(0, 300)}`);
});
await page.goto('/flight');
await waitForFlight(page, 120_000);
await page.waitForTimeout(3000);
for (const [name, altitude] of [
	['300km', 300_000],
	['3km', 3_000]
] as const) {
	await page.evaluate(
		(alt) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				body: 'stock.cinder',
				latitude: 0.3,
				longitude: 0.2,
				altitude: alt,
				speed: 0,
				climb: 0
			}),
		altitude
	);
	await page.waitForTimeout(5000);
	await page
		.locator('canvas')
		.first()
		.screenshot({ path: join(out, `${prefix}-cinder-${name}.jpg`), type: 'jpeg', quality: 85 });
	console.log('shot', name);
}
await browser.close();
