/**
 * Free placement in the sim (plan 279, ADR 0258): a design with offset and tilted parts flies with
 * the moved colliders, mass and centre of mass; ports tilted 90 degrees about different axes dock
 * along their own axes and undock.
 */
import { describe, expect, test } from 'bun:test';
import {
	mat3Apply,
	mat3OfQuat,
	partId,
	quatOfMat3,
	resolveVesselDesign,
	rotationBetween,
	type CommandResult,
	type EntityId,
	type Plugin,
	type Vec3,
	type VesselDesign
} from '@orbital/core';
import { add, length, scale, sub } from '@orbital/kepler';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { PART, VESSEL } from '../src/state.ts';
import { orbitState, partMasses, vesselMass } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

/** `fix.awake`: a negligible torque every step keeps an idle vessel in flight (as in docking.test.ts). */
const awake: Plugin = definePlugin({
	meta: { id: 'fix', version: '1.0.0', api: '^0.1' },
	depends: ['stock'],
	setup(ctx) {
		ctx.modules.register(
			defineModule({
				id: 'fix.awake',
				update(c) {
					c.vessel.applyTorque({ x: 1e-9, y: 0, z: 0 });
				},
				actions: { wake: () => {} }
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

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const v3 = (v: Vec3): [number, number, number] => [v.x, v.y, v.z];

/** A tank with the awake part below and a port on top, the port tilted and offset. */
const tiltedPort = (
	name: string,
	tilt: { x: number; y: number; z: number },
	offset = { x: 0, y: 0.05, z: 0.1 }
): VesselDesign => ({
	formatVersion: 4,
	name,
	parts: [
		{ index: 0, part: partId('stock.tank-small'), parent: null },
		{
			index: 1,
			part: partId('fix.awake'),
			parent: { index: 0, parentNode: 'bottom', node: 'top' }
		},
		{
			index: 2,
			part: partId('stock.docking-port'),
			parent: { index: 0, parentNode: 'top', node: 'bottom' },
			tilt,
			offset
		}
	],
	stages: []
});

describe('free placement in the sim (plan 279)', () => {
	test('offset and tilted parts sit where the design puts them: colliders, mass and centre of mass', async () => {
		const sim = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 1 });
		const s = orbitState(sim, 200_000);
		const design = tiltedPort('Moved', { x: 0.4, y: -2.2, z: 1.9 });
		const plain: VesselDesign = {
			...design,
			name: 'Plain',
			parts: design.parts.map(({ tilt: _t, offset: _o, ...p }) => p)
		};
		const ids = [design, plain].map((d) =>
			loaded(
				sim.dispatch({
					type: 'load-vessel',
					design: d,
					placement: { kind: 'state', ...s, orientation: IDENTITY }
				})
			)
		);
		const resolved = resolveVesselDesign(design, sim.registries.parts);
		if (!resolved.ok) throw new Error(resolved.errors.join('; '));
		const want = resolved.parts[2]!;
		const v = sim.snapshot().vessels.find((x) => x.id === ids[0])!;
		const port = v.parts.find((p) => p.definition === 'stock.docking-port')!;
		// the part's pose (what its collider box is built from) is the resolved one
		const state = sim.world.get(port.id, PART)!;
		expect(length(sub(state.designPos, want.position))).toBeLessThan(1e-12);
		expect(state.rotation).toEqual(want.rotation);
		// the snapshot reports it relative to the root; with an identity attitude that is the design frame
		expect(length(sub(port.position, want.position))).toBeLessThan(1e-9);
		// the centre of mass is the mass-weighted mean of the parts where they stand
		const masses = partMasses(sim, v);
		const total = vesselMass(sim, v);
		let c: Vec3 = { x: 0, y: 0, z: 0 };
		v.parts.forEach((p, i) => {
			const off = sim.registries.parts.get(p.definition)!.centerOfMass;
			const centre = off ? add(p.position, mat3Apply(mat3OfQuat(p.orientation), off)) : p.position;
			c = add(c, scale(centre, masses[i]! / total));
		});
		const com = sub(sim.world.get(ids[0]!, VESSEL)!.com, v.position);
		expect(length(sub(com, c))).toBeLessThan(1e-6);
		// and it differs from the plain design's by the port's shift alone
		const p = sim.snapshot().vessels.find((x) => x.id === ids[1])!;
		const plainPort = p.parts.find((q) => q.definition === 'stock.docking-port')!;
		expect(length(sub(port.position, plainPort.position))).toBeGreaterThan(0.05);
		sim.dispose();
	}, 60_000);

	test('ports tilted 90 degrees about different axes face each other, dock and undock', async () => {
		// Alpha's face turns from +Y to -X (about Z), Beta's from +Y to +Z (about X); each is offset 0.8 m
		// outward so it stands clear of its tank (a port tilted on the tank's top alone would sit inside
		// the tank's radius and the tanks would touch first)
		const ALPHA = tiltedPort('Alpha', { x: 0, y: 0, z: Math.PI / 2 }, { x: -0.8, y: 0, z: 0 });
		const BETA = tiltedPort('Beta', { x: Math.PI / 2, y: 0, z: 0 }, { x: 0, y: 0, z: 0.8 });
		const face = (sim: Sim, id: EntityId) => {
			const v = sim.snapshot().vessels.find((x) => x.id === id)!;
			const port = v.ports![0]!;
			return {
				at: add(v.position, port.position),
				dir: port.direction,
				com: sim.world.get(id, VESSEL)!.com
			};
		};
		const wake = (sim: Sim, id: EntityId) => {
			const v = sim.snapshot().vessels.find((x) => x.id === id)!;
			const part = v.parts.find((p) => p.definition === 'fix.awake')!;
			const r = sim.dispatch({
				type: 'action',
				vessel: id,
				part: part.id,
				module: 'fix.awake',
				action: 'wake'
			});
			if (!r.ok) throw new Error(r.reason);
		};
		const sim = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 3 });
		const s = orbitState(sim, 200_000);
		const a = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: ALPHA,
				placement: { kind: 'state', ...s, orientation: IDENTITY }
			})
		);
		const fa = face(sim, a);
		expect(fa.dir.x).toBeCloseTo(-1, 9);
		// Beta's orientation and where its face sits from its centre of mass, found in a scratch sim
		const scratch = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 3 });
		const own = face(
			scratch,
			loaded(
				scratch.dispatch({
					type: 'load-vessel',
					design: BETA,
					placement: { kind: 'state', ...s, orientation: IDENTITY }
				})
			)
		).dir;
		expect(own.z).toBeCloseTo(1, 9);
		const q = quatOfMat3(rotationBetween(v3(own), v3(scale(fa.dir, -1))));
		const fb = face(
			scratch,
			loaded(
				scratch.dispatch({
					type: 'load-vessel',
					design: BETA,
					placement: {
						kind: 'state',
						position: add(s.position, { x: 0, y: 200, z: 0 }),
						velocity: s.velocity,
						orientation: q
					}
				})
			)
		);
		const comToFace = sub(fb.at, fb.com);
		scratch.dispose();
		// Beta 1 m out along Alpha's face, closing at 0.2 m/s
		const at = add(fa.at, fa.dir);
		const b = loaded(
			sim.dispatch({
				type: 'load-vessel',
				design: BETA,
				placement: {
					kind: 'state',
					position: sub(at, comToFace),
					velocity: sub(s.velocity, scale(fa.dir, 0.2)),
					orientation: q
				}
			})
		);
		const fb2 = face(sim, b);
		expect(length(sub(fb2.at, at))).toBeLessThan(1e-6);
		expect(fb2.dir.x).toBeCloseTo(1, 9);
		wake(sim, a);
		wake(sim, b);
		const before = sim.snapshot().vessels.reduce((m, v) => m + vesselMass(sim, v), 0);
		let t = 0;
		for (; t < 15 && sim.snapshot().vessels.length > 1; t += 0.02) sim.step(0.02);
		expect(sim.snapshot().vessels).toHaveLength(1);
		console.log(`tilted ports: captured after ${t.toFixed(2)} s`);
		const merged = sim.snapshot().vessels[0]!;
		const port = merged.parts.find((p) => p.definition === 'stock.docking-port')!;
		expect(
			sim.dispatch({
				type: 'action',
				vessel: merged.id,
				part: port.id,
				module: 'stock.docking-port',
				action: 'undock'
			}).ok
		).toBe(true);
		sim.step(0.02);
		expect(
			sim
				.snapshot()
				.vessels.map((v) => v.name ?? '')
				.sort()
		).toEqual(['Alpha', 'Beta']);
		const after = sim.snapshot().vessels.reduce((m, v) => m + vesselMass(sim, v), 0);
		expect(Math.abs(after - before) / before).toBeLessThan(1e-9);
		sim.dispose();
	}, 60_000);
});
