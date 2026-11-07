/**
 * Screens of plan 417 (journal 417): the ground relief of the home planet from the pad, from a
 * highland at 300 m and 3 km, and from 30 km over the mountains, at Low and High, headed Chromium
 * on the Mac's GPU against a dev server:
 *
 *   SHOT_TAG=before SHOT_URL=http://localhost:5241 bun scripts/capture-417.ts
 *
 * Output: `docs/journal/assets/417-<tag>-<preset>-<view>.jpg` (canvas only). The vessel stands on a
 * highland of the massif 36 km east of the pad where the new terrain has the most cliffs (latitude
 * 0.0127, longitude 0.059, 1.8 km high); the camera is at the vessel, which stands there, hangs 3 km
 * or 30 km above it. F2 hides the interface.
 */
import { chromium } from './lib/chromium';
import { join } from 'node:path';
import { setupVessel, waitForFlight } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const tag = process.env.SHOT_TAG ?? 'after';
const presets = (process.env.PRESETS ?? 'low,high').split(',');
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const views = (process.env.SHOT_VIEWS ?? 'pad,hill300,hill3k,mtn30k').split(',');
const backend = process.env.BACKEND ?? 'webgpu';
const SUMMIT = { latitude: 0.0127, longitude: 0.059 };
const GROUND = 1_835;
const YAW = process.env.SHOT_YAW ? Number(process.env.SHOT_YAW) : undefined;
/**
 * Where the vessel is for a view: the highland itself, or 3 km / 30 km above it hanging (the vessel falls a few
 * hundred metres while the shot is taken), the camera in free mode looking towards the massif (the flight camera only orbits a few tens of metres out). Altitudes are above the sphere.
 */
const PLACES: Record<
	string,
	{ altitude?: number; camera: { yaw: number; pitch: number; distance: number } }
> = {
	hill300: { camera: { yaw: 2.4, pitch: 0.1, distance: 300 } },
	hill3k: { altitude: GROUND + 3_000, camera: { yaw: 2.4, pitch: 0.12, distance: 40 } },
	mtn30k: { altitude: GROUND + 30_000, camera: { yaw: 2.4, pitch: 0.25, distance: 40 } }
};

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
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
});
const setup = await context.newPage();
await setupVessel(setup);
await setup.close();

for (const preset of presets) {
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' || m.type() === 'warning')
			console.log('  console', m.text().slice(0, 300));
	});
	await page.addInitScript(
		([b, p]) => {
			localStorage.setItem('orbital.graphics.renderer', b!);
			localStorage.setItem('orbital.graphics', p!);
			localStorage.setItem('orbital.graphics.auto', 'off');
		},
		[backend, preset]
	);
	await page.goto('/flight');
	await waitForFlight(page);
	await page.waitForTimeout(4000);
	await page.keyboard.press('F2');
	const canvas = page.locator('canvas').first();
	for (const view of views) {
		if (view !== 'pad') {
			const place = PLACES[view]!;
			await page.evaluate(
				([s, alt]) =>
					(window as any).__orbitalDebug.setLocation(
						alt
							? { kind: 'air', ...(s as object), altitude: alt, speed: 0, climb: 0 }
							: { kind: 'surface', ...(s as object) }
					),
				[SUMMIT, place.altitude ?? 0] as const
			);
			await page.waitForTimeout(4000);
			await page.evaluate(
				([c, clouds]) => {
					const r = (window as any).__orbital.renderer();
					r.setCameraMode?.('free');
					// the clouds hide the massif from 30 km: off for every shot, before and after
					r.debug.setLookOff('clouds', clouds);
					r.debug.setCamera(c);
				},
				[{ ...place.camera, yaw: YAW ?? place.camera.yaw }, view === 'mtn30k'] as const
			);
		}
		// the terrain bakes recentre and the TAAU history settles
		await page.waitForTimeout(view === 'pad' ? 3000 : 7000);
		await canvas.screenshot({
			path: join(out, `417-${tag}-${preset}-${view}.jpg`),
			type: 'jpeg',
			quality: 85
		});
		console.log(`${preset} ${view} done`);
	}
	await page.close();
}
await browser.close();
