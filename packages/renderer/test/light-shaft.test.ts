import { describe, expect, test } from 'bun:test';
import { atmosphereFor, mieRadiance, luminance } from '../src/atmosphere-model.ts';
import { CLOUD_ALTITUDE } from '../src/cloud-model.ts';
import { CLOUD_THICKNESS } from '../src/cloud-volume.ts';
import {
	CLOUD_MAP_H,
	CLOUD_MAP_W,
	SHAFT,
	cloudMapDirection,
	cloudMapUV,
	applyShaftLoss,
	shaftDeficit,
	shaftDistanceWeight,
	shaftHeightWeight,
	shaftOcclusion,
	shaftStrength
} from '../src/light-shaft.ts';
import { DEG } from '../src/vec.ts';

const atm = atmosphereFor(600_000, 70_000);

/** The Mie radiance the deficit is measured against: the same units as `shaftDeficit` times the boost and the sun. */
const radiance = (d: [number, number, number]): number =>
	luminance([
		d[0] * atm.mieBoost * atm.sunIrradiance,
		d[1] * atm.mieBoost * atm.sunIrradiance,
		d[2] * atm.mieBoost * atm.sunIrradiance
	]);

describe('shaft weights (plan 054)', () => {
	test('occlusion: clear sky loses nothing, thick cloud loses all but the leak, thicker coverage and a lower sun lose more', () => {
		expect(shaftOcclusion(0, 0.3)).toBe(0);
		expect(shaftOcclusion(1, 0.3)).toBeGreaterThan(0.9 * (1 - SHAFT.leak));
		expect(shaftOcclusion(1, 0.3)).toBeLessThanOrEqual(1 - SHAFT.leak);
		let last = 0;
		for (const c of [0.05, 0.2, 0.5, 1]) {
			const o = shaftOcclusion(c, 0.5);
			expect(o).toBeGreaterThan(last);
			last = o;
		}
		expect(shaftOcclusion(0.3, 0.15)).toBeGreaterThan(shaftOcclusion(0.3, 0.9));
		// a grazing sun is floored: 0.01 and `muMin` give the same occlusion
		expect(shaftOcclusion(0.3, 0.01)).toBe(shaftOcclusion(0.3, SHAFT.muMin));
		// tau 2 straight up at full cover: 1 - exp(-2) of the non-leaking share
		expect(shaftOcclusion(1, 1)).toBeCloseTo((1 - SHAFT.leak) * (1 - Math.exp(-2)), 12);
	});

	test('height weight: 1 under the base, 0 over the top, monotone', () => {
		expect(shaftHeightWeight(0)).toBe(1);
		expect(shaftHeightWeight(CLOUD_ALTITUDE)).toBe(1);
		expect(shaftHeightWeight(CLOUD_ALTITUDE + CLOUD_THICKNESS)).toBe(0);
		expect(shaftHeightWeight(CLOUD_ALTITUDE + CLOUD_THICKNESS / 2)).toBeCloseTo(0.5, 12);
		expect(shaftHeightWeight(20_000)).toBe(0);
	});

	test('distance weight: full to 45 km, none from 120 km', () => {
		expect(shaftDistanceWeight(10_000)).toBe(1);
		expect(shaftDistanceWeight(SHAFT.fadeFrom)).toBe(1);
		expect(shaftDistanceWeight(SHAFT.fadeTo)).toBe(0);
		expect(shaftDistanceWeight(80_000)).toBeLessThan(1);
	});

	test('strength: full at a low sun on the ground, off above 55 degrees, under the horizon and from orbit', () => {
		expect(shaftStrength(10 * DEG, 0)).toBe(1);
		expect(shaftStrength(25 * DEG, 0)).toBe(1);
		expect(shaftStrength(55 * DEG, 0)).toBe(0);
		expect(shaftStrength(90 * DEG, 0)).toBe(0);
		expect(shaftStrength(-2 * DEG, 0)).toBe(0);
		expect(shaftStrength(-10 * DEG, 0)).toBe(0);
		expect(shaftStrength(10 * DEG, 8_000)).toBe(1);
		expect(shaftStrength(10 * DEG, 15_000)).toBe(0);
		let last = 1;
		for (let e = 25; e <= 55; e += 3) {
			const s = shaftStrength(e * DEG, 0);
			expect(s).toBeLessThanOrEqual(last);
			last = s;
		}
		// smooth through the horizon
		expect(shaftStrength(-0.5 * DEG, 0)).toBeGreaterThan(0);
		expect(shaftStrength(-0.5 * DEG, 0)).toBeLessThan(1);
	});
});

