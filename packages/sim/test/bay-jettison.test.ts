/**
 * Plan 390 (ADR 0334): opening a bay and letting its payload go does not throw the ship. Far from
 * any planet gravity is a rounding error, so what a vessel's velocity and attitude do in the
 * second after the release is the release's push. The two cases the owner reported are in
 * `apps/web/src/lib/editor/owner-fling-cases.test.ts`, on the real blueprints.
 */
import { describe, expect, test } from 'bun:test';
import { partId, type EntityId, type Quat, type VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { RADIUS } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

const FAR = { x: 0, y: 4e8, z: 0 };
const node = (index: number, part: string, parent: VesselDesign['parts'][number]['parent']) => ({
	index,
	part: partId(part),
	parent
});

const turn = (a: Quat, b: Quat): number =>
	(2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w))) * 180) /
	Math.PI;

async function load(design: VesselDesign): Promise<{ sim: Sim; id: EntityId }> {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 1 });
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', body: 'stock.home', position: FAR, velocity: { x: 0, y: 0, z: 0 } }
	} as never);
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return { sim, id: r.vessel };
}
const act = (sim: Sim, vessel: EntityId, part: EntityId, module: string, action: string) =>
	sim.dispatch({ type: 'action', vessel, part, module, action } as never);
const vesselWith = (sim: Sim, part: string) =>
	sim.snapshot().vessels.find((v) => v.parts.some((p) => p.definition === part));

