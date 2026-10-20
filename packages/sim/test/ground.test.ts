import { describe, expect, test } from 'bun:test';
import type { BodyDesc, EntityId, PhysicsBackend } from '@orbital/core';
import { createSim } from '../src/index.ts';
import Stock from '@orbital/mod-stock';
import { drop, dropOnto, groundRelativeVelocity, tiltDegrees } from './helpers/ground.ts';
import { altitude } from './helpers/measure.ts';
import { lander, newSim, rapier, stack, twoStage } from './helpers/vessels.ts';
import { length } from '@orbital/kepler';
import { CYLINDER_SQUARES } from '../src/parts.ts';

function damages(sim: Awaited<ReturnType<typeof newSim>>) {
	const out: Array<{ definition: string; outcome: string; speed: number }> = [];
	sim.events.on('part:damaged', (e) => out.push(e));
	return out;
}
const run = (sim: Awaited<ReturnType<typeof newSim>>, seconds: number) => {
	for (let i = 0; i < seconds / 0.02; i++) sim.step(0.02);
};
const only = (sim: Awaited<ReturnType<typeof newSim>>, id: EntityId) =>
	sim.snapshot().vessels.find((v) => v.id === id);

describe('standing on the ground tile (ADR 0019)', () => {
	test('a stack loaded on the surface stands still for 60 s: at rest on the ground, upright, nothing damaged', async () => {
		const sim = await newSim();
		const hurt = damages(sim);
		const loaded = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!loaded.ok) throw new Error(loaded.reason);
		let worst = 0;
		for (let i = 0; i < 3_000; i++) {
			sim.step(0.02);
			if (i % 50 === 0) {
				const v = sim.snapshot().vessels[0]!;
				worst = Math.max(worst, length(groundRelativeVelocity(v)));
			}
		}
		const v = sim.snapshot().vessels[0]!;
		expect(length(groundRelativeVelocity(v))).toBeLessThan(0.05);
		expect(worst).toBeLessThan(0.05);
		expect(tiltDegrees(v)).toBeLessThan(0.5);
		expect(hurt).toEqual([]);
		// Plan 016: after 2 s at rest the stack is on surface rails (this asserted 'flight' before).
		expect(v.mode).toBe('on-rails');
		expect(v.surface).toBe(true);
		expect(altitude(v.position)).toBeGreaterThan(7.4);
		expect(altitude(v.position)).toBeLessThan(7.6);
	});

	test('thrust above weight lifts it off the tile; the tile is dropped far above the ground', async () => {
		const sim = await newSim();
		const id = sim.dispatch({ type: 'load-vessel', design: twoStage() });
		if (!id.ok) throw new Error(id.reason);
		sim.dispatch({ type: 'throttle', vessel: id.vessel!, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id.vessel! });
		run(sim, 30);
		expect(altitude(only(sim, id.vessel!)!.position)).toBeGreaterThan(500);
	});
});

describe('impact damage (ADR 0019)', () => {
	test('dropped on its engine at 20 m/s a stack loses the engine, and only that part first', async () => {
		const sim = await newSim();
		const hurt = damages(sim);
		await dropOnto(sim, twoStage(), 0.5, 20);
		run(sim, 3);
		expect(hurt.length).toBeGreaterThan(0);
		expect(hurt[0]!.definition).toBe('stock.engine-lv');
		expect(hurt[0]!.speed).toBeGreaterThan(15);
		expect(hurt[0]!.speed).toBeLessThan(22);
		expect(hurt[0]!.outcome).toBe('destroyed'); // above twice the 4 m/s tolerance
	});

	test('a gentle touchdown (2 m/s) on the engine damages nothing', async () => {
		const sim = await newSim();
		const hurt = damages(sim);
		const id = await dropOnto(sim, twoStage(), 0.5, 2);
		run(sim, 15);
		expect(hurt).toEqual([]);
		const v = only(sim, id)!;
		expect(v.parts).toHaveLength(7);
		expect(length(groundRelativeVelocity(v))).toBeLessThan(0.1);
	});

	test('a 6 m/s landing on the engine breaks it off (between 1x and 2x the tolerance); the rest stays', async () => {
		const sim = await newSim();
		const hurt = damages(sim);
		const id = await dropOnto(sim, twoStage(), 0.5, 6);
		run(sim, 5);
		expect(hurt.map((h) => h.outcome)).toEqual(['broken']);
		expect(hurt[0]!.definition).toBe('stock.engine-lv');
		expect(only(sim, id)!.parts).toHaveLength(6);
		expect(sim.snapshot().vessels.length).toBe(2); // the broken engine flies on as debris
	});

	test('legs carry a 5 m/s landing that would break the bare engine', async () => {
		const sim = await newSim();
		const hurt = damages(sim);
		const id = await dropOnto(sim, lander(), 0.5, 5);
		const legs = only(sim, id)!.parts.find((p) => p.definition === 'stock.landing-legs')!;
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: legs.id,
			module: 'stock.landing-leg',
			action: 'deploy'
		});
		run(sim, 12);
		expect(hurt).toEqual([]);
		const v = only(sim, id)!;
		expect(v.parts).toHaveLength(6);
		expect(tiltDegrees(v)).toBeLessThan(2);
		expect(length(groundRelativeVelocity(v))).toBeLessThan(0.1);
	});

	test('at 100 m/s a lone command pod is destroyed and its vessel is gone', async () => {
		const sim = await newSim();
		const hurt = damages(sim);
		const destroyed: unknown[] = [];
		sim.events.on('vessel:destroyed', (e) => destroyed.push(e));
		const id = await dropOnto(sim, stack('Pod', ['stock.command-pod'], []), 0.5, 100);
		run(sim, 2);
		expect(hurt.map((h) => [h.definition, h.outcome])).toEqual([
			['stock.command-pod', 'destroyed']
		]);
		expect(destroyed).toHaveLength(1);
		expect(sim.world.hasEntity(id)).toBe(false);
		expect(sim.snapshot().vessels).toEqual([]);
	});

	test('at 100 m/s the engine and the tank above it are destroyed in the first step; the rest of the stack was stopped by the same contact', async () => {
		const sim = await newSim();
		const hurt = damages(sim);
		await dropOnto(sim, twoStage(), 0.5, 100);
		run(sim, 0.5);
		expect(hurt.map((h) => [h.definition, h.outcome])).toEqual([
			['stock.tank-small', 'destroyed'],
			['stock.engine-lv', 'destroyed']
		]);
		expect(hurt.every((h) => h.speed > 99 && h.speed < 102)).toBe(true);
		const survivors = sim.snapshot().vessels;
		expect(survivors.length).toBe(1);
		expect(survivors[0]!.parts).toHaveLength(5);
	});
});

