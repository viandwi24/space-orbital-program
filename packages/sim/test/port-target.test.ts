/**
 * Plan 310, ADR 0270: a docking-port target is measured from the own control port to the target
 * port, and the controls act in the control part's axes.
 */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type CommandResult,
	type EntityId,
	type Vec3,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim } from '../src/index.ts';
import { orbitState } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

/** Probe core, a docking port on top (tilted by `tilt` about X), wheel, monopropellant and four RCS blocks. */
const craft = (name: string, tilt = 0): VesselDesign =>
	({
		formatVersion: 3,
		name,
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			{
				index: 1,
				part: partId('stock.docking-port'),
				parent: { index: 0, parentNode: 'top', node: 'bottom' },
				...(tilt !== 0 ? { tilt: { x: tilt, y: 0, z: 0 } } : {})
			},
			{
				index: 2,
				part: partId('stock.reaction-wheel'),
				parent: { index: 0, parentNode: 'bottom', node: 'top' }
			},
			{
				index: 3,
				part: partId('stock.monoprop-tank'),
				parent: { index: 2, parentNode: 'bottom', node: 'top' }
			},
			...[0, 1, 2, 3].map((k) => ({
				index: 4 + k,
				part: partId('stock.rcs-block'),
				parent: {
					index: 3,
					parentNode: 'surface',
					node: 'radial',
					radial: { angle: (k * Math.PI) / 2, y: 0 }
				}
			}))
		],
		stages: []
	}) as VesselDesign;

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const face = (v: VesselSnapshot): Vec3 => add(v.position, v.ports![0]!.position);

async function pair(tilt = 0) {
	const sim = await createSim({ plugins: [Stock], backendFactory: rapier(), seed: 5 });
	const s = orbitState(sim, 100_000);
	const a = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: craft('Alpha', tilt),
			placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
		})
	);
	const b = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: craft('Beta'),
			placement: {
				kind: 'state',
				position: { ...s.position, z: s.position.z - 30 },
				velocity: { ...s.velocity, x: s.velocity.x + 0.2 },
				orientation: { x: 0, y: 0, z: 0, w: 1 }
			}
		})
	);
	const v = (id: EntityId) => sim.snapshot().vessels.find((x) => x.id === id)!;
	return { sim, a, b, v };
}

describe('port targets and control from a port (plan 310)', () => {
	test('target.position and velocity run from the own control port to the target port', async () => {
		const { sim, a, b, v } = await pair();
		const portA = v(a).ports![0]!.part;
		const portB = v(b).ports![0]!.part;
		expect(
			sim.dispatch({
				type: 'target-set',
				vessel: a,
				target: { kind: 'vessel', id: b, part: portB }
			})
		).toMatchObject({ ok: true });
		// from the centre of mass while not controlled from the port
		const before = v(a).target!;
		expect(len(sub(before.position, sub(face(v(b)), face(v(a)))))).toBeGreaterThan(0.1);
		expect(sim.dispatch({ type: 'set-control-part', vessel: a, part: portA })).toMatchObject({
			ok: true
		});
		for (const step of [0, 1]) {
			if (step) {
				// in flight too: a stick tap wakes it
				sim.dispatch({ type: 'attitude', vessel: a, pitch: 0.2, yaw: 0, roll: 0 });
				for (let i = 0; i < 25; i++) sim.step(0.02);
			}
			const snapA = v(a);
			const snapB = v(b);
			const t = snapA.target!;
			expect(t.kind === 'vessel' && t.part).toBe(portB);
			expect(len(sub(t.position, sub(face(snapB), face(snapA))))).toBeLessThan(1e-3);
			expect(t.distance).toBeCloseTo(len(t.position), 9);
			if (!step) {
				expect(len(sub(t.velocity, sub(snapB.velocity, snapA.velocity)))).toBeLessThan(1e-6);
				continue;
			}
			// turning, the port moves with the spin: the velocity is the rate of the port-to-port line
			sim.step(0.02);
			const rate = sub(v(a).target!.position, t.position);
			const mean = {
				x: (t.velocity.x + v(a).target!.velocity.x) / 2,
				y: (t.velocity.y + v(a).target!.velocity.y) / 2,
				z: (t.velocity.z + v(a).target!.velocity.z) / 2
			};
			expect(len(sub({ x: rate.x / 0.02, y: rate.y / 0.02, z: rate.z / 0.02 }, mean))).toBeLessThan(
				0.02
			);
			expect(len(sub(mean, sub(v(b).velocity, v(a).velocity)))).toBeGreaterThan(0.1);
		}
		sim.dispose();
	}, 60_000);

	test('RCS translate "forward" pushes along a sideways control port', async () => {
		const { sim, a, b, v } = await pair(Math.PI / 2);
		const port = v(a).ports![0]!;
		// the port faces sideways: across the vessel's nose (+Y)
		expect(Math.abs(dot(port.direction, { x: 0, y: 1, z: 0 }))).toBeLessThan(0.05);
		expect(sim.dispatch({ type: 'set-control-part', vessel: a, part: port.part })).toMatchObject({
			ok: true
		});
		sim.dispatch({ type: 'set-rcs', vessel: a, on: true });
		sim.dispatch({ type: 'sas', vessel: a, mode: 'hold' });
		// Beta drifts free beside it: the change of the relative velocity is the thrust's alone
		const rel = () => sub(v(a).velocity, v(b).velocity);
		const r0 = rel();
		sim.dispatch({
			type: 'attitude',
			vessel: a,
			pitch: 0,
			yaw: 0,
			roll: 0,
			translate: { x: 0, y: 1, z: 0 }
		});
		// a short push: the thrusters sit off the centre of mass and turn the vessel a little
		for (let i = 0; i < 15; i++) sim.step(0.02);
		const dv = sub(rel(), r0);
		const dir = v(a).ports![0]!.direction;
		expect(len(dv)).toBeGreaterThan(0.01);
		expect(dot(dv, dir) / len(dv)).toBeGreaterThan(0.9);
		sim.dispose();
	}, 60_000);
});