describe('bays that let a payload go (plan 390)', () => {
	test('petals with a payload: opening them leaves the ring and the payload where they were', async () => {
		// the payload on the ring's inner seat (a 1.25 m tank, as the lander rides)
		const design: VesselDesign = {
			formatVersion: 4,
			name: 'Petals',
			parts: [
				node(0, 'stock.payload-petals', null),
				node(1, 'stock.tank-small', { index: 0, parentNode: 'inner', node: 'bottom' })
			],
			stages: [[0]]
		};
		const { sim, id } = await load(design);
		try {
			for (let i = 0; i < 25; i++) sim.step(0.02);
			const before = sim.snapshot().vessels.find((v) => v.id === id)!;
			expect(act(sim, id, before.parts[0]!.id, 'stock.bay', 'open').ok).toBe(true);
			for (let i = 0; i < 10; i++) sim.step(0.02);
			const after = sim.snapshot().vessels.find((v) => v.id === id)!;
			const dv = Math.hypot(
				after.velocity.x - before.velocity.x,
				after.velocity.y - before.velocity.y,
				after.velocity.z - before.velocity.z
			);
			expect(dv).toBeLessThan(0.05);
			// 10 steps: 0.2 s, an angular speed under 0.01 rad/s is under 0.12° of turn
			expect(turn(before.orientation, after.orientation)).toBeLessThan(0.12);
			expect(
				sim
					.snapshot()
					.vessels.filter((v) => v.parts.some((p) => p.definition.startsWith('stock.petal-panel')))
			).toHaveLength(4);
		} finally {
			sim.dispose();
		}
	}, 60_000);

	test('a 1 t payload let go of a cargo bay leaves the carrier with |Δv| < 0.1 m/s and |Δω| < 0.01 rad/s', async () => {
		const design: VesselDesign = {
			formatVersion: 4,
			name: 'Hold',
			parts: [
				node(0, 'stock.cargo-bay', null),
				node(1, 'stock.decoupler', { index: 0, parentNode: 'inner', node: 'bottom' }),
				node(2, 'stock.tank-small', { index: 1, parentNode: 'top', node: 'bottom' })
			],
			stages: [[1]]
		};
		const { sim, id } = await load(design);
		try {
			expect(
				act(
					sim,
					id,
					sim.snapshot().vessels.find((v) => v.id === id)!.parts[0]!.id,
					'stock.bay',
					'open'
				).ok
			).toBe(true);
			for (let i = 0; i < 200; i++) sim.step(0.02); // the doors are open and the ship is still
			const before = vesselWith(sim, 'stock.cargo-bay')!;
			const idBefore = before.id;
			const decoupler = before.parts.find((p) => p.definition === 'stock.decoupler')!;
			expect(act(sim, idBefore, decoupler.id, 'stock.decoupler', 'decouple').ok).toBe(true);
			const parted = sim.snapshot().vessels;
			expect(parted).toHaveLength(2);
			const t0 = vesselWith(sim, 'stock.cargo-bay')!;
			for (let i = 0; i < 50; i++) sim.step(0.02);
			const after = vesselWith(sim, 'stock.cargo-bay')!;
			const dv = Math.hypot(
				after.velocity.x - t0.velocity.x,
				after.velocity.y - t0.velocity.y,
				after.velocity.z - t0.velocity.z
			);
			expect(dv).toBeLessThan(0.1);
			expect(turn(t0.orientation, after.orientation)).toBeLessThan(0.57); // 0.01 rad/s over 1 s
		} finally {
			sim.dispose();
		}
	}, 60_000);

	test('a decoupler inside a closed bay is refused by name, and goes once the bay is open', async () => {
		const design: VesselDesign = {
			formatVersion: 4,
			name: 'Hold',
			parts: [
				node(0, 'stock.cargo-bay', null),
				node(1, 'stock.decoupler', { index: 0, parentNode: 'inner', node: 'bottom' }),
				node(2, 'stock.tank-small', { index: 1, parentNode: 'top', node: 'bottom' }),
				node(3, 'stock.command-pod', { index: 0, parentNode: 'top', node: 'bottom' })
			],
			stages: [[1]]
		};
		const { sim, id } = await load(design);
		try {
			const v = sim.snapshot().vessels.find((x) => x.id === id)!;
			const bay = v.parts[0]!;
			const decoupler = v.parts.find((p) => p.definition === 'stock.decoupler')!;
			const refused = act(sim, id, decoupler.id, 'stock.decoupler', 'decouple');
			expect(refused.ok).toBe(false);
			expect(refused.ok ? '' : refused.reason).toMatch(/RS-CB25.*closed/);
			expect(sim.snapshot().vessels).toHaveLength(1);
			// staging fires nothing else here, and does not throw
			const blocked: string[] = [];
			sim.events.on('stage:blocked', (e: { reason: string }) => blocked.push(e.reason));
			const staged = sim.dispatch({ type: 'stage', vessel: id } as never);
			expect(staged.ok ? '' : staged.reason).toBe('');
			expect(blocked).toHaveLength(1);
			expect(sim.snapshot().vessels).toHaveLength(1);
			expect(act(sim, id, bay.id, 'stock.bay', 'open').ok).toBe(true);
			for (let i = 0; i < 200; i++) sim.step(0.02);
			expect(act(sim, id, decoupler.id, 'stock.decoupler', 'decouple').ok).toBe(true);
			expect(sim.snapshot().vessels).toHaveLength(2);
		} finally {
			sim.dispose();
		}
	}, 60_000);

	test('a part inside a closed bay takes no air; with the doors open it does (plan 281, folded into 390)', async () => {
		const design: VesselDesign = {
			formatVersion: 4,
			name: 'Hold',
			parts: [
				node(0, 'stock.cargo-bay', null),
				node(1, 'stock.tank-small', { index: 0, parentNode: 'inner', node: 'bottom' })
			],
			stages: [[0]]
		};
		const drag = async (open: boolean): Promise<number> => {
			const sim = await createSim({ plugins: [Stock], backendFactory: rapier(16), seed: 1 });
			try {
				const loaded = sim.dispatch({
					type: 'load-vessel',
					design,
					placement: {
						kind: 'state',
						body: 'stock.home',
						position: { x: RADIUS + 2_000, y: 0, z: 0 },
						velocity: { x: 0, y: 0.8 * 332, z: 0 },
						// nose into the flow (+Y), so the ship holds its attitude through the opening
						orientation: { x: 0, y: 0, z: 0, w: 1 }
					}
				} as never);
				if (!loaded.ok || loaded.vessel === undefined)
					throw new Error(loaded.ok ? 'no vessel' : loaded.reason);
				const id = loaded.vessel;
				if (open) {
					const bay = sim.snapshot().vessels.find((v) => v.id === id)!.parts[0]!;
					expect(act(sim, id, bay.id, 'stock.bay', 'open').ok).toBe(true);
					for (let i = 0; i < 250; i++) sim.step(0.02);
				}
				const before = sim.snapshot().vessels.find((v) => v.id === id)!;
				sim.step(0.02);
				const after = sim.snapshot().vessels.find((v) => v.id === id)!;
				// along the flow, per unit of dynamic pressure: gravity pulls across it
				return (before.velocity.y - after.velocity.y) / (before.velocity.y * before.velocity.y);
			} finally {
				sim.dispose();
			}
		};
		const closed = await drag(false);
		const opened = await drag(true);
		console.log(
			`bay drag step: closed ${closed.toExponential(3)}, open ${opened.toExponential(3)} (Δv/v² per step)`
		);
		expect(opened).toBeGreaterThan(closed);
	}, 60_000);
});