describe('determinism', () => {
	test('an impact that destroys parts and splits the vessel is reproducible', async () => {
		const once = async () => {
			const sim = await newSim();
			const events: unknown[] = [];
			sim.events.on('part:damaged', (e) => events.push(e));
			await dropOnto(sim, twoStage(), 0.5, 30);
			run(sim, 10);
			const out = JSON.stringify([events, sim.snapshot(), sim.world.serialize()]);
			sim.dispose();
			return out;
		};
		const a = await once();
		expect(await once()).toBe(a);
		expect(a.length).toBeGreaterThan(1_000);
	});
});

/** The lander's six cylinder parts, each `CYLINDER_SQUARES` boxes (plan 264). */
const PARTS = 6 * CYLINDER_SQUARES;

describe('landing legs (module colliders)', () => {
	test('deploy and retract rebuild the body (6 parts of 4 squares, 4 feet more while deployed) and keep pose and velocity', async () => {
		const real = await rapier()();
		const shapes: number[] = [];
		const spy: PhysicsBackend = {
			...real,
			createBody: (desc: BodyDesc) => {
				if (desc.kind === undefined && desc.shape.type === 'compound') {
					shapes.push(desc.shape.shapes.length);
				}
				return real.createBody(desc);
			}
		};
		const sim = await createSim({
			plugins: [Stock],
			backendFactory: () => spy,
			maxFlightFrames: 1
		});
		const placed = sim.dispatch({
			type: 'load-vessel',
			design: lander(),
			placement: {
				kind: 'state',
				position: { x: 600_000 + 5_000, y: 0, z: 0 },
				velocity: { x: -30, y: 0, z: -174.5 * (605 / 600) },
				orientation: { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 }
			}
		});
		if (!placed.ok) throw new Error(placed.reason);
		const id = placed.vessel!;
		const part = only(sim, id)!.parts.find((p) => p.definition === 'stock.landing-legs')!.id;
		const act = (action: string) =>
			sim.dispatch({ type: 'action', vessel: id, part, module: 'stock.landing-leg', action });
		run(sim, 1);
		const before = only(sim, id)!;
		expect(act('deploy').ok).toBe(true);
		const after = only(sim, id)!;
		expect(
			length({
				x: after.position.x - before.position.x,
				y: after.position.y - before.position.y,
				z: after.position.z - before.position.z
			})
		).toBeLessThan(1e-3);
		expect(after.velocity.x).toBeCloseTo(before.velocity.x, 4);
		expect(after.parts.find((p) => p.id === part)!.modules['stock.landing-leg']).toEqual({
			deployed: true
		});
		run(sim, 0.5);
		expect(act('retract').ok).toBe(true);
		expect(shapes).toEqual([PARTS, PARTS + 4, PARTS]);
		// A repeated deploy that changes nothing does not rebuild.
		act('retract');
		expect(shapes).toEqual([PARTS, PARTS + 4, PARTS]);
		sim.dispose();
	});
});
