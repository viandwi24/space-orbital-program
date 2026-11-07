/**
 * Screens of plan 416 (journal 416): Earth from 400 km on the day side, on the night side with the
 * terminator in view, and from 30 km, at one preset and backend. Headed Chromium on the Mac's GPU,
 * against a running dev server:
 *
 *   SHOT_URL=http://localhost:5230 SHOT_PRESET=low SHOT_BACKEND=webgpu bun scripts/capture-416.ts before
 *
 * Output: `docs/journal/assets/416-<prefix>-<backend>-<preset>-<view>.jpg` (prefix from argv[2]).
 */
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { setupVessel, waitForFlight } from './lib/frame-matrix';

const out = join(import.meta.dir, '../../../docs/journal/assets');
const prefix = process.argv[2] ?? 'after';
const preset = process.env.SHOT_PRESET ?? 'low';
const backend = process.env.SHOT_BACKEND ?? 'webgpu';
const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu', '--mute-audio']
});
const context = await browser.newContext({
	viewport: { width: 1600, height: 900 },
	deviceScaleFactor: 1,
	baseURL: process.env.SHOT_URL ?? 'http://localhost:5230'
});
await context.addInitScript(
	([b, p]) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', b!);
		localStorage.setItem('orbital.graphics', p!);
		localStorage.setItem('orbital.graphics.auto', 'off');
	},
	[backend, preset]
);
const hangar = await context.newPage();
await setupVessel(hangar);
await hangar.close();
const page = await context.newPage();
page.on('pageerror', (e) => console.log('  pageerror', e.message));
await page.goto('/flight');
await waitForFlight(page, 300_000);
await page.waitForTimeout(6000);
// only the canvas: a child's `visibility: visible` shows through a hidden parent
await page.addStyleTag({
	content: 'body * { visibility: hidden !important } canvas { visibility: visible !important }'
});
const look = (pitch: number, distance: number) =>
	page.evaluate(
		([p, d]) =>
			(window as any).__orbital.renderer().debug.setCamera({ yaw: 0.6, pitch: p, distance: d }),
		[pitch, distance] as [number, number]
	);
const where = (altitude: number, latitude = 0.35, longitude = -0.4) =>
	page.evaluate(
		([alt, lat, lon]) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				body: 'stock.home',
				latitude: lat,
				longitude: lon,
				altitude: alt,
				speed: 0,
				climb: 0
			}),
		[altitude, latitude, longitude] as [number, number, number]
	);
const sun = (elevation: number, azimuth: number) =>
	page.evaluate(
		([e, a]) => (window as any).__orbital.renderer().debug.setSun({ elevation: e, azimuth: a }),
		[elevation, azimuth] as [number, number]
	);
const shot = (name: string) =>
	page.screenshot({
		path: join(out, `416-${prefix}-${backend}-${preset}-${name}.jpg`),
		type: 'jpeg',
		quality: 85
	});
if (process.env.SHOT_OFF)
	await page.evaluate(
		(l) => (window as any).__orbital.renderer().debug.setLookOff(l, true),
		process.env.SHOT_OFF
	);
await where(400_000);
await look(1.35, 2000);
await sun(60, 150);
await page.waitForTimeout(9000);
await shot('day400');
if (process.env.SHOT_ONLY === 'day400') {
	await browser.close();
	process.exit(0);
}
// the night side, the terminator in view (the sun 28 degrees below the horizon at the camera)
await sun(-28, 150);
await page.waitForTimeout(9000);
await shot('night400');
// deep night: lights all over the side nothing lights
await sun(-70, 150);
await page.waitForTimeout(9000);
await shot('deepnight400');
await where(30_000);
await look(0.9, 2000);
await sun(-12, 150);
await page.waitForTimeout(9000);
await shot('night30');
await sun(45, 150);
await page.waitForTimeout(9000);
await shot('day30');
// over a settled coast (core's terrain field and `nightLights` put a city there)
await where(30_000, 0.1025, -0.2725);
await look(1.0, 2000);
await sun(-12, 150);
await page.waitForTimeout(9000);
await shot('night30city');
await sun(45, 150);
await page.waitForTimeout(9000);
await shot('day30city');
await browser.close();
