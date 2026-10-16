/** Plan 049 / ADR 0058: dust, plume light and no smoke on an airless body; the light there; no GPU. */
import { describe, expect, test } from 'bun:test';
import { MOON_SHAPE, type BodyId, type EntityId, type PartId, type Snapshot } from '@orbital/core';
import { Mesh } from 'three';
import { REGOLITH_ALBEDO, SKY_FLOOR, airlessLight } from '../src/airless-light.ts';
import {
	ParticleKind,
	ParticlePool,
	groundBlastRate,
	vacuumDustRate,
	type EmissionInput
} from '../src/effects/particles.ts';
import { Environment } from '../src/environment.ts';
import { PRESETS } from '../src/presets.ts';
import { SceneModel } from '../src/scene.ts';
import { stockMaps } from './stock-fixture.ts';

const HOME = 'stock.home' as BodyId;
const MOON = 'stock.cinder' as BodyId;
const RADIUS = 190_000;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const maps = stockMaps();
const engineOn = { 'stock.engine': { ignited: true, throttle: 1, flameout: false } };
const G = 6.6743e-11;
const MASS = 8.65e20; // stock.cinder: mu 5.776e10, g 1.6 m/s2 at the surface

const config = (preset: 'low' | 'medium' | 'high' = 'high') => ({
	bodies: [
		{
			id: HOME,
			radius: 600_000,
			mass: 5.9e24,
			atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
		},
		{
			id: MOON,
			radius: RADIUS,
			mass: MASS,
			parent: HOME,
			orbit: { a: 11.8e6, e: 0, i: 0, raan: 0, argp: 0, m0: 1, epoch: 0 }
		}
	],
	partShapes: maps.shapes,
	partVisuals: maps.visuals,
	partAttach: maps.attach,
	preset
});

const part = (n: number, definition: string, y: number, modules: Record<string, unknown> = {}) => ({
	id: n as EntityId,
	definition: definition as PartId,
	position: { x: 0, y, z: 0 },
	orientation: q0,
	modules
});

/** A lander standing `height` m above the plain of the moon, engine firing. */
const snap = (t: number, height: number): Snapshot => ({
	t,
	bodies: [
		{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 },
		{ id: MOON, position: { x: 6_372_971, y: 0, z: -9_931_024 }, rotation: q0 }
	],
	vessels: [
		{
			id: 1 as EntityId,
			mode: 'flight',
			soi: MOON,
			position: { x: RADIUS + MOON_SHAPE.base + height, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: 0 },
			orientation: q0,
			parts: [
				part(1, 'stock.command-pod', 3.1),
				part(2, 'stock.tank-small', 1.6),
				part(3, 'stock.decoupler', 0.5),
				part(4, 'stock.engine-lv', -0.2, engineOn)
			]
		}
	]
});

