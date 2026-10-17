import { describe, expect, test } from 'bun:test';
import {
	MAP_WARP,
	OCTAVE_ROTATION,
	SITE_BLEND_WIDTH,
	SITE_FLAT_RADIUS,
	TERRAIN_SHAPE,
	cachedPlanetMap,
	createTerrainField,
	latLonDirection,
	terrainHeight,
	type TerrainContext,
	type TerrainField
} from '@orbital/core';
import { PRESETS } from '../src/presets.ts';
import { zoneUniforms } from '../src/terrain-zones.ts';
import {
	terrainBakeFragment,
	terrainNoiseGLSL,
	terrainPatchFragment
} from '../src/shaders/terrain.glsl.ts';
import { planetFragment } from '../src/shaders/planet.glsl.ts';
import {
	PATCH_BLEND,
	PATCH_LATTICE,
	PATCH_RECENTRE_FRACTION,
	PATCH_SPANS,
	latticeDirection,
	liftAboveTerrain,
	patchCoords,
	patchDirection,
	patchFrame,
	patchNeedsRecentre,
	patchTexel,
	patchWeight,
	tangentBasis
} from '../src/terrain-patch.ts';
import { dot, normalize, scale, vec } from '../src/vec.ts';

const R = 600_000;

function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

describe('patch geometry (ADR 0044)', () => {
	test('patchCoords inverts patchDirection to 1e-9 anywhere in a patch', () => {
		const r = rng(1);
		for (const span of [PATCH_SPANS.fine, PATCH_SPANS.mid]) {
			const frame = patchFrame(normalize(vec(r() - 0.3, r() - 0.5, r() - 0.5)), R, span);
			for (let i = 0; i < 200; i++) {
				const u = r() * 2 - 1;
				const v = r() * 2 - 1;
				const back = patchCoords(frame, patchDirection(frame, u, v));
				expect(back.front).toBe(true);
				expect(Math.abs(back.u - u)).toBeLessThan(1e-9);
				expect(Math.abs(back.v - v)).toBeLessThan(1e-9);
			}
		}
	});

	test('the frame is orthonormal and its axes are the shader tangent basis', () => {
		const r = rng(2);
		for (let i = 0; i < 100; i++) {
			const n = normalize(vec(r() - 0.5, r() - 0.5, r() - 0.5));
			const f = patchFrame(n, R, PATCH_SPANS.fine);
			const t = tangentBasis(n);
			expect(Math.abs(dot(f.east, f.north))).toBeLessThan(1e-12);
			expect(Math.abs(dot(f.east, f.centre))).toBeLessThan(1e-12);
			expect(dot(f.east, t.t1)).toBeCloseTo(1, 12);
			expect(dot(f.north, t.t2)).toBeCloseTo(1, 12);
		}
	});

	test('the half width is the span over twice the radius; the texel is span / texels at the centre', () => {
		const f = patchFrame(vec(1, 0, 0), R, PATCH_SPANS.fine);
		expect(f.halfTan * 2 * R).toBeCloseTo(PATCH_SPANS.fine, 9);
		expect(patchTexel(f, 1024) * R).toBeCloseTo(4, 6);
		expect(patchTexel(patchFrame(vec(1, 0, 0), R, PATCH_SPANS.mid), 1024) * R).toBeCloseTo(32, 6);
	});

	test('the weight is 1 inside the blend start, 0 at the edge and monotone between', () => {
		expect(patchWeight(0)).toBe(1);
		expect(patchWeight(PATCH_BLEND.start)).toBe(1);
		expect(patchWeight(PATCH_BLEND.end)).toBe(0);
		let last = 2;
		for (let m = 0; m <= 1.1; m += 0.01) {
			const w = patchWeight(m);
			expect(w).toBeLessThanOrEqual(last);
			last = w;
		}
	});

	test('re-centring never leaves the camera outside the inner core: a moving camera is always inside the baked patch', () => {
		const r = rng(3);
		let frame: ReturnType<typeof patchFrame> | null = null;
		let n = normalize(vec(1, 0.01, 0.02));
		let rebuilds = 0;
		for (let step = 0; step < 4000; step++) {
			// the camera flies about 90 m per step along a great circle in a random heading
			const heading = vec(r() - 0.5, r() - 0.5, r() - 0.5);
			const t = normalize(
				vec(
					heading.x - n.x * dot(heading, n),
					heading.y - n.y * dot(heading, n),
					heading.z - n.z * dot(heading, n)
				)
			);
			const a = (90 * (step % 40 < 20 ? 1 : 0.2)) / R;
			n = normalize(vec(n.x + t.x * a, n.y + t.y * a, n.z + t.z * a));
			if (patchNeedsRecentre(frame, n)) {
				frame = patchFrame(latticeDirection(n, R), R, PATCH_SPANS.fine);
				rebuilds++;
			}
			const c = patchCoords(frame!, n);
			// inside the core, plus one lattice cell of snapping
			expect(c.extent).toBeLessThanOrEqual(
				PATCH_RECENTRE_FRACTION + 1e-9 + (2 * PATCH_LATTICE) / (PATCH_SPANS.fine / 2)
			);
		}
		expect(rebuilds).toBeGreaterThan(5);
		expect(rebuilds).toBeLessThan(400);
	});

	test('a lattice centre is within one lattice cell of the direction and deterministic', () => {
		const n = normalize(vec(0.3, 0.5, 0.8));
		const a = latticeDirection(n, R);
		expect(latticeDirection(n, R)).toEqual(a);
		const d = Math.hypot(a.x - n.x, a.y - n.y, a.z - n.z) * R;
		expect(d).toBeLessThan(PATCH_LATTICE * Math.sqrt(3));
	});
});

