/**
 * The look check of plan 364 (planet textures and sky like KSP): the same cameras before and after,
 * with the GPU time of each view. The sim is paused and the focused vessel moved in the live
 * snapshot, so every run sees the same place, sun and time. Against a dev server (the `__orbital` hook):
 *
 *   SHOT_TAG=before SHOT_URL=http://localhost:5173 bun scripts/capture-planet-sky.ts
 *
 * Options: SHOT_RENDERER (webgpu, webgl or webgpu-fallback; default webgpu), SHOT_PRESET (high),
 * SHOT_VIEWS (comma list, default all), SHOT_OUT (default docs/journal/assets).
 * Output: `364-<tag>-<renderer>-<view>.jpg` and a line per view with its GPU ms.
 */
import { chromium, type Page } from '@playwright/test';
import { join } from 'node:path';

const base = process.env.SHOT_URL ?? 'http://localhost:5173';
const tag = process.env.SHOT_TAG ?? 'after';
const out = process.env.SHOT_OUT ?? join(import.meta.dir, '../../../docs/journal/assets');
const preset = process.env.SHOT_PRESET ?? 'high';
const backend = process.env.SHOT_RENDERER ?? 'webgpu';

/** Where the vessel sits (body-fixed latitude and longitude, rad; altitude, m) and how the camera looks. */
interface View {
	latitude: number;
	longitude: number;
	altitude: number;
	rig: { yaw: number; pitch: number; distance: number };
	sun: { elevation: number; azimuth: number };
	map?: boolean;
	night?: boolean;
}
const VIEWS: Record<string, View> = {
	orbit100: {
		latitude: 0.12,
		longitude: 0.35,
		altitude: 100_000,
		rig: { yaw: 0.6, pitch: 0.55, distance: 40 },
		sun: { elevation: 45, azimuth: 120 }
	},
	orbit2000: {
		latitude: 0.25,
		longitude: 0.3,
		altitude: 2_000_000,
		rig: { yaw: 0.6, pitch: 1.45, distance: 40 },
		sun: { elevation: 50, azimuth: 120 }
	},
	map: {
		latitude: 0.12,
		longitude: 0.35,
		altitude: 100_000,
		rig: { yaw: 0.6, pitch: 0.55, distance: 40 },
		sun: { elevation: 45, azimuth: 120 },
		map: true
	},
	'pad-night': {
		latitude: 0,
		longitude: 0,
		altitude: -1,
		rig: { yaw: 0.9, pitch: -0.95, distance: 30 },
		sun: { elevation: -30, azimuth: 80 },
		night: true
	}
};
const names = (process.env.SHOT_VIEWS ?? Object.keys(VIEWS).join(',')).split(',');

const browser = await chromium.launch({
	headless: false,
	args: [
		'--use-angle=metal',
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu',
		'--enable-features=Vulkan,WebGPU'
	]
});
const ab = process.env.SHOT_AB === '1';

const flightReady = (page: Page) =>
	page.waitForFunction(() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0, null, {
		timeout: 240_000
	});

/** A fresh context per view: the world each view launches is its own. */
async function openFlight(): Promise<Page> {
	const context = await browser.newContext({
		viewport: { width: 1512, height: 945 },
		deviceScaleFactor: 2,
		baseURL: base
	});
	const page = await context.newPage();
	page.on('pageerror', (e) => console.log('  pageerror', e.message));
	page.on('console', (m) => {
		if (m.type() === 'error' || /lost|uncaptured|validation/i.test(m.text()))
			console.log('  console', m.type(), m.text().slice(0, 300));
	});
	await page.addInitScript((p) => {
		localStorage.setItem('orbital.graphics', p);
		localStorage.setItem('orbital.graphics.auto', 'off');
		localStorage.setItem('orbital.graphics.features', '');
		localStorage.setItem('orbital.vab.hideStart', '1');
	}, preset);
	// the e2e launch (`e2e/support.ts`): the Hangar's example through its debug global, Launch, Go
	await page.goto('/vab');
	await page.waitForFunction(
		() => typeof (window as any).__orbitalVab?.loadTwoStage === 'function',
		null,
		{
			timeout: 120_000
		}
	);
	await page.evaluate(() => (window as any).__orbitalVab.loadTwoStage());
	await page.getByTestId('menu-launch').click();
	const anyway = page.getByRole('button', { name: 'Launch anyway' });
	if (await anyway.isVisible().catch(() => false)) await anyway.click();
	await page.waitForURL('**/launch');
	await page.getByTestId('launch-go').click();
	await page.waitForURL('**/flight');
	await flightReady(page);
	if (backend !== 'webgpu') {
		await page.goto(`/flight?renderer=${backend}`);
		await flightReady(page);
	}
	// the loading screen (plan 340) lists its steps until the first frame after the warm-up is drawn
	await page.waitForFunction(
		() => !document.body.innerText.includes('Drawing the first frame'),
		null,
		{
			timeout: 240_000
		}
	);
	await page.waitForTimeout(4000);
	return page;
}

