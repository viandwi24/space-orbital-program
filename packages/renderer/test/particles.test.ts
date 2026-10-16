import { describe, expect, test } from 'bun:test';
import {
	ParticleKind,
	ParticlePool,
	exhaustTrailRate,
	groundBlastRate,
	groundProximity,
	type EmissionInput,
	type ParticleSpec
} from '../src/effects/particles.ts';
import { PRESETS } from '../src/presets.ts';

const spec = (over: Partial<ParticleSpec> = {}): ParticleSpec => ({
	position: { x: 600_000, y: 0, z: 0 },
	velocity: { x: 1, y: 2, z: 3 },
	life: 2,
	size0: 1,
	size1: 5,
	kind: ParticleKind.Smoke,
	opacity: 0.5,
	heat: 0.2,
	...over
});

describe('particle pool', () => {
	test('presets: capacity and shards grow with quality', () => {
		const p = PRESETS;
		expect(p.low.smokeParticles).toBeLessThan(p.medium.smokeParticles);
		expect(p.medium.smokeParticles).toBeLessThan(p.high.smokeParticles);
		expect(p.low.debrisShards).toBeLessThanOrEqual(p.medium.debrisShards);
		expect(p.medium.debrisShards).toBeLessThan(p.high.debrisShards);
		expect([p.low.smokeParticles, p.medium.smokeParticles, p.high.smokeParticles]).toEqual([
			56, 160, 320
		]);
	});

	test('never exceeds its capacity and reports a refused particle', () => {
		for (const preset of ['low', 'medium', 'high'] as const) {
			const pool = new ParticlePool(PRESETS[preset].smokeParticles, 3);
			let refused = 0;
			for (let i = 0; i < PRESETS[preset].smokeParticles * 2; i++)
				if (!pool.emit(spec())) refused++;
			expect(pool.count).toBe(PRESETS[preset].smokeParticles);
			expect(refused).toBe(PRESETS[preset].smokeParticles);
		}
	});

	test('expired particles are freed', () => {
		const pool = new ParticlePool(8, 1);
		pool.emit(spec({ life: 1 }));
		pool.emit(spec({ life: 3 }));
		pool.step(1.5);
		expect(pool.count).toBe(1);
		pool.step(2);
		expect(pool.count).toBe(0);
	});

	test('the same seed replays to the same state after 200 steps', () => {
		const run = () => {
			const pool = new ParticlePool(64, 42);
			for (let i = 0; i < 200; i++) {
				if (i % 2 === 0)
					pool.emit(
						spec({ velocity: { x: pool.random() * 4, y: 1, z: 0 }, life: 1 + pool.random() * 3 })
					);
				pool.step(0.05);
			}
			return pool.digest();
		};
		expect(run()).toBe(run());
		const other = new ParticlePool(64, 43);
		other.emit(spec());
		expect(other.digest()).not.toBe(run());
	});

	test('smoke rises along the local vertical', () => {
		const pool = new ParticlePool(2, 1);
		pool.emit(spec({ velocity: { x: 0, y: 0, z: 0 } }));
		pool.step(1);
		expect(pool.px[0]!).toBeGreaterThan(600_000);
	});
});

describe('emission', () => {
	const input = (over: Partial<EmissionInput> = {}): EmissionInput => ({
		throttle: 1,
		nozzleAltitude: 1,
		plumeLength: 6,
		ambientPressure: 101_325,
		surfacePressure: 101_325,
		capacity: 320,
		...over
	});

	test('ground blast is positive at 1 m and zero at 6 plume lengths', () => {
		expect(groundBlastRate(input())).toBeGreaterThan(0);
		expect(groundBlastRate(input({ nozzleAltitude: 36 }))).toBe(0);
		expect(groundProximity(0, 6)).toBe(1);
	});

	test('no dust in vacuum, none without throttle', () => {
		expect(groundBlastRate(input({ ambientPressure: 0 }))).toBe(0);
		expect(exhaustTrailRate(input({ ambientPressure: 0, nozzleAltitude: 500 }))).toBe(0);
		expect(groundBlastRate(input({ throttle: 0 }))).toBe(0);
	});

	test('rates scale with the preset capacity and the trail takes over away from the ground', () => {
		expect(groundBlastRate(input({ capacity: 64 }))).toBeLessThan(
			groundBlastRate(input({ capacity: 480 }))
		);
		expect(exhaustTrailRate(input({ nozzleAltitude: 1 }))).toBe(0);
		expect(exhaustTrailRate(input({ nozzleAltitude: 400 }))).toBeGreaterThan(0);
	});
});
