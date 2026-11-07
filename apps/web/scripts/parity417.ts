/**
 * GPU against CPU heights at a highland of the massif (plan 417): after a teleport to the cliffs
 * 36 km east of the pad, reads the fine and the mid terrain patch back and compares 1 000 texels of
 * each with `terrainHeightAt` (core's `terrainHeight`). The mid patch is band-limited by design
 * (octaves finer than four texels fade out into their mean), so its difference is larger than the
 * fine one's. Against a dev server:
 *
 *   SHOT_URL=http://localhost:5242 [PRESET=high] bun scripts/parity417.ts
 */
import { chromium } from './lib/chromium';
import { setupVessel, waitForFlight } from './lib/frame-matrix';

const base = process.env.SHOT_URL ?? 'http://localhost:5242';
const preset = process.env.PRESET ?? 'high';
const backend = process.env.BACKEND ?? 'webgpu';

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: base });
await context.addInitScript(() => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
});
const setup = await context.newPage();
await setupVessel(setup);
await setup.close();
const page = await context.newPage();
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
await page.waitForTimeout(3000);
await page.evaluate(() =>
	(window as any).__orbitalDebug.setLocation({
		kind: 'surface',
		latitude: 0.0127,
		longitude: 0.059
	})
);
await page.waitForTimeout(8000);
const result = await page.evaluate(() => {
	const r = (window as any).__orbital.renderer().debug;
	type V = { x: number; y: number; z: number };
	const norm = (v: V): V => {
		const l = Math.hypot(v.x, v.y, v.z);
		return { x: v.x / l, y: v.y / l, z: v.z / l };
	};
	const out: Record<string, unknown> = {};
	for (const which of ['fine', 'mid'] as const) {
		const p = r.readPatch(which);
		if (!p) {
			out[which] = null;
			continue;
		}
		const { centre: c, east: e, north: f, halfTan } = p.frame;
		let seed = 12345;
		const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
		let sum = 0;
		let worst = 0;
		let signed = 0;
		let high = 0;
		for (let k = 0; k < 1000; k++) {
			const i = Math.floor(next() * p.size);
			const j = Math.floor(next() * p.size);
			const u = ((i + 0.5) / p.size) * 2 - 1;
			const v = ((j + 0.5) / p.size) * 2 - 1;
			const d = norm({
				x: c.x + halfTan * (u * e.x + v * f.x),
				y: c.y + halfTan * (u * e.y + v * f.y),
				z: c.z + halfTan * (u * e.z + v * f.z)
			});
			const gpu = p.heights[j * p.size + i];
			const cpu = r.terrainHeightAt(d);
			const diff = Math.abs(gpu - cpu);
			sum += diff;
			signed += gpu - cpu;
			worst = Math.max(worst, diff);
			high = Math.max(high, cpu);
		}
		out[which] = { size: p.size, mean: sum / 1000, bias: signed / 1000, worst, highestCpu: high };
	}
	return out;
});
console.log(JSON.stringify(result));
await browser.close();
