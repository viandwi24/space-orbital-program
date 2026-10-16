import { describe, expect, test } from 'bun:test';
import {
	GRAVITATIONAL_CONSTANT,
	createTerrainField,
	type EntityId,
	type TerrainField,
	type Quat,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { dot, length, scale, sub } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { definePlugin, defineBody } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { groundRelativeVelocity, rotateBy } from './helpers/ground.ts';
import { RADIUS, altitude } from './helpers/measure.ts';
import { lander, newSim, probe, rapier, stack, twoStage } from './helpers/vessels.ts';

/**
 * Plan 031, ADR 0043: the ground follows the terrain. Synthetic terrains (a ramp, a plateau, a
 * hill) stand in for the procedural one so the expected positions are known exactly.
 */
type TestSim = Awaited<ReturnType<typeof newSim>>;
const DEG = Math.PI / 180;
const OMEGA = (2 * Math.PI) / 21_600;
const run = (sim: TestSim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const only = (sim: TestSim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
const pod = () => stack('Pod', ['stock.command-pod'], []);

/** A ramp rising to the east from longitude 0 (body-fixed), `degrees` steep, capped at 4 500 m. */
function ramp(degrees: number): TerrainField {
	const slope = Math.tan(degrees * DEG);
	return {
		maxHeight: 4_500,
		heightAt(n) {
			const lon = Math.atan2(-n.z, n.x);
			const lat = Math.asin(Math.max(-1, Math.min(1, n.y)));
			return Math.min(4_500, Math.max(0, slope * RADIUS * lon * Math.cos(lat)));
		}
	};
}

/** The same terrain everywhere at `height` m. */
const plateau = (height: number): TerrainField => ({ maxHeight: height, heightAt: () => height });

/** An 800 m hill, 2 km wide (Gaussian), peak at body-fixed longitude `metres` / R east of the origin. */
function hill(metres: number): TerrainField {
	return {
		maxHeight: 800,
		heightAt(n) {
			const lon = Math.atan2(-n.z, n.x);
			const lat = Math.asin(Math.max(-1, Math.min(1, n.y)));
			const east = (lon - metres / RADIUS) * RADIUS;
			const north = lat * RADIUS;
			return 800 * Math.exp(-(east * east + north * north) / (2 * 2_000 * 2_000));
		}
	};
}

/** Surface placement `metres` east of longitude 0, latitude 0. */
const eastOf = (metres: number) => ({
	kind: 'surface' as const,
	latitude: 0,
	longitude: metres / RADIUS
});

/** Unit normal of the ramp's surface at longitude 0 (BCI at the time of the last snapshot). */
function rampNormal(sim: TestSim, degrees: number): Vec3 {
	const a = degrees * DEG;
	return rotateBy(sim.snapshot().bodies[0]!.rotation, { x: Math.cos(a), y: 0, z: Math.sin(a) });
}

/** Angle between the vessel's nose and `normal`, degrees. */
function tiltFrom(v: VesselSnapshot, normal: Vec3): number {
	const nose = rotateBy(v.orientation, { x: 0, y: 1, z: 0 });
	return (Math.acos(Math.min(1, Math.max(-1, dot(nose, normal)))) * 180) / Math.PI;
}

/** Distance, m, of the root part from the ramp plane through the ground point on its radial. */
function rootAbovePlane(v: VesselSnapshot, normal: Vec3): number {
	const p = v.position;
	const ground = scale(p, (RADIUS + v.terrainHeight!) / length(p));
	return dot(sub(p, ground), normal);
}

/** Height of the root part above flat ground when the vessel stands there (no terrain). */
async function flatRootHeight(design = pod(), setup?: (sim: TestSim, id: EntityId) => void) {
	const sim = await newSim();
	const loaded = sim.dispatch({ type: 'load-vessel', design });
	if (!loaded.ok) throw new Error(loaded.reason);
	setup?.(sim, loaded.vessel!);
	run(sim, 3);
	const h = altitude(only(sim, loaded.vessel!).position);
	sim.dispose();
	return h;
}

async function standOn(terrain: TerrainField, design = pod(), metres = 300) {
	const sim = await newSim({ terrain });
	const loaded = sim.dispatch({ type: 'load-vessel', design, placement: eastOf(metres) });
	if (!loaded.ok) throw new Error(loaded.reason);
	return { sim, id: loaded.vessel! };
}

describe('standing on a slope (ADR 0043)', () => {
	test('a command pod on a 30 degree ramp rests with its flat bottom on the ground plane', async () => {
		const flat = await flatRootHeight();
		const { sim, id } = await standOn(ramp(30));
		const hurt: unknown[] = [];
		sim.events.on('part:damaged', (e) => hurt.push(e));
		run(sim, 10);
		const v = only(sim, id);
		const n = rampNormal(sim, 30);
		expect(hurt).toEqual([]);
		expect(length(groundRelativeVelocity(v))).toBeLessThan(0.05);
		expect(tiltFrom(v, n)).toBeLessThan(1);
		expect(Math.abs(rootAbovePlane(v, n) - flat)).toBeLessThan(0.15);
		expect(v.surface).toBe(true); // at rest on the terrain for 2 s: surface rails
		sim.dispose();
	});

	test('the same pod slides on a 42 degree ramp (friction 0.8 holds up to atan(0.8) = 38.7 degrees)', async () => {
		const { sim, id } = await standOn(ramp(42));
		run(sim, 5);
		const v = only(sim, id);
		expect(length(groundRelativeVelocity(v))).toBeGreaterThan(0.5);
		expect(v.mode).toBe('flight');
		sim.dispose();
	});

	test('a three-part probe rests at 20 degrees and tips over at 30; a two-stage stack tips already at 10', async () => {
		const resting = await standOn(ramp(20), probe());
		run(resting.sim, 10);
		expect(tiltFrom(only(resting.sim, resting.id), rampNormal(resting.sim, 20))).toBeLessThan(1);
		resting.sim.dispose();

		const tipping = await standOn(ramp(30), probe());
		run(tipping.sim, 10);
		expect(tiltFrom(only(tipping.sim, tipping.id), rampNormal(tipping.sim, 30))).toBeGreaterThan(
			40
		);
		tipping.sim.dispose();

		const tall = await standOn(ramp(10), twoStage());
		run(tall.sim, 10);
		expect(tiltFrom(only(tall.sim, tall.id), rampNormal(tall.sim, 10))).toBeGreaterThan(40);
		tall.sim.dispose();
	});

	test('a lander with its legs out rests at 10 degrees and tips over at 20', async () => {
		for (const [degrees, rests] of [
			[10, true],
			[20, false]
		] as const) {
			const { sim, id } = await standOn(ramp(degrees), lander());
			const legs = only(sim, id).parts.find((p) => p.definition === 'stock.landing-legs')!;
			sim.dispatch({
				type: 'action',
				vessel: id,
				part: legs.id,
				module: 'stock.landing-leg',
				action: 'deploy'
			});
			run(sim, 10);
			const tilt = tiltFrom(only(sim, id), rampNormal(sim, degrees));
			if (rests) expect(tilt).toBeLessThan(1);
			else expect(tilt).toBeGreaterThan(40);
			sim.dispose();
		}
	});
});

describe('the tile band follows the terrain, not the sphere', () => {
	test('on a plateau 3 000 m up a pod 1 m above the ground rests, 1 000 m above it falls', async () => {
		const sim = await newSim({ terrain: plateau(3_000) });
		const flat = await flatRootHeight();
		const near = sim.dispatch({
			type: 'load-vessel',
			design: pod(),
			placement: {
				kind: 'state',
				position: { x: RADIUS + 3_000 + flat + 1, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -OMEGA * (RADIUS + 3_000 + flat + 1) }
			}
		});
		const far = sim.dispatch({
			type: 'load-vessel',
			design: pod(),
			placement: {
				kind: 'state',
				position: { x: RADIUS + 4_000 + flat, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -OMEGA * (RADIUS + 4_000 + flat) }
			}
		});
		if (!near.ok || !far.ok) throw new Error('load failed');
		run(sim, 1);
		const nearV = only(sim, near.vessel!);
		const farV = only(sim, far.vessel!);
		expect(altitude(nearV.position)).toBeGreaterThan(3_000 + flat - 0.2);
		expect(altitude(nearV.position)).toBeLessThan(3_000 + flat + 0.2);
		expect(length(groundRelativeVelocity(nearV))).toBeLessThan(0.5);
		// 1 000 m above: free fall, no ground yet
		expect(length(groundRelativeVelocity(farV))).toBeGreaterThan(8);
		expect(altitude(farV.position)).toBeLessThan(4_000 + flat - 4);
		sim.dispose();
	});
});

describe('impact damage on a slope: the closing speed along the ground normal', () => {
	/** Quaternion product (a then b applied to the right operand first). */
	const qMul = (a: Quat, b: Quat): Quat => ({
		x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
		y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
		z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
		w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
	});

	/** A pod 0.3 m above the ground at `metres` east, falling straight down (radially) at `speed`. */
	const dropOnRamp = async (degrees: number, speed: number) => {
		const sim = await newSim(degrees === 0 ? {} : { terrain: ramp(degrees) });
		const hurt: Array<{ outcome: string; speed: number }> = [];
		sim.events.on('part:damaged', (e) => hurt.push(e));
		const flat = await flatRootHeight();
		const metres = degrees === 0 ? 0 : 300;
		const lon = metres / RADIUS;
		const radial = { x: Math.cos(lon), y: 0, z: -Math.sin(lon) };
		const ground = Math.tan(degrees * DEG) * metres;
		const r = RADIUS + ground + flat + 0.3;
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: pod(),
			placement: {
				kind: 'state',
				position: scale(radial, r),
				// down in the body-fixed frame, carried along by the turning ground
				velocity: {
					x: -radial.x * speed,
					y: 0,
					z: -radial.z * speed - OMEGA * r * Math.cos(lon)
				},
				// +Y along the radial: -90 degrees about Z (as the other ground tests), then `lon` about Y
				orientation: qMul(
					{ x: 0, y: Math.sin(lon / 2), z: 0, w: Math.cos(lon / 2) },
					{ x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 }
				)
			}
		});
		if (!placed.ok) throw new Error(placed.reason);
		run(sim, 6);
		return { sim, id: placed.vessel!, hurt };
	};

	test('11 m/s straight down breaks a 10 m/s pod on flat ground but not on a 30 degree slope (9.5 m/s along the normal)', async () => {
		const flat = await dropOnRamp(0, 11);
		expect(flat.hurt.map((h) => h.outcome)).toEqual(['broken']);
		flat.sim.dispose();
		const slope = await dropOnRamp(30, 11);
		expect(slope.hurt).toEqual([]);
		const v = only(slope.sim, slope.id);
		expect(v.parts).toHaveLength(1);
		expect(altitude(v.position)).toBeGreaterThan(Math.tan(30 * DEG) * 250); // it landed on the ramp
		slope.sim.dispose();
	});

	test('13 m/s on the slope (11.3 along the normal) breaks it, 9 m/s does not on either ground', async () => {
		const hard = await dropOnRamp(30, 13);
		expect(hard.hurt.map((h) => h.outcome)).toEqual(['broken']);
		expect(hard.hurt[0]!.speed).toBeGreaterThan(10.5);
		expect(hard.hurt[0]!.speed).toBeLessThan(12.1); // 13 cos 30 = 11.26 plus a little speed gained in the 0.3 m fall
		hard.sim.dispose();
		const soft = await dropOnRamp(30, 9);
		expect(soft.hurt).toEqual([]);
		soft.sim.dispose();
	});
});

describe('surface rails on terrain (ADR 0024, ADR 0043)', () => {
	test('a probe at rest on a 15 degree ramp goes on surface rails, holds its place over 1e5 s of warp and wakes without a pop', async () => {
		const { sim, id } = await standOn(ramp(15), probe());
		const hurt: unknown[] = [];
		sim.events.on('part:damaged', (e) => hurt.push(e));
		run(sim, 6);
		let v = only(sim, id);
		expect(v.mode).toBe('on-rails');
		expect(v.surface).toBe(true);
		const bodyFixed = (s: VesselSnapshot): Vec3 =>
			rotateBy(
				{ ...sim.snapshot().bodies[0]!.rotation, y: -sim.snapshot().bodies[0]!.rotation.y },
				s.position
			);
		const before = bodyFixed(v);
		expect(sim.dispatch({ type: 'warp', factor: 1_000 }).ok).toBe(true);
		sim.step(100); // 1e5 s of simulated time
		expect(sim.time).toBeGreaterThan(99_000);
		v = only(sim, id);
		expect(length(sub(bodyFixed(v), before))).toBeLessThan(1e-6);
		expect(sim.dispatch({ type: 'warp', factor: 1 }).ok).toBe(true);
		const rest = bodyFixed(v);
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0.001, yaw: 0, roll: 0 });
		sim.step(0.02);
		expect(only(sim, id).mode).toBe('flight');
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		run(sim, 5);
		v = only(sim, id);
		expect(length(sub(bodyFixed(v), rest))).toBeLessThan(0.05);
		expect(tiltFrom(v, rampNormal(sim, 15))).toBeLessThan(1);
		expect(hurt).toEqual([]);
		sim.dispose();
	});
});

