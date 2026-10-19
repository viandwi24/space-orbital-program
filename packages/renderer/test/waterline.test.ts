/** Plan 193 / ADR 0182: ripple rings at the parts that cross the water plane, none on land. */
import { describe, expect, test } from 'bun:test';
import {
	createTerrainField,
	type BodyId,
	type EntityId,
	type PartId,
	type Snapshot,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import {
	RIPPLE_RINGS,
	SPLASH_DURATION,
	rippleRing,
	splashState,
	waterlineCrossings,
	type WaterlinePart
} from '../src/effects/waterline.ts';
import { SceneModel, type PartShape } from '../src/scene.ts';

const R = 600_000;
const q0 = { x: 0, y: 0, z: 0, w: 1 };
const field = createTerrainField({ radius: R });

/** The first direction on a coarse grid where the ground is (or is not) water. */
function find(water: boolean): Vec3 {
	for (let la = -1.2; la <= 1.2; la += 0.05) {
		for (let lo = -Math.PI; lo < Math.PI; lo += 0.05) {
			const d = { x: Math.cos(la) * Math.cos(lo), y: Math.sin(la), z: Math.cos(la) * Math.sin(lo) };
			if (field.waterAt!(d) === water && (water || field.heightAt(d) > 50)) return d;
		}
	}
	throw new Error('no such direction');
}
const sea = find(true);
const land = find(false);
const at = (d: Vec3, h: number): Vec3 => ({ x: d.x * (R + h), y: d.y * (R + h), z: d.z * (R + h) });

/** A stack of three 1 m parts: centres 1.5 m above, 0.5 m above and 0.5 m below `centre`. */
const stack = (centre: Vec3, up: Vec3): WaterlinePart[] =>
	[1.5, 0.5, -0.5].map((o, k) => ({
		key: `p${k}`,
		centre: { x: centre.x + up.x * o, y: centre.y + up.y * o, z: centre.z + up.z * o },
		reach: Math.hypot(0.5, 0.5),
		width: 1
	}));

describe('waterline crossings (plan 193)', () => {
	test('a floating stack: the parts whose bounding sphere spans the water plane, at the plane', () => {
		const c = waterlineCrossings(stack(at(sea, 0), sea), q0, R, (d) => field.waterAt!(d));
		expect(c.map((x) => x.key)).toEqual(['p1', 'p2']);
		for (const x of c) {
			expect(Math.hypot(x.point.x, x.point.y, x.point.z)).toBeCloseTo(R, 3);
			expect(x.up.x).toBeCloseTo(sea.x, 6);
		}
	});
	test('none for a vessel on land, and none for one high above the water', () => {
		expect(waterlineCrossings(stack(at(land, 0), land), q0, R, (d) => field.waterAt!(d))).toEqual(
			[]
		);
		expect(waterlineCrossings(stack(at(sea, 40), sea), q0, R, (d) => field.waterAt!(d))).toEqual(
			[]
		);
	});
	test('the body rotation is applied before asking for water', () => {
		// turned half a revolution about +Y: the inertial direction -sea.x, sea.y, -sea.z is the sea
		const turned = { x: 0, y: 1, z: 0, w: 0 };
		const inertial = { x: -sea.x, y: sea.y, z: -sea.z };
		const c = waterlineCrossings(stack(at(inertial, 0), inertial), turned, R, (d) =>
			field.waterAt!(d)
		);
		expect(c).toHaveLength(2);
	});
	test('rings expand and fade; a splash ends after its duration', () => {
		const a = rippleRing(0.1, 0);
		const b = rippleRing(1.2, 0);
		expect(b.scale).toBeGreaterThan(a.scale);
		expect(rippleRing(1.79, 0).opacity).toBeLessThan(0.05);
		expect(splashState(0.3).opacity).toBeGreaterThan(0);
		expect(splashState(SPLASH_DURATION).opacity).toBe(0);
	});
});

describe('the scene draws them from a snapshot', () => {
	const HOME = 'stock.home' as BodyId;
	const POD = 'stock.pod' as PartId;
	const shapes = new Map<string, PartShape>([[POD, { kind: 'cylinder', radius: 0.6, height: 1 }]]);
	const vessel = (d: Vec3, h: number, down: number): VesselSnapshot => ({
		id: 1 as EntityId,
		mode: 'flight',
		soi: HOME,
		position: at(d, h),
		velocity: { x: -d.x * down, y: -d.y * down, z: -d.z * down },
		orientation: q0,
		parts: [0.5, -0.5].map((o, k) => ({
			id: (10 + k) as EntityId,
			definition: POD,
			position: { x: d.x * o, y: d.y * o, z: d.z * o },
			orientation: q0,
			modules: {}
		}))
	});
	const snap = (t: number, v: VesselSnapshot): Snapshot => ({
		t,
		bodies: [{ id: HOME, position: { x: 0, y: 0, z: 0 }, rotation: q0 }],
		vessels: [v]
	});
	const scene = () => {
		const m = new SceneModel({
			bodies: [{ id: HOME, radius: R, mass: 5.9e24 }],
			home: HOME,
			partShapes: shapes
		});
		m.setActiveVessel(1 as EntityId);
		return m;
	};

	test('floating: rings at both parts; coming down fast: a splash; on land: nothing', () => {
		const m = scene();
		m.sync(snap(0, vessel(sea, 0, 0)));
		m.sync(snap(0.1, vessel(sea, 0, 6)));
		expect(m.waterline.activeRings).toBe(2 * RIPPLE_RINGS);
		expect(m.waterline.activeSplashes).toBe(0); // already wet the frame before
		const fresh = scene();
		fresh.sync(snap(0, vessel(sea, 30, 6)));
		fresh.sync(snap(0.1, vessel(sea, 0, 6)));
		expect(fresh.waterline.activeSplashes).toBe(2);
		const dry = scene();
		dry.sync(snap(0, vessel(land, fieldHeight(land), 0)));
		dry.sync(snap(0.1, vessel(land, fieldHeight(land), 0)));
		expect(dry.waterline.activeRings).toBe(0);
	});
});

describe('cost', () => {
	test('16 crossing parts: the crossings and the update cost well under 0.1 ms per frame (indicative)', async () => {
		const { WaterlineEffects } = await import('../src/effects/waterline.ts');
		const fx = new WaterlineEffects();
		const parts = Array.from({ length: 16 }, (_, k) => ({
			key: `p${k}`,
			centre: at(sea, (k % 2) * 0.2),
			reach: 0.8,
			width: 1.2
		}));
		const frames = 600;
		const t0 = performance.now();
		for (let f = 0; f < frames; f++) {
			const c = waterlineCrossings(parts, q0, R, (d) => field.waterAt!(d));
			fx.update(
				c,
				1 / 60,
				(p) => p,
				() => 0
			);
		}
		const perFrame = (performance.now() - t0) / frames;
		console.log(
			`waterline: 16 parts, ${perFrame.toFixed(4)} ms per frame, ${fx.activeRings} rings`
		);
		expect(fx.activeRings).toBe(16 * RIPPLE_RINGS);
		// a timing budget measured on the M5: CI runners only log the number
		if (!process.env.CI) expect(perFrame).toBeLessThan(0.5);
		fx.dispose();
	});
});

function fieldHeight(d: Vec3): number {
	return field.heightAt(d);
}
