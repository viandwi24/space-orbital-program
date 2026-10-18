/**
 * Plan 066's device table (journal 054's method, scripted so any machine can add its row): frame
 * times of the flight view per preset and scene, the half-resolution rung, the Space Center view,
 * the precompile time and the first-switch hitch, with the GPU the browser reports. Against a
 * `NODE_ENV=development` build (the `__orbital` hook) served by `scripts/serve.ts`:
 *
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5211 &
 *   SHOT_URL=http://localhost:5211 bun scripts/measure-devices.ts [out.json]
 *
 * Chromium runs with the platform GPU (`MEASURE_ANGLE`, default `metal`; `d3d11` on Windows,
 * `vulkan` or `gl` on Linux). Frame time is WebGL only (`renderer.debug.benchmark`): `sync` is the
 * minimum of 12 means of 8 single frames, `thr` the minimum of 12 runs of 8 frames back to back.
 * Every number comes from the second load of a preset (the first compiles the programs).
 *
 * The browser window is headed by default and must stay in view: a headless Chromium read the M2's
 * frames about three times high (journal 066), and a hidden page stops `requestAnimationFrame`, so
 * the glass blur's frame intervals never arrive. `MEASURE_HEADLESS=1` only for a quick smoke run.
 */
import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const base = process.env.SHOT_URL ?? 'http://localhost:5211';
const angle = process.env.MEASURE_ANGLE ?? 'metal';
const out = process.argv[2];
const PRESETS = ['low', 'medium', 'high'] as const;

