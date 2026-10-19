/** Launch clamps (plan 210, ADR 0203): hold on the pad at full thrust, feed EC, release on staging. */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { rapier } from './helpers/vessels.ts';

/** Probe, tank and engine; two clamps on the tank. Stage 0 lights the engine, stage 1 lets go. */
const clamped = (): VesselDesign =>
	({
		formatVersion: 3,
		name: 'Clamped',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			{
				index: 1,
				part: partId('stock.tank-small'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 2,
				part: partId('stock.engine-lv'),
				parent: { index: 1, parentNode: 'bottom', node: 'top' }
			},
			...[0, Math.PI].map((angle, k) => ({
				index: 3 + k,
				part: partId('stock.launch-clamp'),
				parent: { index: 1, parentNode: 'surface', node: 'radial', radial: { angle, y: 0 } },
				symmetry: 1
			}))
		],
		stages: [[2], [3, 4]]
	}) as VesselDesign;

const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;
const ec = (sim: Sim, id: EntityId): number => {
	let total = 0;
	for (const p of vesselOf(sim, id).parts) {
		const c = p.modules['stock.resource-container'] as
			{ amounts?: Record<string, number> } | undefined;
		total += c?.amounts?.['stock.electric-charge'] ?? 0;
	}
	return total;
};
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < seconds * 50; i++) sim.step(0.02);
};

describe('launch clamps (plan 210)', () => {
	test('a clamped rocket at full thrust stays put with full EC; staging the clamps lets it rise', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
		const loaded = sim.dispatch({ type: 'load-vessel', design: clamped() });
		if (!loaded.ok) throw new Error(loaded.reason);
		const id = loaded.vessel!;
		run(sim, 1);
		const start = vesselOf(sim, id).position;
		const startVelocity = vesselOf(sim, id).velocity;
		const full = ec(sim, id);
		expect(sim.dispatch({ type: 'throttle', vessel: id, value: 1 }).ok).toBe(true);
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		run(sim, 5);
		const held = vesselOf(sim, id);
		const engine = held.parts.find((p) => p.definition === 'stock.engine-lv')!;
		expect((engine.modules['stock.engine'] as { ignited: boolean }).ignited).toBe(true);
		// the ground turns under it: it keeps its height and its speed (the ground's) at full thrust
		const r0 = Math.hypot(start.x, start.y, start.z);
		const r1 = Math.hypot(held.position.x, held.position.y, held.position.z);
		expect(Math.abs(r1 - r0)).toBeLessThan(0.01);
		const speed = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
		expect(Math.abs(speed(held.velocity) - speed(startVelocity))).toBeLessThan(0.01);
		expect(ec(sim, id)).toBeGreaterThanOrEqual(full - 1e-6);
		const clamp = held.parts.find((p) => p.definition === 'stock.launch-clamp')!;
		expect((clamp.modules['stock.launch-clamp'] as { height: number }).height).toBeGreaterThan(0);
		// release: the clamps stay on the pad, the rocket climbs
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		run(sim, 5);
		const free = vesselOf(sim, id);
		expect(free.parts.some((p) => p.definition === 'stock.launch-clamp')).toBe(false);
		const r2 = Math.hypot(free.position.x, free.position.y, free.position.z);
		expect(r2 - r0).toBeGreaterThan(20);
		// the clamps are their own vessels, still where they were
		const clamps = sim
			.snapshot()
			.vessels.filter((v) => v.parts.every((p) => p.definition === 'stock.launch-clamp'));
		expect(clamps.length).toBe(2);
		for (const c of clamps) {
			const rc = Math.hypot(c.position.x, c.position.y, c.position.z);
			expect(Math.abs(rc - r0)).toBeLessThan(5);
		}
		sim.dispose();
	}, 60_000);

	test('a vessel with clamps loaded in orbit is not held', async () => {
		const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 1 });
		const r = 600_000 + 100_000;
		const loaded = sim.dispatch({
			type: 'load-vessel',
			design: clamped(),
			placement: {
				kind: 'state',
				position: { x: r, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -2_200 }
			}
		});
		if (!loaded.ok) throw new Error(loaded.reason);
		const id = loaded.vessel!;
		sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
		sim.dispatch({ type: 'stage', vessel: id });
		const v0 = vesselOf(sim, id).velocity;
		run(sim, 2);
		const v1 = vesselOf(sim, id).velocity;
		expect(Math.hypot(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z)).toBeGreaterThan(5);
		sim.dispose();
	}, 60_000);
});
