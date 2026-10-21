/** Plan 209 (ADR 0203 point 4): a capsule under one main chute comes down slow enough to land. */
import { describe, expect, test } from 'bun:test';
import { length } from '@orbital/kepler';
import { newSim, stack } from './helpers/vessels.ts';

const R = 600_000;

describe('parachute descent', () => {
	test('a pod with one top chute dropped at 5 km and 250 m/s lands below 8 m/s', async () => {
		const sim = await newSim();
		// over the pole, upright: the radial is +Y and the ground under it does not turn
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack('Capsule', ['stock.parachute', 'stock.command-pod'], [[0]]),
			placement: {
				kind: 'state',
				body: 'stock.home',
				position: { x: 0, y: R + 5_000, z: 0 },
				velocity: { x: 0, y: -250, z: 0 }
			}
		} as never);
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		const damaged: string[] = [];
		sim.events.on('part:damaged', (e) => damaged.push(e.definition));
		const stages: string[] = [];
		sim.events.on('stock:parachute-deployed', (e) => stages.push(e.stage));
		let touchdown: number | null = null;
		for (let i = 0; i < 400 / 0.02 && touchdown === null; i++) {
			const before = sim.snapshot().vessels.find((v) => v.id === id)!;
			sim.step(0.02);
			const v = sim.snapshot().vessels.find((x) => x.id === id);
			if (!v) break;
			const height = length(v.position) - R - (v.terrainHeight ?? 0);
			if (height < 3) touchdown = length(before.velocity);
		}
		expect(stages).toEqual(['semi', 'full']);
		expect(touchdown).not.toBeNull();
		expect(touchdown!).toBeLessThan(8);
		expect(damaged).toEqual([]);
		const chute = sim.snapshot().vessels[0]!.parts[0]!.modules['stock.parachute'] as {
			status: string;
		};
		expect(chute.status).toBe('full');
		sim.dispose();
	}, 120_000);
});

describe('docking chute ring (plan 278, ADR 0260)', () => {
	test('a pod with the ring and a docking port on it lands below 8 m/s, the port still on top', async () => {
		const sim = await newSim();
		const r = sim.dispatch({
			type: 'load-vessel',
			design: stack(
				'Capsule with port',
				['stock.docking-port-small', 'stock.parachute-ring', 'stock.command-pod'],
				[[1]]
			),
			placement: {
				kind: 'state',
				body: 'stock.home',
				position: { x: 0, y: R + 5_000, z: 0 },
				velocity: { x: 0, y: -250, z: 0 }
			}
		} as never);
		if (!r.ok) throw new Error(r.reason);
		const id = r.vessel!;
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		const damaged: string[] = [];
		sim.events.on('part:damaged', (e) => damaged.push(e.definition));
		let touchdown: number | null = null;
		for (let i = 0; i < 400 / 0.02 && touchdown === null; i++) {
			const before = sim.snapshot().vessels.find((v) => v.id === id)!;
			sim.step(0.02);
			const v = sim.snapshot().vessels.find((x) => x.id === id);
			if (!v) break;
			const height = length(v.position) - R - (v.terrainHeight ?? 0);
			if (height < 3) touchdown = length(before.velocity);
		}
		expect(touchdown).not.toBeNull();
		expect(touchdown!).toBeLessThan(8);
		expect(damaged).toEqual([]);
		const vessel = sim.snapshot().vessels.find((v) => v.id === id)!;
		expect(vessel.parts.map((p) => String(p.definition))).toEqual([
			'stock.docking-port-small',
			'stock.parachute-ring',
			'stock.command-pod'
		]);
		const chute = vessel.parts[1]!.modules['stock.parachute'] as { status: string };
		expect(chute.status).toBe('full');
		sim.dispose();
	}, 120_000);
});
