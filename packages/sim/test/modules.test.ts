import { describe, expect, test } from 'bun:test';
import { partId, type VesselDesign } from '@orbital/core';
import Stock, { ModuleCommand, ModuleResourceContainer } from '@orbital/mod-stock';
import { definePart, defineModule, definePlugin, z } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

/** A third-party style module: generates charge on rails and in flight; a bad one pushes while on rails. */
const Generator = defineModule({
	id: 'test.generator',
	config: z.object({ rate: z.number(), push: z.boolean().default(false) }),
	state: () => ({ ticks: 0, lastDt: 0 }),
	update(ctx, dt) {
		ctx.state.ticks += 1;
		ctx.vessel.resources.deposit('stock.electric-charge', ctx.config.rate * dt);
	},
	updateOnRails(ctx, dt) {
		ctx.state.ticks += 1;
		ctx.state.lastDt = dt;
		if (ctx.config.push) ctx.vessel.applyForce({ x: 1, y: 0, z: 0 });
		ctx.vessel.resources.deposit('stock.electric-charge', ctx.config.rate * dt);
	},
	snapshot: (s) => ({ ticks: s.ticks, lastDt: s.lastDt })
});

const PartGenerator = (id: string, push: boolean) =>
	definePart({
		id,
		title: 'Generator pod',
		mass: 500,
		shape: { kind: 'cylinder', radius: 0.625, height: 1 },
		attach: {
			top: { pos: [0, 0.5, 0], dir: [0, 1, 0] },
			bottom: { pos: [0, -0.5, 0], dir: [0, -1, 0] }
		},
		modules: [
			[ModuleCommand],
			[
				ModuleResourceContainer,
				{ contents: { 'stock.electric-charge': { capacity: 100, amount: 0 } } }
			],
			[Generator, { rate: 0.5, push }]
		]
	});

const Mod = definePlugin({
	meta: { id: 'test', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.modules.register(Generator);
		ctx.parts.register(PartGenerator('test.gen-pod', false));
		ctx.parts.register(PartGenerator('test.pushy-pod', true));
	}
});

const design = (part: string): VesselDesign => ({
	formatVersion: 1,
	name: part,
	parts: [{ index: 0, part: partId(part), parent: null }],
	stages: []
});

async function orbiting(part: string) {
	const sim = await createSim({
		plugins: [Stock, Mod],
		backendFactory: rapier(4),
		maxFlightFrames: 1
	});
	const r = sim.dispatch({
		type: 'load-vessel',
		design: design(part),
		placement: { kind: 'state', ...orbitState(sim, 100_000) }
	});
	if (!r.ok) throw new Error(r.reason);
	return { sim, id: r.vessel! };
}

describe('module hooks through the capability API (no stock ids in the sim)', () => {
	test('updateOnRails runs with the chunk length and can use the resource graph', async () => {
		const { sim } = await orbiting('test.gen-pod');
		sim.dispatch({ type: 'warp', factor: 1_000 });
		sim.step(0.1); // 100 s in 10 s chunks
		const part = sim.snapshot().vessels[0]!.parts[0]!;
		expect(part.modules['test.generator']).toEqual({ ticks: 10, lastDt: 10 });
		const charge = (part.modules['stock.resource-container'] as { amounts: Record<string, number> })
			.amounts['stock.electric-charge']!;
		expect(charge).toBeCloseTo(50, 9); // 0.5 EC/s for 100 s, below the 100 EC capacity
		sim.step(1); // 1000 s more: capped by capacity
		const full = (
			sim.snapshot().vessels[0]!.parts[0]!.modules['stock.resource-container'] as {
				amounts: Record<string, number>;
			}
		).amounts['stock.electric-charge'];
		expect(full).toBe(100);
	});

	test('the same module runs update() in flight at the fixed step', async () => {
		const { sim, id } = await orbiting('test.gen-pod');
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 }); // wakes the vessel
		expect(sim.snapshot().vessels[0]!.mode).toBe('flight');
		for (let i = 0; i < 50; i++) sim.step(0.02);
		const mods = sim.snapshot().vessels[0]!.parts[0]!.modules;
		expect((mods['test.generator'] as { ticks: number }).ticks).toBe(50);
	});

	test('a force requested while on rails throws an error that explains why', async () => {
		const { sim } = await orbiting('test.pushy-pod');
		expect(() => sim.step(0.02)).toThrow('needs the vessel in flight mode');
	});
});
