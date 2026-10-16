/** Plan 033 / ADR 0047: dust colour, wind, plume ground light, plasma colour. */
import { describe, expect, test } from 'bun:test';
import { GroundGlow } from '../src/effects/ground-glow.ts';
import {
	dustColour,
	ionisationColour,
	isWater,
	plumeGroundLight,
	windAt
} from '../src/effects/look.ts';
import { ParticleKind, ParticlePool } from '../src/effects/particles.ts';

describe('dustColour', () => {
	test('white spray over water, sand on the flats, grey rock high up, snow above', () => {
		expect(isWater(0)).toBe(true);
		expect(isWater(-30)).toBe(true);
		expect(isWater(12)).toBe(false);
		const spray = dustColour(-5);
		expect(Math.min(...spray)).toBeGreaterThan(0.9);
		const sand = dustColour(6);
		expect(sand[0]).toBeGreaterThan(sand[2]); // warm
		const rock = dustColour(900);
		expect(Math.abs(rock[0] - rock[2])).toBeLessThan(0.08); // nearly neutral
		const snow = dustColour(3_000);
		expect(Math.min(...snow)).toBeGreaterThan(0.8);
	});

	test('continuous with height', () => {
		let last = dustColour(1);
		for (let h = 2; h < 3_000; h += 7) {
			const c = dustColour(h);
			for (let i = 0; i < 3; i++) expect(Math.abs(c[i]! - last[i]!)).toBeLessThan(0.02);
			last = c;
		}
	});
});

describe('windAt', () => {
	test('a breeze at the ground that stiffens with height; deterministic', () => {
		expect(windAt(0, 0).speed).toBeGreaterThan(1);
		expect(windAt(3_000, 0).speed).toBeGreaterThan(windAt(0, 0).speed + 5);
		expect(windAt(500, 12.5)).toEqual(windAt(500, 12.5));
		expect(windAt(-5, 0).speed).toBe(windAt(0, 0).speed);
	});
});

describe('plumeGroundLight', () => {
	test('strongest at the ground, falls to zero at six plume lengths, scales with throttle', () => {
		const l = 7;
		const at0 = plumeGroundLight(0, 1, l, 0.46);
		const at10 = plumeGroundLight(10, 1, l, 0.46);
		const at40 = plumeGroundLight(40, 1, l, 0.46);
		expect(at0.intensity).toBe(1);
		expect(at10.intensity).toBeLessThan(at0.intensity);
		expect(at40.intensity).toBeLessThan(at10.intensity);
		expect(plumeGroundLight(6 * l, 1, l, 0.46).intensity).toBe(0);
		expect(plumeGroundLight(0, 0.5, l, 0.46).intensity).toBeCloseTo(0.5, 12);
		expect(plumeGroundLight(0, 0, l, 0.46).intensity).toBe(0);
	});

	test('the lit disc widens as the nozzle climbs', () => {
		expect(plumeGroundLight(20, 1, 7, 0.46).radius).toBeGreaterThan(
			plumeGroundLight(0, 1, 7, 0.46).radius
		);
	});

	test('the glow discs show only what they are given', () => {
		const glow = new GroundGlow(2);
		glow.update([
			{ position: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, radius: 5, intensity: 0.8 },
			{ position: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, radius: 5, intensity: 0 }
		]);
		expect(glow.visibleCount).toBe(1);
		glow.update([]);
		expect(glow.visibleCount).toBe(0);
		glow.dispose();
	});
});

describe('ionisationColour', () => {
	test('orange when slow, pink-white at orbital return speed, blue above 10 km/s', () => {
		const slow = ionisationColour(2_000);
		expect(slow[0]).toBeGreaterThan(slow[2] * 4);
		const orbital = ionisationColour(7_800);
		expect(orbital[2]).toBeGreaterThan(slow[2]);
		const fast = ionisationColour(12_000);
		expect(fast[2]).toBeGreaterThan(fast[0]);
	});

	test('continuous in speed', () => {
		let last = ionisationColour(0);
		for (let v = 100; v < 14_000; v += 100) {
			const c = ionisationColour(v);
			for (let i = 0; i < 3; i++) expect(Math.abs(c[i]! - last[i]!)).toBeLessThan(0.08);
			last = c;
		}
	});
});

describe('particles in the wind', () => {
	const spec = (x: number) => ({
		position: { x, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		life: 100,
		size0: 1,
		size1: 2,
		kind: ParticleKind.Smoke,
		opacity: 1,
		heat: 0
	});

	test('smoke drifts with the wind and takes its velocity; without wind it stays', () => {
		const calm = new ParticlePool(2, 1);
		const windy = new ParticlePool(2, 1);
		calm.emit(spec(1000));
		windy.emit(spec(1000));
		for (let i = 0; i < 100; i++) {
			calm.step(0.1);
			windy.step(0.1, (_x, _y, _z, out) => {
				out[0] = 0;
				out[1] = 0;
				out[2] = 5;
			});
		}
		expect(calm.pz[0]).toBeCloseTo(0, 6);
		expect(windy.vz[0]).toBeGreaterThan(4.5);
		expect(windy.pz[0]).toBeGreaterThan(30);
	});

	test('the dust tint is stored with the particle and survives removal of another', () => {
		const pool = new ParticlePool(3, 1);
		pool.emit({ ...spec(0), life: 0.1, tint: [0.1, 0.2, 0.3] });
		pool.emit({ ...spec(1), tint: [0.5, 0.6, 0.7] });
		pool.step(0.2); // the first expires, the last moves into its place
		expect(pool.count).toBe(1);
		expect(Array.from(pool.tint.slice(0, 3))).toEqual([
			expect.closeTo(0.5, 6),
			expect.closeTo(0.6, 6),
			expect.closeTo(0.7, 6)
		]);
	});
});
