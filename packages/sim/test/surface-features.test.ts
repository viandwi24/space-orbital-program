/**
 * Plan 283: `vessel.nearestFeature` finds the rock of the stone lattice nearest a point of the
 * part within a reach, the same rock in every session; none out of reach, none on a body without
 * stones.
 */
import { expect, test } from 'bun:test';
import { createBodyTerrainField, partId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePart, definePlugin, kg, z } from '@orbital/sdk';
import { createSim } from '../src/index.ts';
import { dropAt, findClearGround, findStone } from './helpers/stones.ts';
import { rapier } from './helpers/vessels.ts';

interface Probe {
	reach: number;
	found?: { id: string; kind: string; distance: number; radius: number } | null;
}

/** A module that asks for the nearest feature each step and keeps the answer in its state. */
const ModuleProbe = defineModule({
	id: 'test.feature-probe',
	config: z.object({ reach: z.number().positive() }),
	state: (config): Probe => ({ reach: config.reach }),
	update(ctx) {
		ctx.state.found = ctx.vessel.nearestFeature?.(ctx.config.reach) ?? null;
	},
	snapshot: (state) => state
});
const Feeler = definePlugin({
	meta: { id: 'test', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.modules.register(ModuleProbe);
		ctx.parts.register(
			definePart({
				id: 'test.feeler',
				title: 'Feeler',
				mass: kg(50),
				shape: { kind: 'cylinder', radius: 0.5, height: 1 },
				attach: { top: { pos: [0, 0.5, 0], dir: [0, 1, 0], size: 1 } },
				modules: [[ModuleProbe, { reach: 4 }]]
			})
		);
	}
});

const design = (part: string): VesselDesign => ({
	formatVersion: 3,
	name: 'Feeler',
	parts: [{ index: 0, part: partId(part), parent: null }],
	stages: []
});

async function probe(anchorOf: (moon: never) => unknown, altitude: number, reach: number) {
	const sim = await createSim({
		plugins: [Stock, Feeler],
		backendFactory: rapier(16),
		seed: 1,
		terrain: createBodyTerrainField
	});
	const moon = sim.registries.bodies.get('stock.cinder')!;
	const anchor = anchorOf(moon as never) as { x: number; y: number; z: number };
	const id = dropAt(sim, moon, design('test.feeler'), anchor, { comAltitude: altitude, speed: 0 });
	sim.step(0.02);
	const part = sim.snapshot().vessels.find((v) => v.id === id)!.parts[0]!;
	const state = part.modules['test.feature-probe'] as Probe;
	sim.dispose();
	return { state, reach };
}

test('a rock under the part is found within reach, and not when the reach is short; clear ground has none', async () => {
	const PLAIN = { x: 1, y: 0, z: 0 };
	const site = (moon: never) =>
		findStone(moon, PLAIN, { minRadius: 0.3, clear: 6, reach: 6, slope: 0.05, within: 3_000 }).stone
			.direction;
	const near = await probe(site, 1.5, 4);
	expect(near.state.found).not.toBeNull();
	expect(near.state.found!.kind).toBe('rock');
	expect(near.state.found!.distance).toBeLessThan(4);
	expect(near.state.found!.id).toMatch(/^stock\.cinder:\d+:-?\d+:-?\d+$/);
	// the same rock every time
	const again = await probe(site, 1.5, 4);
	expect(again.state.found!.id).toBe(near.state.found!.id);
	// too high for the same reach
	const high = await probe(site, 30, 4);
	expect(high.state.found).toBeNull();
	// flat ground with no stone within 12 m
	const clear = await probe(
		(moon: never) =>
			findClearGround(moon, PLAIN, { clear: 12, reach: 6, slope: 0.05, within: 600 }),
		1.5,
		4
	);
	expect(clear.state.found).toBeNull();
});
