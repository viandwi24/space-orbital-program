/** Plan 052 / ADR 0068: the shadow march that the moon's shader repeats - geometry, softness, bounds. */
import { describe, expect, test } from 'bun:test';
import { createRng, MOON_MAX_SLOPE, moonHeight, type Vec3 } from '@orbital/core';
import {
	SHADOW_MARCH,
	SHADOW_STEPS,
	shadowRayLength,
	shadowStepDistance,
	terrainSunVisibility
} from '../src/terrain-shadow.ts';
import { dot, normalize, vec } from '../src/vec.ts';
import { moonShadowCommon } from '../src/shaders/moon.glsl.ts';

const R = 190_000;

/** A cliff: the ground is `H` m high everywhere with y > 0 (a plateau to the sun's side), 0 elsewhere. */
const cliff = (H: number) => (n: Vec3) => (n.y > 0 ? H : 0);

/** The point `distance` m west of the cliff edge, the sun `elevation` rad up toward the cliff (east). */
function behindCliff(distance: number, elevation: number, H: number): number {
	const phi = -distance / R;
	const n0 = vec(Math.cos(phi), Math.sin(phi), 0);
	const east = vec(-Math.sin(phi), Math.cos(phi), 0);
	const sun = normalize(
		vec(
			Math.cos(elevation) * east.x + Math.sin(elevation) * n0.x,
			Math.cos(elevation) * east.y + Math.sin(elevation) * n0.y,
			0
		)
	);
	return terrainSunVisibility({ groundAt: cliff(H), radius: R, direction: n0, height: 0, sun });
}

describe('the march', () => {
	test('the ray is longer for a lower sun, within bounds, and its steps run from the minimum to the end', () => {
		let last = Infinity;
		for (const mu of [0.02, 0.06, 0.1, 0.3, 0.7, 1]) {
			const len = shadowRayLength(mu);
			expect(len).toBeLessThanOrEqual(last);
			expect(len).toBeGreaterThanOrEqual(SHADOW_MARCH.minLength);
			expect(len).toBeLessThanOrEqual(SHADOW_MARCH.maxDistance);
			last = len;
		}
		const len = shadowRayLength(0.1);
		let previous = 0;
		for (let i = 1; i <= SHADOW_MARCH.steps; i++) {
			const t = shadowStepDistance(i, len);
			expect(t).toBeGreaterThan(previous);
			previous = t;
		}
		expect(previous).toBeCloseTo(len, 9);
	});

	test('flat ground and a ground-level sun is lit; a sun below the horizon is not', () => {
		const n0 = vec(1, 0, 0);
		const up = (e: number): Vec3 =>
			normalize(vec(Math.sin(e), Math.cos(e), 0)); /* tangent y, normal x */
		const flat = (e: number) =>
			terrainSunVisibility({
				groundAt: () => 100,
				radius: R,
				direction: n0,
				height: 100,
				sun: vec(Math.sin(e), Math.cos(e), 0)
			});
		for (const deg of [1, 3, 10, 45, 90]) expect(flat((deg * Math.PI) / 180)).toBe(1);
		expect(up(0.1)).toBeDefined();
		expect(flat((-0.6 * Math.PI) / 2)).toBe(0);
	});

	test('a cliff shades the ground behind it out to height over tan(elevation), and not beyond', () => {
		const H = 30;
		for (const deg of [4, 8, 15]) {
			const e = (deg * Math.PI) / 180;
			const length = H / Math.tan(e);
			expect(behindCliff(0.7 * length, e, H)).toBe(0);
			expect(behindCliff(1.3 * length, e, H)).toBe(1);
		}
	});

	test('a smooth ridge has a soft shadow edge: a run of partial values, no big jump between neighbours, lit far out', () => {
		const H = 60;
		const e = (4 * Math.PI) / 180;
		// the ground rises smoothly over 600 m east of the origin and stays high
		const ridge = (n: Vec3): number => {
			const x = n.y > 0 ? Math.atan2(n.y, n.x) * R : 0;
			const t = Math.min(1, Math.max(0, x / 600));
			return H * t * t * (3 - 2 * t);
		};
		const visibility = (distance: number): number => {
			const phi = -distance / R;
			const n0 = vec(Math.cos(phi), Math.sin(phi), 0);
			const east = vec(-Math.sin(phi), Math.cos(phi), 0);
			const sun = normalize(
				vec(Math.cos(e) * east.x + Math.sin(e) * n0.x, Math.cos(e) * east.y + Math.sin(e) * n0.y, 0)
			);
			return terrainSunVisibility({ groundAt: ridge, radius: R, direction: n0, height: 0, sun });
		};
		let partial = 0;
		let worstJump = 0;
		let previous = visibility(100);
		for (let distance = 101; distance <= 2_500; distance++) {
			const v = visibility(distance);
			if (v > 0.02 && v < 0.98) partial++;
			worstJump = Math.max(worstJump, Math.abs(v - previous));
			previous = v;
		}
		expect(visibility(150)).toBe(0);
		expect(visibility(2_500)).toBe(1);
		expect(partial).toBeGreaterThan(50);
		expect(worstJump).toBeLessThan(0.35);
	});
});