const browser = await chromium.launch({
	headless: process.env.MEASURE_HEADLESS === '1',
	args: [`--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist']
});
const context = await browser.newContext({
	viewport: { width: 1920, height: 1080 },
	deviceScaleFactor: 1,
	baseURL: base
});

/**
 * Frame time of the scene the live snapshot shows, with the active vessel moved to `scene` (journal
 * 054: synthetic snapshots; the frame loop cannot interleave inside one evaluate).
 */
type Scene = { up: number } | { latitude: number; longitude: number; ground: number } | null;
async function bench(page: Page, scene: Scene = null): Promise<{ sync: number; thr: number }> {
	return page.evaluate((scene) => {
		const o = (window as any).__orbital;
		const r = o.renderer();
		if (scene) {
			const s = structuredClone(o.snapshot());
			const v = s.vessels[0];
			const home = s.bodies.find((b: any) => b.id === 'stock.home');
			const hp = home.position;
			const rel = { x: v.position.x - hp.x, y: v.position.y - hp.y, z: v.position.z - hp.z };
			const n = Math.hypot(rel.x, rel.y, rel.z);
			let dir = { x: rel.x / n, y: rel.y / n, z: rel.z / n };
			let radius = n;
			if ('up' in scene) radius = n + scene.up;
			else {
				// body-fixed direction of the latitude and longitude, turned by the body's rotation
				const la = scene.latitude;
				const lo = scene.longitude;
				const d = {
					x: Math.cos(la) * Math.cos(lo),
					y: Math.sin(la),
					z: -Math.cos(la) * Math.sin(lo)
				};
				const q = home.rotation;
				const ix = q.w * d.x + q.y * d.z - q.z * d.y;
				const iy = q.w * d.y + q.z * d.x - q.x * d.z;
				const iz = q.w * d.z + q.x * d.y - q.y * d.x;
				const iw = -q.x * d.x - q.y * d.y - q.z * d.z;
				dir = {
					x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
					y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
					z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x
				};
				radius = 600_000 + scene.ground + 5;
			}
			v.position = { x: hp.x + dir.x * radius, y: hp.y + dir.y * radius, z: hp.z + dir.z * radius };
			r.update(s);
			r.debug.benchmark(8);
		}
		let sync = Infinity;
		let thr = Infinity;
		for (let w = 0; w < 12; w++) {
			let sum = 0;
			for (let k = 0; k < 8; k++) sum += r.debug.benchmark(1);
			sync = Math.min(sync, sum / 8);
			thr = Math.min(thr, r.debug.benchmark(8));
		}
		if (scene) r.update(o.snapshot());
		return { sync: Math.round(sync * 100) / 100, thr: Math.round(thr * 100) / 100 };
	}, scene);
}

async function waitForFlight(page: Page): Promise<void> {
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{ timeout: 120_000 }
	);
	await page.waitForTimeout(3000);
}

// 1. A profile with the two-stage example in the Hangar and governor off.
const setup = await context.newPage();
await setup.addInitScript(() => localStorage.setItem('orbital.graphics.auto', 'off'));
await setup.goto('/vab');
await setup.getByRole('button', { name: 'Load the two-stage example' }).click();
await setup.waitForTimeout(1500);
const gpu = await setup.evaluate(() => {
	const gl = document.createElement('canvas').getContext('webgl2');
	const ext = gl?.getExtension('WEBGL_debug_renderer_info');
	return ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
});
await setup.close();
console.log('gpu', gpu);

const rows: Record<string, unknown> = {
	gpu,
	angle,
	viewport: '1920x1080 ratio 1',
	when: new Date().toISOString()
};

for (const preset of PRESETS) {
	const page = await context.newPage();
	await page.addInitScript((p) => {
		localStorage.setItem('orbital.graphics', p);
		localStorage.setItem('orbital.graphics.auto', 'off');
	}, preset);
	// first load compiles the programs; the second is measured
	await page.goto('/flight');
	await waitForFlight(page);
	await page.goto('/flight');
	await waitForFlight(page);
	const precompileMs = await page.evaluate(async () => {
		await (window as any).__orbital.renderer().precompile();
		return Math.round(performance.now());
	});
	const scenes: Record<string, unknown> = { pad: await bench(page) };
	const glass = await page.evaluate(async () => {
		const o = (window as any).__orbital;
		o.glass('blur');
		await new Promise((r) => setTimeout(r, 1000));
		const blur = await o.frameIntervals(240);
		o.glass('solid');
		await new Promise((r) => setTimeout(r, 1000));
		const solid = await o.frameIntervals(240);
		o.glass(null);
		return { blur, solid };
	});
	for (const [name, h] of [
		['3 km', 3_000],
		['12 km', 12_000],
		['orbit 100 km', 100_000]
	] as const)
		scenes[name] = await bench(page, { up: h });
	if (preset === 'medium') {
		await page.evaluate(() => (window as any).__orbital.renderer().setPlanetScale(0.5));
		scenes['pad, half-resolution rung'] = await bench(page);
		await page.evaluate(() => (window as any).__orbital.renderer().setPlanetScale(1));
	}
	// the first switch to each other preset after the precompile: call plus first frame
	const hitch = await page.evaluate((current) => {
		const r = (window as any).__orbital.renderer();
		const res: Record<string, number> = {};
		for (const p of ['low', 'medium', 'high'].filter((x) => x !== current)) {
			const t0 = performance.now();
			r.setPreset(p);
			r.debug.benchmark(1);
			res[p] = Math.round(performance.now() - t0);
		}
		r.setPreset(current);
		return res;
	}, preset);
	rows[preset] = { precompileMs, scenes, glass, hitchMs: hitch };
	console.log(preset, JSON.stringify(rows[preset]));
	await page.close();
}

// 2. The Space Center view at its default camera (second load).
const sc = await context.newPage();
await sc.addInitScript(() => localStorage.setItem('orbital.graphics.auto', 'off'));
for (const preset of PRESETS) {
	await sc.evaluate((p) => localStorage.setItem('orbital.graphics', p), preset).catch(() => {});
	await sc.goto('/space-center');
	await sc.waitForFunction(() => (window as any).__orbital?.renderer?.(), null, {
		timeout: 120_000
	});
	await sc.goto('/space-center');
	await sc.waitForFunction(() => (window as any).__orbital?.renderer?.(), null, {
		timeout: 120_000
	});
	await sc.waitForTimeout(4000);
	rows[`space-center ${preset}`] = await bench(sc);
	console.log('space-center', preset, JSON.stringify(rows[`space-center ${preset}`]));
}

await browser.close();
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
console.log(JSON.stringify(rows, null, 1));
