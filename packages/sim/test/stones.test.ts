/**
 * Plan 060, ADR 0092: stones are colliders. A lander's leg that comes down on a boulder rests on it
 * (tilted) or the lander tips; a landing beside a stone is as before; impacts on a stone damage by the
 * same tolerance rule; the run is deterministic; the stone bodies obey their budget and cadence.
 */
import { describe, expect, test } from 'bun:test';
import {
	createBodyTerrainField,
	GRAVITATIONAL_CONSTANT,
	STONES,
	stoneCollider,
	stonesAround,
	type BodyDefinition,
	type EntityId,
	type PhysicsBackend,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { cross, dot, length, normalize, sub } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { defineBody, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import {
	STONE_ENTER,
	STONE_EXIT,
	STONE_MAX,
	STONE_REFRESH,
	STONE_WINDOW
} from '../src/constants.ts';
import { needsStones } from '../src/stones.ts';
import { centreOfMass } from './helpers/measure.ts';
import { dropAt, findClearGround, findStone, rotatedAxis } from './helpers/stones.ts';
import { lander, rapier, twoStage } from './helpers/vessels.ts';

/** LEG_SPREAD of the stock landing legs: the feet are 2 m from the axis, on +-X and +-Z. */
const SPAN = 2;
/** Flat enough that a foot's height over the terrain is the stone's, not the slope's. */
const FLAT = { reach: 6, slope: 0.01 };
/** Where the search starts: the landing plain of the stock moon. */
const PLAIN: Vec3 = { x: 1, y: 0, z: 0 };
/** The cap height above which a stone under one foot of the stock lander tips it over (measured, see the tipping test). */
const TIPPING_CAP = 0.45;

interface Rig {
	sim: Sim;
	moon: BodyDefinition;
	/** Compound bodies of spheres the backend was asked to create (the stone bodies), in order. */
	stoneBodies: number[];
}

/** A moon sim whose backend records the stone bodies it is asked to create. */
async function rig(): Promise<Rig> {
	const stoneBodies: number[] = [];
	const sim = await createSim({
		plugins: [Stock],
		backendFactory: async () => {
			const backend: PhysicsBackend = await rapier(16)();
			const create = backend.createBody.bind(backend);
			backend.createBody = (desc) => {
				if (desc.shape.type === 'compound') {
					const spheres = desc.shape.shapes.filter((s) => s.shape.type === 'sphere').length;
					if (spheres > 0) stoneBodies.push(spheres);
				}
				return create(desc);
			};
			return backend;
		},
		seed: 1,
		terrain: createBodyTerrainField
	});
	return { sim, moon: sim.registries.bodies.get('stock.cinder')!, stoneBodies };
}

const deployLegs = (sim: Sim, id: EntityId): void => {
	const legs = sim
		.snapshot()
		.vessels.find((v) => v.id === id)!
		.parts.find((p) => p.definition === 'stock.landing-legs')!;
	const r = sim.dispatch({
		type: 'action',
		vessel: id,
		part: legs.id,
		module: 'stock.landing-leg',
		action: 'deploy'
	});
	if (!r.ok) throw new Error(r.reason);
};
const run = (sim: Sim, seconds: number): void => {
	for (let i = 0; i < seconds / 0.02; i++) sim.step(0.02);
};

/** The centre of mass above the terrain under the root (m), the tilt from the local vertical (degrees), the speed (m/s). */
function pose(r: Rig, id: EntityId): { alt: number; tilt: number; speed: number } {
	const v = r.sim.snapshot().vessels.find((x) => x.id === id)!;
	const omega = (2 * Math.PI) / r.moon.rotationPeriod;
	const nose = rotatedAxis(v.orientation, { x: 0, y: 1, z: 0 });
	const tilt = Math.acos(Math.min(1, Math.max(-1, dot(nose, normalize(v.position)))));
	return {
		alt: length(centreOfMass(r.sim, v)) - r.moon.radius - v.terrainHeight!,
		tilt: (tilt * 180) / Math.PI,
		speed: length(sub(v.velocity, cross({ x: 0, y: omega, z: 0 }, v.position)))
	};
}

interface Drop {
	design: VesselDesign;
	anchor: Vec3;
	east?: number;
	comAltitude: number;
	speed: number;
}

/** Drop a vessel and run it `seconds`; returns the rig, the vessel, its damage events and its final pose. */
async function land(d: Drop, seconds: number) {
	const r = await rig();
	const id = dropAt(r.sim, r.moon, d.design, d.anchor, d);
	if (d.design.name === 'Lander') deployLegs(r.sim, id);
	const hurt: { definition: string; outcome: string; speed: number }[] = [];
	r.sim.events.on('part:damaged', (e) => hurt.push(e));
	run(r.sim, seconds);
	const p = pose(r, id);
	const out = { ...r, id, hurt, ...p };
	return out;
}

let moonDef: Promise<BodyDefinition> | undefined;
const moonOf = (): Promise<BodyDefinition> =>
	(moonDef ??= rig().then((r) => {
		r.sim.dispose();
		return r.moon;
	}));

/** Height of a design's centre of mass over flat ground with no stone near, at rest: the reference every case is judged by. */
async function standing(design: VesselDesign): Promise<number> {
	const moon = await moonOf();
	const ground = findClearGround(moon, PLAIN, { clear: 12, ...FLAT, within: 600 });
	const t = await land({ design, anchor: ground, comAltitude: 7, speed: 0.5 }, 25);
	t.sim.dispose();
	expect(t.hurt).toEqual([]);
	// A stack standing on slightly sloped ground. Only the height is the reference: the Two-stage
	// rocket topples slowly on the Moon with any collider (106 degrees after a minute), so its tilt
	// after 25 s says nothing but that it has not fallen flat.
	expect(t.tilt).toBeLessThan(10);
	return t.alt;
}

const capOf = (stone: { radius: number }): number => {
	const c = stoneCollider(stone);
	return c.centreHeight + c.radius;
};

describe('a lander on a stone', () => {
	test('a foot coming down on a small stone rests on it: tilted by the three-point rule, raised, nothing damaged', async () => {
		const moon = await moonOf();
		const base = await standing(lander());
		const site = findStone(moon, PLAIN, {
			minRadius: 0.45,
			maxRadius: 0.6,
			clear: 6,
			...FLAT,
			within: 3_000
		});
		const h = capOf(site.stone);
		expect(h).toBeLessThan(TIPPING_CAP);
		// The +X foot lands on the apex, the other three on the ground. A rigid body rests on the
		// raised foot, the opposite one and one side foot; the fourth hangs h over that plane, whose
		// gradient is (h / 4, h / 4) per metre: it tilts by atan(sqrt(2) h / (2 SPAN)).
		const bound = (Math.atan((Math.SQRT2 * h) / (2 * SPAN)) * 180) / Math.PI;
		const t = await land(
			{
				design: lander(),
				anchor: site.stone.direction,
				east: -SPAN,
				comAltitude: base + h + 0.4,
				speed: 0.5
			},
			30
		);
		t.sim.dispose();
		expect(t.hurt).toEqual([]);
		expect(t.speed).toBeLessThan(0.1); // at rest on the stone
		expect(t.tilt).toBeGreaterThan(1); // not sunk through it
		expect(t.tilt).toBeLessThan(bound * 1.1);
		expect(t.alt).toBeGreaterThan(base + 0.03);
		expect(t.alt).toBeLessThan(base + h);
	});

	test('a foot on a boulder whose cap is above the tipping height (0.45 m) tips the lander over', async () => {
		const moon = await moonOf();
		const base = await standing(lander());
		const site = findStone(moon, PLAIN, { minRadius: 1.3, clear: 6, ...FLAT, within: 3_000 });
		const h = capOf(site.stone);
		// With one foot on the stone the body rests on three feet and the centre of mass, 5.8 m up the
		// axis and over the edge between two of them, tips out of the support triangle if the lean goes
		// the wrong way. Measured on 12 sites (landing with the foot over the apex, 0.5 m/s): caps up to
		// 0.42 m rest (tilt 3.5 to 5.9 degrees), caps from 0.49 m up lie on their side (97.9 degrees).
		expect(h).toBeGreaterThan(TIPPING_CAP);
		const t = await land(
			{
				design: lander(),
				anchor: site.stone.direction,
				east: -SPAN,
				comAltitude: base + h + 0.4,
				speed: 0.5
			},
			30
		);
		t.sim.dispose();
		expect(t.tilt).toBeGreaterThan(45);
	});

	test('a landing beside a stone is the landing it was: same height, upright, nothing damaged', async () => {
		const moon = await moonOf();
		const base = await standing(lander());
		const site = findStone(moon, PLAIN, {
			minRadius: 0.45,
			maxRadius: 0.6,
			clear: 6,
			...FLAT,
			within: 3_000
		});
		// Centred 4.5 m west of the stone: the east foot is 2.5 m from it.
		const t = await land(
			{
				design: lander(),
				anchor: site.stone.direction,
				east: -4.5,
				comAltitude: base + 0.4,
				speed: 0.5
			},
			30
		);
		t.sim.dispose();
		expect(t.hurt).toEqual([]);
		expect(Math.abs(t.alt - base)).toBeLessThan(0.1);
		expect(t.tilt).toBeLessThan(2);
	});

	test('an engine coming down on a stone above its tolerance breaks as on bare ground; gently, nothing', async () => {
		const moon = await moonOf();
		const base = await standing(twoStage());
		const site = findStone(moon, PLAIN, {
			minRadius: 0.45,
			maxRadius: 0.6,
			clear: 6,
			...FLAT,
			within: 3_000
		});
		const h = capOf(site.stone);
		// The engine bell (4 m/s tolerance) comes down on the apex: 5 m/s plus 0.3 m of fall is above
		// the tolerance and below twice it, so it breaks off; at 1 m/s nothing is damaged.
		const fast = await land(
			{ design: twoStage(), anchor: site.stone.direction, comAltitude: base + h + 0.3, speed: 5 },
			6
		);
		fast.sim.dispose();
		expect(fast.hurt.length).toBeGreaterThan(0);
		expect(fast.hurt[0]!.definition).toBe('stock.engine-lv');
		expect(fast.hurt[0]!.outcome).toBe('broken');
		expect(fast.hurt[0]!.speed).toBeGreaterThan(4);
		expect(fast.hurt[0]!.speed).toBeLessThan(8);
		const slow = await land(
			{ design: twoStage(), anchor: site.stone.direction, comAltitude: base + h + 0.3, speed: 1 },
			10
		);
		slow.sim.dispose();
		expect(slow.hurt).toEqual([]);
	});
});

describe('the stone bodies', () => {
	test('one is built when a vessel lands and kept while it rests: no rebuilding, within the budget', async () => {
		const moon = await moonOf();
		const site = findStone(moon, PLAIN, { minRadius: 0.45, clear: 6, ...FLAT, within: 3_000 });
		const r = await rig();
		const id = dropAt(r.sim, r.moon, lander(), site.stone.direction, {
			comAltitude: 8,
			speed: 0.5
		});
		deployLegs(r.sim, id);
		run(r.sim, 40);
		r.sim.dispose();
		expect(r.stoneBodies.length).toBe(1);
		expect(r.stoneBodies[0]!).toBeGreaterThan(0);
		expect(r.stoneBodies[0]!).toBeLessThanOrEqual(STONE_MAX);
	});

	test('the home planet has none', async () => {
		const stoneBodies: number[] = [];
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: async () => {
				const backend = await rapier(16)();
				const create = backend.createBody.bind(backend);
				backend.createBody = (desc) => {
					if (
						desc.shape.type === 'compound' &&
						desc.shape.shapes.some((s) => s.shape.type === 'sphere')
					)
						stoneBodies.push(1);
					return create(desc);
				};
				return backend;
			},
			seed: 1,
			terrain: createBodyTerrainField
		});
		sim.dispatch({ type: 'load-vessel', design: lander() });
		run(sim, 10);
		sim.dispose();
		expect(stoneBodies).toEqual([]);
	});

	test('the window, the budget and the cadence are consistent', () => {
		expect(STONE_REFRESH).toBeLessThan(STONE_WINDOW);
		expect(STONE_ENTER).toBeLessThan(STONE_EXIT);
		// the busiest ground (all cells at the top chance) within the reach a rebuilt field guarantees fits the cap
		const reach = STONE_WINDOW - STONE_REFRESH;
		const mostStones =
			((Math.PI * reach * reach) / (STONES.cell * STONES.cell)) * (STONES.quiet + STONES.busy);
		expect(mostStones).toBeLessThanOrEqual(STONE_MAX);
		const field = { anchorDir: PLAIN } as Parameters<typeof needsStones>[0];
		const radius = 190_000;
		const at = (m: number): Vec3 => normalize({ x: 1, y: 0, z: m / radius });
		expect(needsStones(undefined, at(0), radius)).toBe(true);
		expect(needsStones(field, at(STONE_REFRESH - 0.5), radius)).toBe(false);
		expect(needsStones(field, at(STONE_REFRESH + 0.5), radius)).toBe(true);
	});
});