describe('dust of an airless body', () => {
	test('a plume near the moon throws dust and light, and not a single smoke particle on the first body', () => {
		const m = new SceneModel(config());
		m.sync(snap(0, 3));
		for (let i = 0; i < 120; i++) m.prepareFrame(1 / 60, true);
		expect(m.effects.particleCount).toBe(0);
		expect(m.effects.vacuumParticleCount).toBeGreaterThan(10);
		expect(m.effects.vacuumParticleCount).toBeLessThanOrEqual(PRESETS.high.smokeParticles / 2);
		const glow = m.effects.root.getObjectByName('ground-glow')!;
		expect(glow.children.some((c) => c.visible)).toBe(true);
		const fx = m.effects.root.children.filter((c): c is Mesh => c instanceof Mesh);
		expect(fx.length).toBeGreaterThan(0);
		m.dispose();
	});

	test('high above the ground there is no dust and no light', () => {
		const m = new SceneModel(config());
		m.sync(snap(0, 5_000));
		for (let i = 0; i < 120; i++) m.prepareFrame(1 / 60, true);
		expect(m.effects.vacuumParticleCount).toBe(0);
		const glow = m.effects.root.getObjectByName('ground-glow')!;
		expect(glow.children.some((c) => c.visible)).toBe(false);
		m.dispose();
	});

	test('the dust pool stays inside its share of the preset on low', () => {
		const m = new SceneModel(config('low'));
		m.sync(snap(0, 2));
		for (let i = 0; i < 600; i++) m.prepareFrame(1 / 60, true);
		expect(m.effects.vacuumParticleCount).toBeLessThanOrEqual(PRESETS.low.smokeParticles / 2);
		expect(m.effects.vacuumParticleCount).toBeGreaterThan(0);
		m.dispose();
	});

	const input: EmissionInput = {
		throttle: 1,
		nozzleAltitude: 2,
		plumeLength: 8,
		ambientPressure: 0,
		surfacePressure: 0,
		capacity: 320
	};

	test('in vacuum the air-borne blast is zero and the dust rate is not', () => {
		expect(groundBlastRate(input)).toBe(0);
		expect(vacuumDustRate(input)).toBeGreaterThan(50);
		expect(vacuumDustRate({ ...input, nozzleAltitude: 400 })).toBe(0);
		expect(vacuumDustRate({ ...input, throttle: 0 })).toBe(0);
	});

	test('ballistic particles keep their speed and fall back along the pull', () => {
		const pool = new ParticlePool(4, 1);
		const mu = G * MASS;
		const g = mu / (RADIUS * RADIUS);
		pool.emit({
			position: { x: RADIUS, y: 0, z: 0 },
			velocity: { x: 0, y: 20, z: 3 },
			life: 10,
			size0: 1,
			size1: 2,
			kind: ParticleKind.Dust,
			opacity: 1,
			heat: 0
		});
		for (let i = 0; i < 100; i++) pool.step(0.01, undefined, { mu });
		// 1 s: no drag on the tangential speed, the radial speed fell by about g
		expect(pool.vy[0]).toBeCloseTo(20, 1);
		expect(pool.vx[0]).toBeCloseTo(-g * 1, 1);
		expect(pool.py[0]).toBeCloseTo(20, 0);
	});
});

describe('light on an airless body (ADR 0058)', () => {
	test('the sun fades at the horizon and the ground bounce follows the sun', () => {
		const noon = airlessLight(60, 12);
		const low = airlessLight(5, 12);
		const night = airlessLight(-20, 12);
		expect(noon.sun).toBe(1);
		expect(night.sun).toBe(0);
		expect(noon.ground[0]).toBeGreaterThan(low.ground[0]);
		expect(low.ground[0]).toBeGreaterThan(night.ground[0]);
		// a fraction of the sunlit-white radiance sun / PI, by the albedo and the sine of the elevation
		expect(noon.ground[1]).toBeGreaterThan(
			(REGOLITH_ALBEDO * 12 * Math.sin(Math.PI / 3)) / Math.PI
		);
	});

	test('the sky is never black: the shadow side keeps a floor, a few per cent of the sunlit side', () => {
		const night = airlessLight(-30, 12);
		const floor = (SKY_FLOOR * 12) / Math.PI;
		expect(night.sky[2]).toBeCloseTo(floor, 6);
		expect(night.sky[0]).toBeGreaterThan(0);
		expect(night.sky[0]).toBeLessThan(0.05 * (12 / Math.PI));
	});

	test('the environment of the first body is unchanged when no airless body is asked for', () => {
		const env = new Environment({
			body: {
				id: HOME,
				radius: 600_000,
				atmosphere: { scaleHeight: 5_600, surfacePressure: 101_325, height: 70_000 }
			},
			preset: 'medium',
			site: { latitude: 0, longitude: 0 }
		});
		expect(env.state.airless).toBeNull();
		env.dispose();
	});

	test('a vessel in the moon sphere puts the environment in the airless state with a white sun', () => {
		const m = new SceneModel(config());
		m.sync(snap(0, 3));
		m.prepareFrame(1 / 60, true);
		expect(m.environment.state.airless).not.toBeNull();
		expect(m.environment.state.envKey).toContain('airless');
		const c = m.environment.sunLight.color;
		expect(c.r).toBe(c.g);
		expect(c.g).toBe(c.b);
		m.dispose();
	});
});