describe('shaft deficit (plan 054)', () => {
	const view = 6 * DEG;
	const sun = 8 * DEG;
	const az = 0.15;

	test('no occlusion removes nothing; full occlusion everywhere removes all of the Mie in-scatter over the range', () => {
		expect(shaftDeficit(atm, 0, view, sun, az, () => 0, 16)).toEqual([0, 0, 0]);
		const full = shaftDeficit(atm, 0, view, sun, az, () => 1, 64);
		const mie = mieRadiance(atm, 0, view, sun, az, SHAFT.range);
		expect(radiance(full) / luminance(mie)).toBeGreaterThan(0.9);
		expect(radiance(full) / luminance(mie)).toBeLessThan(1.1);
	});

	test('proportional to the occlusion and additive over distance', () => {
		const half = shaftDeficit(atm, 0, view, sun, az, () => 0.5, 32);
		const full = shaftDeficit(atm, 0, view, sun, az, () => 1, 32);
		for (let c = 0; c < 3; c++) expect(half[c]! / full[c]!).toBeCloseTo(0.5, 12);
		const near = shaftDeficit(atm, 0, view, sun, az, (s) => (s < 10_000 ? 1 : 0), 64);
		const far = shaftDeficit(atm, 0, view, sun, az, (s) => (s >= 10_000 ? 1 : 0), 64);
		const all = shaftDeficit(atm, 0, view, sun, az, () => 1, 64);
		for (let c = 0; c < 3; c++) expect(near[c]! + far[c]!).toBeCloseTo(all[c]!, 12);
		expect(radiance(near)).toBeGreaterThan(0.05 * radiance(all));
		expect(radiance(far)).toBeGreaterThan(0.05 * radiance(all));
	});

	test('twenty steps agree with 128 within 12 percent for a patchy shadow (the shader runs 6 to 10 with jitter)', () => {
		const patchy = (s: number): number => (Math.floor(s / 2_500) % 2 === 0 ? 0.9 : 0);
		const fine = radiance(shaftDeficit(atm, 0, view, sun, az, patchy, 128));
		const coarse = radiance(shaftDeficit(atm, 0, view, sun, az, patchy, 20));
		expect(Math.abs(coarse / fine - 1)).toBeLessThan(0.12);
	});

	test('away from the sun there is little to remove: the Mie lobe makes the deficit at 90 degrees under 2 percent of the one toward the sun', () => {
		const toward = radiance(shaftDeficit(atm, 0, view, sun, 0, () => 1, 32));
		const side = radiance(shaftDeficit(atm, 0, view, sun, 90 * DEG, () => 1, 32));
		expect(side).toBeLessThan(0.02 * toward);
	});

	test('the deficit is the colour of the sun through the air: redder with the sun lower', () => {
		const high = shaftDeficit(atm, 0, view, 25 * DEG, az, () => 1, 32);
		const low = shaftDeficit(atm, 0, view, 3 * DEG, az, () => 1, 32);
		expect(low[0] / low[2]).toBeGreaterThan(high[0] / high[2]);
	});

	test('a ray that goes into the ground stops at it; rays that miss the air return 0', () => {
		const down = shaftDeficit(atm, 1_000, -0.2, sun, az, () => 1, 32);
		const longer = shaftDeficit(atm, 1_000, -0.2, sun, az, () => 1, 32, 1_000_000);
		expect(longer).toEqual(down);
		expect(shaftDeficit(atm, 200_000, 0.3, sun, az, () => 1, 32)).toEqual([0, 0, 0]);
	});
});