describe('determinism', () => {
	test('two runs of a landing on a stone are byte-identical', async () => {
		const moon = await moonOf();
		const base = await standing(lander());
		const site = findStone(moon, PLAIN, {
			minRadius: 0.45,
			maxRadius: 0.6,
			clear: 6,
			...FLAT,
			within: 3_000
		});
		const once = async (): Promise<string> => {
			const t = await land(
				{
					design: lander(),
					anchor: site.stone.direction,
					east: -SPAN,
					comAltitude: base + capOf(site.stone) + 0.4,
					speed: 0.5
				},
				20
			);
			const text = JSON.stringify(t.sim.snapshot());
			t.sim.dispose();
			return text;
		};
		const a = await once();
		expect(await once()).toBe(a);
	});
});

describe('save and resume', () => {
	/** Distance between a flight and its resumed twin 30 s after a save taken 2 s into a fall, m. */
	async function divergence(
		anchor: Vec3,
		east: number,
		comAltitude: number
	): Promise<{ distance: number; height: number }> {
		const original = await rig();
		const id = dropAt(original.sim, original.moon, lander(), anchor, {
			east,
			comAltitude,
			speed: 1
		});
		deployLegs(original.sim, id);
		run(original.sim, 2); // in flight, a few metres above the ground
		const text = JSON.stringify(original.sim.save());
		// "milestones" (plan 102) contains the word; no stone data is saved.
		expect(text.replaceAll('milestone', '')).not.toContain('stone');
		const resumed = await createSim({
			plugins: [Stock],
			backendFactory: rapier(16),
			seed: 1,
			terrain: createBodyTerrainField,
			resume: JSON.parse(text)
		});
		run(original.sim, 30);
		run(resumed, 30);
		const a = original.sim.snapshot().vessels.find((v) => v.id === id)!;
		const b = resumed.snapshot().vessels.find((v) => v.id === id)!;
		const above = (v: typeof a): number =>
			length(v.position) - original.moon.radius - (v.terrainHeight ?? 0);
		const out = {
			distance: length(sub(a.position, b.position)),
			height: Math.abs(above(a) - above(b))
		};
		original.sim.dispose();
		resumed.dispose();
		return out;
	}

	test('stones are derived, not saved: a landing on a stone resumed from a save lands where the original does, as on bare ground', async () => {
		const moon = await moonOf();
		const base = await standing(lander());
		const site = findStone(moon, PLAIN, {
			minRadius: 0.45,
			maxRadius: 0.6,
			clear: 6,
			...FLAT,
			within: 3_000
		});
		const ground = findClearGround(moon, PLAIN, { clear: 12, ...FLAT, within: 600 });
		const onStone = await divergence(site.stone.direction, -SPAN, base + capOf(site.stone) + 6);
		const onGround = await divergence(ground, 0, base + 6);
		console.log(
			`resume divergence after landing: on a stone ${onStone.distance.toExponential(2)} m, on bare ground ${onGround.distance.toExponential(2)} m`
		);
		// A lander perched on a stone rocks on it, and a resumed twin settles a little differently
		// (0.5 m sideways since plan 264, 0.02 m before). What a missing stone would show is the
		// stone's height (0.45 m and more) between the two: that stays under a centimetre. ADR 0050.
		expect(onStone.height).toBeLessThan(0.05);
		expect(onStone.distance).toBeLessThan(2);
		expect(onGround.distance).toBeLessThan(5e-2);
	});
});

