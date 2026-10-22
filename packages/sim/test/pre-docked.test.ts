/**
 * Ports built docked (plan 356, ADR 0300): two docking ports joined face to face in the design
 * start docked; Undock (or a stage with "Undock on stage") sets the payload free with the gentle
 * push, the payload drifts straight out and is not caught again, and bringing it back docks again.
 */
import { describe, expect, test } from 'bun:test';
import type { EntityId, Plugin, VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState, vesselMass } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

/**
 * `fix.awake`: a negligible torque every step keeps an idle vessel in flight; `push(n)` adds a
 * force of `n` N along the vessel's -Y for one second (a payload moving off or turning back).
 */
const awake: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.awake',
				state: () => ({ force: 0, left: 0 }),
				update(c, dt) {
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
					if (c.state.left > 0) {
						c.vessel.applyForce({ x: 0, y: -c.state.force, z: 0 });
						c.state.left -= dt;
					}
				},
				actions: {
					push: (c, n) => {
						c.state.force = n as number;
						c.state.left = 1;
					}
				}
			})
		);
		ctx.parts.register({
			id: 'fix.awake',
			title: 'Awake',
			mass: 1,
			shape: { kind: 'cylinder', radius: 0.3, height: 0.1 },
			attach: {
				top: { pos: [0, 0.05, 0], dir: [0, 1, 0] },
				bottom: { pos: [0, -0.05, 0], dir: [0, -1, 0] }
			},
			modules: [['fix.awake', undefined]]
		});
	}
});

/** A carrier (probe core, tank, port facing up) and a payload turned over onto it, face to face. */
function carrier(stageUndock = false): VesselDesign {
	return {
		formatVersion: 3,
		name: 'Carrier',
		parts: [
			{ index: 0, part: 'stock.tank-small', parent: null },
			{
				index: 1,
				part: 'stock.docking-port',
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			},
			{
				index: 2,
				part: 'stock.docking-port',
				parent: { index: 1, parentNode: 'top', node: 'top' },
				tilt: { x: Math.PI, y: 0, z: 0 },
				...(stageUndock ? { settings: { 'stock.docking-port': { stageUndock: true } } } : {})
			},
			{
				index: 3,
				part: 'stock.tank-small',
				parent: { index: 2, parentNode: 'bottom', node: 'top' }
			},
			{ index: 4, part: 'fix.awake', parent: { index: 0, parentNode: 'bottom', node: 'top' } },
			{ index: 5, part: 'fix.awake', parent: { index: 3, parentNode: 'bottom', node: 'top' } },
			// the carrier's control: staging needs one
			{
				index: 6,
				part: 'stock.probe-core',
				parent: { index: 4, parentNode: 'bottom', node: 'top' }
			}
		],
		stages: stageUndock ? [[2]] : []
	} as VesselDesign;
}

async function launch(design: VesselDesign): Promise<{ sim: Sim; id: EntityId }> {
	const sim = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 5 });
	const s = orbitState(sim, 200_000);
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
	});
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	sim.step(0.02);
	return { sim, id: r.vessel };
}

const ports = (sim: Sim) =>
	sim.snapshot().vessels.flatMap((v) =>
		v.parts
			.filter((p) => p.definition === 'stock.docking-port')
			.map((p) => ({
				vessel: v.id,
				part: p.id,
				state: p.modules['stock.docking-port'] as { docked: boolean }
			}))
	);

/** Distance between the two vessels' centres of mass, m. */
const gap = (sim: Sim): number => {
	const [a, b] = sim.snapshot().vessels;
	return Math.hypot(
		a!.position.x - b!.position.x,
		a!.position.y - b!.position.y,
		a!.position.z - b!.position.z
	);
};

describe('ports built docked (plan 356, ADR 0300)', () => {
	test('a face-to-face pair starts docked; Undock sets the payload free and it drifts away', async () => {
		const { sim, id } = await launch(carrier());
		const before = ports(sim);
		expect(before).toHaveLength(2);
		expect(before.every((p) => p.state.docked)).toBe(true);
		const r = sim.dispatch({
			type: 'action',
			vessel: id,
			part: before[1]!.part,
			module: 'stock.docking-port',
			action: 'undock'
		});
		expect(r.ok).toBe(true);
		sim.step(0.02);
		expect(sim.snapshot().vessels).toHaveLength(2);
		expect(ports(sim).every((p) => !p.state.docked)).toBe(true);
		const g0 = gap(sim);
		const gaps: number[] = [];
		for (let t = 0; t < 30; t += 0.02) {
			sim.step(0.02);
			if (sim.snapshot().vessels.length < 2) {
				console.log(`caught again after ${t.toFixed(2)} s`);
				break;
			}
			if (Math.round(t * 50) % 250 === 0) gaps.push(gap(sim));
		}
		console.log(
			`pre-docked: gap ${g0.toFixed(3)} m, then ${gaps.map((g) => g.toFixed(2)).join(' ')}`
		);
		// still two vessels: the push carried the faces past the capture range for good
		expect(sim.snapshot().vessels).toHaveLength(2);
		for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThan(gaps[i - 1]!);
		sim.dispose();
	}, 60_000);

	test('"Undock on stage" undocks it on its stage', async () => {
		const { sim, id } = await launch(carrier(true));
		const staged = sim.dispatch({ type: 'stage', vessel: id });
		expect(staged.ok ? '' : staged.reason).toBe('');
		sim.step(0.02);
		expect(sim.snapshot().vessels).toHaveLength(2);
		sim.dispose();
	}, 60_000);

	test('moved out of range and brought back, the two dock again', async () => {
		const { sim, id } = await launch(carrier());
		const p = ports(sim)[1]!;
		sim.dispatch({
			type: 'action',
			vessel: id,
			part: p.part,
			module: 'stock.docking-port',
			action: 'undock'
		});
		sim.step(0.02);
		const payloadOf = () => sim.snapshot().vessels.find((v) => v.id !== id)!;
		const relSpeed = () => {
			const [a, b] = sim.snapshot().vessels;
			return Math.hypot(
				a!.velocity.x - b!.velocity.x,
				a!.velocity.y - b!.velocity.y,
				a!.velocity.z - b!.velocity.z
			);
		};
		const push = (n: number) => {
			const payload = payloadOf();
			const part = payload.parts.find((q) => q.definition === 'fix.awake')!;
			const r = sim.dispatch({
				type: 'action',
				vessel: payload.id,
				part: part.id,
				module: 'fix.awake',
				action: 'push',
				args: [n * vesselMass(sim, payload)]
			});
			expect(r.ok).toBe(true);
		};
		// away at about half a metre a second: the payload's axes are its turned-over port's, so
		// its -Y points away from the carrier
		push(0.5);
		let t = 0;
		for (; t < 60 && gap(sim) < 9; t += 0.02) sim.step(0.02);
		expect(sim.snapshot().vessels).toHaveLength(2);
		console.log(`re-dock: ${gap(sim).toFixed(2)} m apart after ${t.toFixed(1)} s`);
		// and back, closing at about 0.2 m/s
		push(-(relSpeed() + 0.2));
		for (t = 0; t < 90 && sim.snapshot().vessels.length > 1; t += 0.02) sim.step(0.02);
		console.log(`re-dock: one vessel after ${t.toFixed(1)} s`);
		expect(sim.snapshot().vessels).toHaveLength(1);
		expect(ports(sim).every((q) => q.state.docked)).toBe(true);
		sim.dispose();
	}, 60_000);
});