/** Put the focused vessel at the view's place (debug `setLocation`), pause the sim, set the sun and camera. */
async function place(page: Page, v: View): Promise<void> {
	if (v.altitude >= 0) {
		await page.evaluate(
			(v) =>
				(window as any).__orbitalDebug.setLocation({
					kind: 'air',
					latitude: v.latitude,
					longitude: v.longitude,
					altitude: v.altitude,
					speed: 0,
					climb: 0
				}),
			v
		);
		await page.waitForTimeout(1500);
	}
	await page.evaluate(async (v) => {
		const o = (window as any).__orbital;
		await o.send({ type: 'pause', on: true });
		const r = o.renderer();
		r.setMapView(!!v.map);
		r.debug.setSun(v.sun);
		r.debug.setCamera(v.rig);
	}, v);
	// F2 hides the interface: the canvas alone
	await page.keyboard.press('F2');
}

for (const name of names) {
	const v = VIEWS[name];
	if (!v) throw new Error(`unknown view "${name}"`);
	const page = await openFlight();
	if (v.altitude < 0) {
		await page.evaluate(() => (window as any).__orbital.renderer().debug.applyPreset('pad-night'));
	}
	await place(page, v);
	await page.waitForTimeout(7000);
	const shoot = (suffix: string) =>
		page
			.locator('canvas')
			.first()
			.screenshot({
				path: join(out, `364-${tag}-${backend}-${name}${suffix}.jpg`),
				type: 'jpeg',
				quality: 88
			});
	await shoot('');
	if (ab) {
		// the bake off, then read everywhere; the ground detail off: a shot and the GPU time of each
		const gpu = () =>
			page.evaluate(async () => {
				const r = (window as any).__orbital.renderer();
				const runs: number[] = [];
				for (let i = 0; i < 7; i++) runs.push(await r.debug.benchmarkAsync(20));
				return runs.sort((a, b) => a - b)[3]!.toFixed(2);
			});
		for (const mode of ['off', 'only'] as const) {
			await page.evaluate((m) => (window as any).__orbital.renderer().debug.scaledSpace(m), mode);
			await page.waitForTimeout(1500);
			await shoot(`-${mode}`);
			console.log(`  ${name} bake ${mode}: gpu ${await gpu()} ms`);
		}
		await page.evaluate(() => (window as any).__orbital.renderer().debug.scaledSpace('on'));
		await page.evaluate(() => (window as any).__orbital.renderer().debug.groundDetail(false));
		await page.waitForTimeout(1500);
		console.log(`  ${name} detail off: gpu ${await gpu()} ms`);
		await page.evaluate(() => (window as any).__orbital.renderer().debug.groundDetail(true));
		console.log(`  ${name} detail on: gpu ${await gpu()} ms`);
	}
	const timing = await page.evaluate(async () => {
		const r = (window as any).__orbital.renderer();
		// the median of seven 20-frame runs: single short runs read anywhere from 0.1 to 2x
		const runs: number[] = [];
		for (let i = 0; i < 7; i++) runs.push(await r.debug.benchmarkAsync(20));
		const intervals = await (window as any).__orbital.frameIntervals(180);
		return { gpuMs: runs.sort((a, b) => a - b)[3]!, intervals, info: r.debug.info() };
	});
	console.log(
		`${name}: gpu ${timing.gpuMs.toFixed(2)} ms, frame p50 ${timing.intervals.p50Ms.toFixed(1)} p95 ${timing.intervals.p95Ms.toFixed(1)} ms, ${timing.info.renderer} ${timing.info.preset} ${timing.info.size.join('x')} alt ${Math.round(timing.info.altitude)}`
	);
	await page.context().close();
}
await browser.close();