describe('cost', () => {
	const R = 190_000;
	const orbit = { a: 9_000_000, e: 0, i: 0, raan: 0, argp: 0, m0: 2, epoch: 0 };
	const body = (id: string, terrain: NonNullable<BodyDefinition['terrain']>) =>
		defineBody({
			id,
			mass: 2e10 / GRAVITATIONAL_CONSTANT,
			radius: R,
			rotationPeriod: 50_000,
			parent: 'stock.home',
			orbit,
			terrain
		});
	const Pair = definePlugin({
		meta: { id: 'test-stone-cost', version: '1.0.0', api: '^0.1' },
		depends: [Stock],
		setup(ctx) {
			ctx.bodies.register(body('test.stony', { kind: 'craters' }));
			ctx.bodies.register(body('test.bare', { kind: 'hills' })); // no stones
		}
	});

	/** Wall time per step of a lander coming down from 40 m and resting for 30 s, ms: mean and worst. */
	async function stepCost(bodyId: string): Promise<{ mean: number; worst: number }> {
		const sim = await createSim({
			plugins: [Stock, Pair],
			backendFactory: rapier(16),
			seed: 1,
			terrain: createBodyTerrainField
		});
		dropAt(sim, sim.registries.bodies.get(bodyId)!, lander(), PLAIN, { comAltitude: 40, speed: 2 });
		const times: number[] = [];
		for (let i = 0; i < 1_500; i++) {
			const t0 = performance.now();
			sim.step(0.02);
			times.push(performance.now() - t0);
		}
		sim.dispose();
		return { mean: times.reduce((a, b) => a + b, 0) / times.length, worst: Math.max(...times) };
	}

	test('stones add under 0.1 ms to the mean step and no step takes 15 ms (the budget is 20)', async () => {
		await stepCost('test.stony'); // warm up
		const stony = await stepCost('test.stony');
		const bare = await stepCost('test.bare');
		console.log(
			`step with stones: mean ${stony.mean.toFixed(3)} ms, worst ${stony.worst.toFixed(2)} ms; without: mean ${bare.mean.toFixed(3)} ms, worst ${bare.worst.toFixed(2)} ms`
		);
		expect(stony.mean - bare.mean).toBeLessThan(0.1);
		expect(stony.worst).toBeLessThan(15);
	});

	test('building a field (the stones round a point and their heights) takes under 5 ms at the busiest ground', () => {
		const field = createBodyTerrainField({ radius: R, terrain: { kind: 'craters' } })!;
		const times: number[] = [];
		let most = 0;
		for (let k = 0; k < 60; k++) {
			const n = normalize({ x: 1, y: (k % 6) * 2e-4, z: Math.floor(k / 6) * 2e-4 });
			const t0 = performance.now();
			const list = stonesAround(n, R, STONE_WINDOW, STONE_MAX);
			for (const stone of list) field.heightAt(stone.direction);
			times.push(performance.now() - t0);
			most = Math.max(most, list.length);
		}
		times.sort((a, b) => a - b);
		console.log(
			`field build: median ${times[30]!.toFixed(2)} ms, worst ${times[59]!.toFixed(2)} ms, most stones ${most}`
		);
		expect(times[59]!).toBeLessThan(5);
		expect(most).toBeLessThanOrEqual(STONE_MAX);
	});
});