describe('placement on terrain', () => {
	test('load-vessel on a hill stands the vessel on the ground, nose along the normal, on the peak and on the flank', async () => {
		const flat = await flatRootHeight(twoStage());
		for (const east of [0, 1_500]) {
			const sim = await newSim({ terrain: hill(0) });
			const loaded = sim.dispatch({
				type: 'load-vessel',
				design: twoStage(),
				placement: eastOf(east)
			});
			if (!loaded.ok) throw new Error(loaded.reason);
			const v = sim.snapshot().vessels[0]!;
			// the ground normal from the analytic Gaussian: slope = -east/sigma^2 * h
			const h = 800 * Math.exp(-(east * east) / (2 * 2_000 * 2_000));
			const slope = (-east / (2_000 * 2_000)) * h; // dh/d(east), negative on the east flank
			const normal = rotateBy(sim.snapshot().bodies[0]!.rotation, {
				x: 1 / Math.hypot(1, slope),
				y: 0,
				z: slope / Math.hypot(1, slope) // normal = up - slope * east, east is -Z at longitude 0
			});
			expect(Math.abs(rootAbovePlane(v, normal) - flat)).toBeLessThan(0.1);
			expect(tiltFrom(v, normal)).toBeLessThan(0.3);
			expect(v.terrainHeight!).toBeGreaterThan(h - 1);
			expect(v.terrainHeight!).toBeLessThan(h + 1);
			sim.dispose();
		}
	});

	test('the terrain option may be a function of the root body', async () => {
		let seen = '';
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: rapier(),
			terrain: (body) => {
				seen = `${body.id} ${body.radius}`;
				return plateau(0);
			}
		});
		expect(seen).toBe('stock.home 600000');
		sim.dispose();
	});

	test('at the launch site the procedural terrain is flat: the pad vessel stands exactly where it stood without terrain', async () => {
		const flat = await newSim();
		const real = await newSim({ terrain: createTerrainField({ radius: RADIUS }) });
		for (const sim of [flat, real]) {
			const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
			if (!loaded.ok) throw new Error(loaded.reason);
		}
		const a = flat.snapshot().vessels[0]!;
		const b = real.snapshot().vessels[0]!;
		expect(length(sub(a.position, b.position))).toBeLessThan(1e-6);
		expect(b.terrainHeight).toBe(0);
		expect(a.terrainHeight).toBeUndefined();
		run(flat, 5);
		run(real, 5);
		expect(
			length(sub(flat.snapshot().vessels[0]!.position, real.snapshot().vessels[0]!.position))
		).toBeLessThan(1e-3);
		flat.dispose();
		real.dispose();
	});
});