describe('on the cratered terrain', () => {
	const rng = createRng(5);
	const samples = Array.from({ length: 160 }, () =>
		normalize(vec(-0.3 - rng.next(), rng.next() * 2 - 1, rng.next() * 2 - 1))
	);
	const ground = (n: Vec3): number => moonHeight(n, R);
	const fraction = (elevation: number): number => {
		let shadowed = 0;
		for (const n of samples) {
			// a sun to the north of each point, `elevation` over its horizon
			let t = normalize(vec(-n.z, 0, n.x));
			if (Math.abs(n.y) > 0.9) t = vec(1, 0, 0);
			const sun = normalize(
				vec(
					Math.cos(elevation) * t.x + Math.sin(elevation) * n.x,
					Math.cos(elevation) * t.y + Math.sin(elevation) * n.y,
					Math.cos(elevation) * t.z + Math.sin(elevation) * n.z
				)
			);
			if (dot(sun, n) <= 0) continue;
			const v = terrainSunVisibility({
				groundAt: ground,
				radius: R,
				direction: n,
				height: ground(n),
				sun
			});
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(1);
			if (v < 0.5) shadowed++;
		}
		return shadowed / samples.length;
	};

	test('a low sun shades part of the craters and a high sun almost none', () => {
		const low = fraction((3 * Math.PI) / 180);
		const high = fraction((60 * Math.PI) / 180);
		console.log(
			`terrain shadow share: ${(100 * low).toFixed(0)} % at 3 deg, ${(100 * high).toFixed(0)} % at 60 deg`
		);
		expect(low).toBeGreaterThan(0.05);
		expect(low).toBeLessThan(0.7);
		expect(high).toBeLessThan(0.05);
	});

	test('fewer steps (the lower presets) shade about the same ground: within 10 points of the full march', () => {
		const share = (steps: number): number => {
			const e = (3 * Math.PI) / 180;
			let shadowed = 0;
			for (const n of samples) {
				let t = normalize(vec(-n.z, 0, n.x));
				if (Math.abs(n.y) > 0.9) t = vec(1, 0, 0);
				const sun = normalize(
					vec(
						Math.cos(e) * t.x + Math.sin(e) * n.x,
						Math.cos(e) * t.y + Math.sin(e) * n.y,
						Math.cos(e) * t.z + Math.sin(e) * n.z
					)
				);
				const v = terrainSunVisibility({
					groundAt: ground,
					radius: R,
					direction: n,
					height: ground(n),
					sun,
					steps
				});
				if (v < 0.5) shadowed++;
			}
			return shadowed / samples.length;
		};
		const full = share(SHADOW_STEPS.high);
		expect(Math.abs(share(SHADOW_STEPS.medium) - full)).toBeLessThan(0.1);
		expect(Math.abs(share(SHADOW_STEPS.low) - full)).toBeLessThan(0.1);
	});

	test('above the free sine the march is skipped and the ground really never shades there', () => {
		// the skip is exact because the ground is no steeper than MOON_MAX_SLOPE: march anyway, just below the threshold
		const e = Math.asin(SHADOW_MARCH.freeSine - 0.01);
		expect(fraction(e)).toBe(0);
		expect(MOON_MAX_SLOPE).toBeLessThanOrEqual(0.5);
		expect(SHADOW_MARCH.freeSine).toBeGreaterThan(Math.sin(Math.atan(MOON_MAX_SLOPE)));
	});

	test('the landing plain is never shaded, whatever the sun', () => {
		const n0 = vec(1, 0, 0);
		for (const deg of [1, 2, 5]) {
			const e = (deg * Math.PI) / 180;
			const sun = normalize(vec(Math.sin(e), Math.cos(e), 0));
			expect(
				terrainSunVisibility({
					groundAt: ground,
					radius: R,
					direction: n0,
					height: ground(n0),
					sun
				})
			).toBe(1);
		}
	});
});