describe('the baked patches reproduce the height function where a vessel can touch the ground', () => {
	/** Bilinear read of a patch grid of `texels` per side filled from `terrainHeight` at the texel centres. */
	function patchError(span: number, texels: number, centreMetres: number, points: number) {
		const ctx: TerrainContext = {
			radius: R,
			map: cachedPlanetMap(1024),
			siteDirection: vec(1, 0, 0)
		};
		const centre = latLonDirection(0, centreMetres / R);
		const frame = patchFrame(centre, R, span);
		const grid = new Float64Array(texels * texels);
		for (let j = 0; j < texels; j++) {
			for (let i = 0; i < texels; i++) {
				const u = ((i + 0.5) / texels) * 2 - 1;
				const v = ((j + 0.5) / texels) * 2 - 1;
				grid[j * texels + i] = terrainHeight(patchDirection(frame, u, v), ctx);
			}
		}
		const r = rng(5);
		let worst = 0;
		for (let k = 0; k < points; k++) {
			// inside the part of the patch where its weight is 1
			const u = (r() * 2 - 1) * PATCH_BLEND.start;
			const v = (r() * 2 - 1) * PATCH_BLEND.start;
			const fx = ((u + 1) / 2) * texels - 0.5;
			const fy = ((v + 1) / 2) * texels - 0.5;
			const x0 = Math.floor(fx);
			const y0 = Math.floor(fy);
			const tx = fx - x0;
			const ty = fy - y0;
			const at = (x: number, y: number) => grid[y * texels + x]!;
			const bilinear =
				(at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) +
				(at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
			worst = Math.max(worst, Math.abs(bilinear - terrainHeight(patchDirection(frame, u, v), ctx)));
		}
		return worst;
	}

	test('the fine patch (4 m texels) is within 0.05 m over the massif, the mid patch (32 m) within 1 m', () => {
		for (const km of [25_000, 30_000, 40_000]) {
			expect(patchError(PATCH_SPANS.fine, 1024, km, 1500)).toBeLessThan(0.05);
			expect(patchError(PATCH_SPANS.mid, 1024, km, 1500)).toBeLessThan(1);
		}
	}, 60_000);
});

describe('the camera is held above the terrain', () => {
	const ridge: TerrainField = {
		maxHeight: 4_500,
		heightAt: (n) => 1_000 + 800 * Math.sin(n.x * 4_000) * Math.cos(n.z * 4_000)
	};

	test('no position within 1 m of the ground survives; a position already above is returned as is', () => {
		const r = rng(7);
		for (let i = 0; i < 1000; i++) {
			const n = normalize(vec(1 + (r() - 0.5) * 0.02, (r() - 0.5) * 0.02, (r() - 0.5) * 0.02));
			const depth = r() * 3_000 - 200; // from 200 m above the sphere to 2 800 m
			const p = scale(n, R + depth);
			const lifted = liftAboveTerrain(p, ridge, R, 1);
			const height = ridge.heightAt(normalize(lifted));
			expect(Math.hypot(lifted.x, lifted.y, lifted.z)).toBeGreaterThanOrEqual(
				R + height + 1 - 1e-6
			);
			if (depth >= ridge.heightAt(n) + 1) expect(lifted).toBe(p);
			// the lift is radial: the direction does not change
			expect(dot(normalize(lifted), n)).toBeCloseTo(1, 12);
		}
	});

	test('high above the terrain nothing is evaluated', () => {
		let calls = 0;
		const counting: TerrainField = {
			maxHeight: 4_500,
			heightAt: () => {
				calls++;
				return 0;
			}
		};
		const p = vec(R + 50_000, 0, 0);
		expect(liftAboveTerrain(p, counting, R, 1)).toBe(p);
		expect(calls).toBe(0);
	});

	test('on the procedural field a camera inside a mountain is lifted to its slope', () => {
		const field = createTerrainField({ radius: R });
		const r = rng(9);
		let lifted = 0;
		for (let i = 0; i < 400; i++) {
			const az = r() * 6.28;
			const ang = (20_000 + r() * 30_000) / R;
			const n = vec(Math.cos(ang), Math.sin(ang) * Math.cos(az), Math.sin(ang) * Math.sin(az));
			const h = field.heightAt(n);
			const p = scale(n, R + h * 0.5);
			const out = liftAboveTerrain(p, field, R, 1);
			if (h > 5) {
				expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(R + h + 1, 6);
				lifted++;
			}
		}
		expect(lifted).toBeGreaterThan(50);
	});
});

describe('shader constants come from core', () => {
	const norm = (x: number) => (Number.isInteger(x) ? `${x}.0` : String(x));
	test('the bake and the planet pass carry the terrain table, the warp and the octave rotation', () => {
		const s = TERRAIN_SHAPE;
		expect(terrainBakeFragment).toContain(norm(s.mountainAmplitude));
		expect(terrainBakeFragment).toContain(norm(s.hillAmplitude));
		// the site's flat radius and blend come as zone uniforms (plan 084); the Legacy values are core's
		expect(terrainBakeFragment).toContain('uniform vec4 uZones[8];');
		expect(terrainNoiseGLSL).toContain('ivec3(uTerrainShift)');
		const z = zoneUniforms();
		expect(z.uZones.value[0]!.w).toBe(SITE_FLAT_RADIUS);
		expect(z.uZoneBlend.value[0]).toBe(SITE_BLEND_WIDTH);
		expect(z.uZoneCount.value).toBe(1);
		expect(z.uTerrainShift.value).toBe(0);
		expect(terrainBakeFragment).toContain(norm(s.ridgeSoftness ** 2));
		expect(terrainPatchFragment).toContain(norm(s.mountainAmplitude));
		expect(terrainNoiseGLSL).toContain(norm(MAP_WARP.amplitude));
		for (const w of MAP_WARP.wavelengthsKm) expect(terrainNoiseGLSL).toContain(norm(w));
		for (const row of OCTAVE_ROTATION)
			for (const x of row) expect(terrainNoiseGLSL).toContain(String(x));
		// the planet pass reads the map through the same warp and no longer has a camera bubble
		expect(planetFragment).toContain('warpedLatLon(nBF, uR)');
		expect(planetFragment).not.toMatch(/uBubble|BUB_R|bubbleWeight/);
	});
});

describe('presets', () => {
	test('patch resolution is monotone low <= medium <= high and high has the full 1024', () => {
		expect(PRESETS.low.terrainPatch).toBeLessThanOrEqual(PRESETS.medium.terrainPatch);
		expect(PRESETS.medium.terrainPatch).toBeLessThanOrEqual(PRESETS.high.terrainPatch);
		expect(PRESETS.high.terrainPatch).toBe(1024);
	});
});