describe('on-rails debris meets the terrain, not only the sphere', () => {
	const Rock = definePlugin({
		meta: { id: 'test-rock', version: '1.0.0', api: '^0.1' },
		depends: [Stock],
		setup(ctx) {
			ctx.bodies.register(
				defineBody({
					id: 'test.rock',
					mass: 3.5316e12 / GRAVITATIONAL_CONSTANT,
					radius: RADIUS,
					rotationPeriod: 21_600
				})
			);
		}
	});

	const fall = async (terrain: TerrainField | undefined) => {
		const sim = await createSim({
			plugins: [Stock, Rock],
			body: 'test.rock',
			backendFactory: rapier(),
			seed: 1,
			...(terrain ? { terrain } : {})
		});
		const reasons: string[] = [];
		sim.events.on('vessel:destroyed', (e) => reasons.push(e.reason));
		// apoapsis 100 km, periapsis 1 500 m above the sphere: above the sphere all the way round
		const mu = 3.5316e12;
		const ra = RADIUS + 100_000;
		const rp = RADIUS + 1_500;
		const va = Math.sqrt((2 * mu * rp) / (ra * (ra + rp)));
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: stack('Tank', ['stock.tank-small'], []),
			placement: {
				kind: 'state',
				body: 'test.rock' as never,
				position: { x: ra, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -va }
			}
		});
		if (!placed.ok) throw new Error(placed.reason);
		for (let i = 0; i < 200; i++) sim.step(0.02);
		const mode = sim.snapshot().vessels[0]?.mode;
		expect(sim.dispatch({ type: 'warp', factor: 50 }).ok).toBe(true);
		sim.step(100); // 5 000 s: about one orbit of 3 000 s
		const remaining = sim.snapshot().vessels.length;
		sim.dispose();
		return { reasons, mode, remaining };
	};

	test('a periapsis 1 500 m above the sphere is a stable orbit on bare rock and a crash into a 3 000 m plateau', async () => {
		const bare = await fall(undefined);
		expect(bare.remaining).toBe(1);
		expect(bare.reasons).toEqual([]);
		const rough = await fall(plateau(3_000));
		expect(rough.remaining).toBe(0);
		expect(rough.reasons).toEqual(['debris re-entered the atmosphere']);
	});
});

describe('determinism with terrain', () => {
	test('two runs over the procedural terrain give byte-identical snapshots and worlds', async () => {
		const once = async () => {
			const sim = await newSim({ terrain: createTerrainField({ radius: RADIUS }) });
			// a mountain flank 30 km east of the pad, then a pod dropped on it
			sim.dispatch({
				type: 'load-vessel',
				design: probe(),
				placement: { kind: 'surface', latitude: 0.001, longitude: 30_000 / RADIUS }
			});
			run(sim, 20);
			const out = JSON.stringify([sim.snapshot(), sim.world.serialize()]);
			sim.dispose();
			return out;
		};
		const a = await once();
		expect(await once()).toBe(a);
		expect(a.length).toBeGreaterThan(1_000);
	});
});
