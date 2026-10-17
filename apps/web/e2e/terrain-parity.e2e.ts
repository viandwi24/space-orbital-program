import { expect, test } from '@playwright/test';
import { launchTwoStage } from './support';

/**
 * Renderer parity with two flat zones (plan 084, journal 031 method): the baked patches read back from
 * the GPU (float32) against the core height function (float64) the renderer's camera reads. Needs the
 * debug hook of a development build:
 *   NODE_ENV=development bun run build && bun scripts/serve.ts 5211
 *   E2E_DEV_HOOKS=1 E2E_PORT=5211 bunx playwright test e2e/terrain-parity.e2e.ts --project=chromium
 */
test.skip(!process.env.E2E_DEV_HOOKS, 'needs a development build (window.__orbital)');

test('baked ground matches heightAt within the journal 031 bounds, with a second zone', async ({
	page
}) => {
	await launchTwoStage(page);
	await page.waitForFunction(
		() =>
			(window as unknown as { __orbital?: { renderer: () => unknown } }).__orbital?.renderer() !=
			null,
		undefined,
		{ timeout: 60_000 }
	);
	const result = await page.evaluate(async () => {
		type V = { x: number; y: number; z: number };
		const hook = (window as unknown as { __orbital: { renderer: () => any } }).__orbital;
		const r = hook.renderer().debug;
		const frames = (n: number) =>
			new Promise<void>((done) => {
				let k = 0;
				const tick = () => (++k >= n ? done() : requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			});
		const norm = (v: V): V => {
			const l = Math.hypot(v.x, v.y, v.z);
			return { x: v.x / l, y: v.y / l, z: v.z / l };
		};
		const legacy = { latitude: 0, longitude: 0, flatRadius: 5000, blendWidth: 11000 };
		// a second zone 6 km east of the pad, inside the mid patch (33 km): flat 1.5 km, blend 3 km
		const second = { latitude: 0, longitude: 6000 / 600000, flatRadius: 1500, blendWidth: 3000 };
		const zone2 = { x: Math.cos(second.longitude), y: 0, z: -Math.sin(second.longitude) };
		/** Bake `zones`, then compare 1 000 texels of each patch (same texels every run) with heightAt. */
		async function measure(zones: (typeof legacy)[]) {
			r.setTerrain({ seed: 20261016, zones });
			await frames(90);
			const out: Record<
				string,
				{ mean: number; worst: number; zoneMax: number; zoneTexels: number }
			> = {};
			for (const which of ['fine', 'mid'] as const) {
				const p = r.readPatch(which);
				if (!p) throw new Error(`no ${which} patch`);
				const { centre: c, east: e, north: f, halfTan } = p.frame;
				let seed = 12345;
				const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
				let sum = 0;
				let worst = 0;
				let zoneMax = 0;
				let zoneTexels = 0;
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
					const diff = Math.abs(gpu - r.terrainHeightAt(d));
					sum += diff;
					worst = Math.max(worst, diff);
					const arc =
						600000 * Math.acos(Math.min(1, d.x * zone2.x + d.y * zone2.y + d.z * zone2.z));
					if (arc < second.flatRadius) {
						zoneTexels++;
						zoneMax = Math.max(zoneMax, Math.abs(gpu));
					}
				}
				out[which] = { mean: sum / 1000, worst, zoneMax, zoneTexels };
			}
			return out;
		}
		const base = await measure([legacy]);
		const two = await measure([legacy, second]);
		return { base, two };
	});
	console.log('terrain parity', JSON.stringify(result));
	// the same engine, the same texels: two zones are as exact as the Legacy terrain (journal 031:
	// the float32 floor of the lattice, ADR 0044; 0.806 m worst on the M5 GPU, more in SwiftShader)
	expect(result.two.mid!.worst).toBeLessThanOrEqual(result.base.mid!.worst + 0.05);
	expect(result.two.mid!.mean).toBeLessThanOrEqual(result.base.mid!.mean + 0.02);
	expect(result.two.fine!.worst).toBeLessThanOrEqual(result.base.fine!.worst + 0.05);
	// inside the second zone the GPU ground is flat too
	expect(result.two.mid!.zoneTexels).toBeGreaterThan(5);
	expect(result.two.mid!.zoneMax).toBeLessThan(0.01);
});