describe('applying the loss (plan 054)', () => {
	const ins = { a: 0.2, b: 0.5, all: 1 };

	test('no loss changes nothing; a small loss is subtracted segment by segment', () => {
		expect(applyShaftLoss(ins, { a: 0, b: 0, all: 0 }, 5)).toEqual(ins);
		const out = applyShaftLoss(ins, { a: 0.01, b: 0.03, all: 0.06 }, 1);
		expect(out.a).toBeCloseTo(0.19, 12);
		expect(out.b).toBeCloseTo(0.47, 12);
		expect(out.all).toBeCloseTo(0.94, 12);
	});

	test('a huge loss leaves at least 1 - maxShare of every stretch, and the snapshots stay ordered', () => {
		for (const k of [1, 10, 1e6]) {
			const out = applyShaftLoss(ins, { a: 1, b: 2, all: 3 }, k);
			expect(out.a).toBeCloseTo(ins.a * (1 - SHAFT.maxShare), 12);
			expect(out.b - out.a).toBeCloseTo((ins.b - ins.a) * (1 - SHAFT.maxShare), 12);
			expect(out.all - out.b).toBeCloseTo((ins.all - ins.b) * (1 - SHAFT.maxShare), 12);
			expect(out.a).toBeLessThanOrEqual(out.b);
			expect(out.b).toBeLessThanOrEqual(out.all);
		}
	});

	test('a loss only in front of the first layer does not touch the rest of the path', () => {
		const out = applyShaftLoss(ins, { a: 0.05, b: 0.05, all: 0.05 }, 1);
		expect(out.b - out.a).toBeCloseTo(ins.b - ins.a, 12);
		expect(out.all - out.b).toBeCloseTo(ins.all - ins.b, 12);
		expect(out.a).toBeCloseTo(0.15, 12);
	});
});

describe('cloud map addressing (plan 054)', () => {
	test('a texel centre maps to a unit direction that maps back to the same texel centre', () => {
		for (const [i, j] of [
			[0, 0],
			[10, 3],
			[512, 256],
			[CLOUD_MAP_W - 1, CLOUD_MAP_H - 1],
			[700, 100],
			[123, 400]
		] as const) {
			const u = (i + 0.5) / CLOUD_MAP_W;
			const v = (j + 0.5) / CLOUD_MAP_H;
			const [x, y, z] = cloudMapDirection(u, v);
			expect(Math.hypot(x, y, z)).toBeCloseTo(1, 12);
			const [u2, v2] = cloudMapUV(x, y, z);
			expect(u2).toBeCloseTo(u, 9);
			expect(v2).toBeCloseTo(v, 9);
		}
	});

	test('the poles are the top and bottom rows, longitude 0 is the middle column, the seam wraps', () => {
		expect(cloudMapUV(0, 1, 0)[1]).toBeCloseTo(1, 12);
		expect(cloudMapUV(0, -1, 0)[1]).toBeCloseTo(0, 12);
		expect(cloudMapUV(1, 0, 0)).toEqual([0.5, 0.5]);
		const [uPlus] = cloudMapUV(-1, 0, 1e-9);
		const [uMinus] = cloudMapUV(-1, 0, -1e-9);
		expect(uPlus).toBeCloseTo(1, 6);
		expect(uMinus).toBeCloseTo(0, 6);
	});

	test('the map has a texel finer than the shadows it serves (under 4 km at the equator of the 600 km home body)', () => {
		expect((2 * Math.PI * 600_000) / CLOUD_MAP_W).toBeLessThan(4_000);
	});
});