describe('the GLSL twin carries the constants', () => {
	test('the march constants are in the shader source', () => {
		const f = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
		for (const k of [
			SHADOW_MARCH.relief,
			SHADOW_MARCH.minLength,
			SHADOW_MARCH.maxDistance,
			SHADOW_MARCH.minSine,
			SHADOW_MARCH.sunRadius,
			SHADOW_MARCH.biasAbsolute,
			SHADOW_MARCH.biasPerMetre,
			SHADOW_MARCH.minDistance,
			SHADOW_MARCH.nightSine,
			SHADOW_MARCH.freeSine
		]) {
			expect(moonShadowCommon).toContain(f(k));
		}
		expect(moonShadowCommon).toContain(`i <= ${SHADOW_MARCH.steps}`);
		expect(SHADOW_STEPS.high).toBe(SHADOW_MARCH.steps);
		expect(SHADOW_STEPS.medium).toBeLessThan(SHADOW_STEPS.high);
		expect(SHADOW_STEPS.low).toBeLessThan(SHADOW_STEPS.medium);
	});
});

describe('a ridge thinner than the step spacing (plan 263)', () => {
	// the owner's black slivers: a 24 m rim, a 4 degree sun; the even spacing of the march (about 55 m
	// at 100 m from the point) catches the rim from some points of its shadow band and misses it from
	// the next, so the band showed as thin stripes
	const along = (n: Vec3) => R * Math.atan2(n.y, n.x);
	const ridge = (x0: number, w: number, H: number) => (n: Vec3) =>
		Math.abs(along(n) - x0) < w / 2 ? H : 0;
	const elevation = (4 * Math.PI) / 180;
	const x0 = 1_000;
	const visibility = (x: number, phase: number): number => {
		const phi = x / R;
		const n0 = vec(Math.cos(phi), Math.sin(phi), 0);
		const east = vec(-Math.sin(phi), Math.cos(phi), 0);
		const sun = normalize(
			vec(
				Math.cos(elevation) * east.x + Math.sin(elevation) * n0.x,
				Math.cos(elevation) * east.y + Math.sin(elevation) * n0.y,
				0
			)
		);
		return terrainSunVisibility({
			groundAt: ridge(x0, 24, 15),
			radius: R,
			direction: n0,
			height: 0,
			sun,
			phase
		});
	};
	/** The shader's per-pixel phase: interleaved gradient noise of the pixel. */
	const phaseOf = (px: number): number => {
		const a = 0.06711056 * px + 0.00583715 * 7;
		const f = a - Math.floor(a);
		const g = 52.9829189 * f;
		return g - Math.floor(g);
	};
	const shadowLength = 15 / Math.tan(elevation);
	/** Longest run of neighbouring ground points inside the shadow the march calls lit. */
	function longestLitRun(phased: boolean): { run: number; lit: number; total: number } {
		let run = 0;
		let best = 0;
		let lit = 0;
		let total = 0;
		for (let d = 14; d < shadowLength - 5; d += 2) {
			total++;
			const v = visibility(x0 - d, phased ? phaseOf(d / 2) : 0);
			if (v > 0.5) {
				lit++;
				run++;
				best = Math.max(best, run);
			} else run = 0;
		}
		return { run: best, lit, total };
	}

	test('the even spacing misses the rim in long runs of its own shadow', () => {
		const even = longestLitRun(false);
		expect(even.run).toBeGreaterThanOrEqual(15);
	});

	test('with a phase per pixel the misses are short and scattered, and the point is still shadowed by the rim', () => {
		const even = longestLitRun(false);
		const spread = longestLitRun(true);
		expect(spread.run).toBeLessThan(even.run / 2);
		// nothing is lit that the truth leaves lit: beyond the shadow the ground stays lit
		for (let d = shadowLength + 10; d < 2_000; d += 37) {
			expect(visibility(x0 - d, phaseOf(d))).toBeGreaterThan(0.99);
		}
	});

	test('phase 0 is the even spacing, and a phase moves a sample nearer, never beyond the ray', () => {
		expect(shadowStepDistance(5, 800, 24, 0)).toBe(shadowStepDistance(5, 800));
		expect(shadowStepDistance(5, 800, 24, 0.9)).toBeLessThan(shadowStepDistance(5, 800));
		expect(shadowStepDistance(1, 800, 24, 0.999)).toBeGreaterThanOrEqual(SHADOW_MARCH.minDistance);
		expect(shadowStepDistance(24, 800, 24, 0)).toBeCloseTo(800, 9);
	});
});
