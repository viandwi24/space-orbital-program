/** Docking (plan 222, ADR 0218): capture and merge, undock and restore, crossfeed, determinism. */
import { describe, expect, test } from 'bun:test';
import type { CommandResult, EntityId, Plugin, Quat, Vec3, VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineModule, definePlugin } from '@orbital/sdk';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState, vesselMass } from './helpers/measure.ts';
import { rapier, stack } from './helpers/vessels.ts';

/** `fix.awake`: a negligible torque every step keeps an idle vessel in flight (not on rails). */
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
				// an action wakes an uncontrolled vessel into flight
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

const quatAboutX = (a: number): Quat => ({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) });
const quatMul = (a: Quat, b: Quat): Quat => ({
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
});
const quatAboutZ = (a: number): Quat => ({ x: 0, y: 0, z: Math.sin(a / 2), w: Math.cos(a / 2) });

interface Setup {
	sim: Sim;
	a: EntityId;
	b: EntityId;
}

/**
 * Alpha's port faces +Y (its root, identity orientation); Beta, turned over, faces it from `gap`
 * m further along +Y, closing at `closing` m/s, its axis `offAxis` rad off.
 */
async function approach(
	closing: number,
	offAxis = 0,
	designs: { a?: VesselDesign; b?: VesselDesign } = {},
	gap = 5
): Promise<Setup> {
	const sim = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 3 });
	const s = orbitState(sim, 200_000);
	const a = sim.dispatch({
		type: 'load-vessel',
		design:
			designs.a ?? stack('Alpha', ['stock.docking-port', 'stock.tank-small', 'fix.awake'], []),
		placement: { kind: 'state', ...s, orientation: { x: 0, y: 0, z: 0, w: 1 } }
	});
	if (!a.ok) throw new Error(a.reason);
	// both port roots are 0.3 m tall: faces 0.15 m from each root
	const offset: Vec3 = { x: 0, y: gap + 0.3, z: 0 };
	const b = sim.dispatch({
		type: 'load-vessel',
		design: designs.b ?? stack('Beta', ['stock.docking-port', 'stock.tank-small', 'fix.awake'], []),
		placement: {
			kind: 'state',
			position: {
				x: s.position.x + offset.x,
				y: s.position.y + offset.y,
				z: s.position.z + offset.z
			},
			velocity: { x: s.velocity.x, y: s.velocity.y - closing, z: s.velocity.z },
			orientation: quatMul(quatAboutZ(offAxis), quatAboutX(Math.PI))
		}
	});
	if (!b.ok) throw new Error(b.reason);
	for (const id of [a.vessel!, b.vessel!]) {
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
	}
	sim.step(0.02);
	return { sim, a: a.vessel!, b: b.vessel! };
}

const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < seconds * 50; i++) sim.step(0.02);
};
const names = (sim: Sim) =>
	sim
		.snapshot()
		.vessels.map((v) => v.name ?? '')
		.sort();

/** The vessel a `load-vessel` made; throws on a refusal. */
const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};

describe('docking (plan 222)', () => {
	test('aligned ports 5 m apart closing at 0.2 m/s become one vessel within 10 s', async () => {
		const { sim, a } = await approach(0.2);
		const docked: unknown[] = [];
		sim.events.on('vessel:docked', (e) => docked.push(e));
		let t = 0;
		for (; t < 10 && sim.snapshot().vessels.length > 1; t += 0.02) sim.step(0.02);
		expect(sim.snapshot().vessels).toHaveLength(1);
		expect(sim.snapshot().vessels[0]!.id).toBe(a);
		expect(docked).toHaveLength(1);
		console.log(`docking: captured after ${t.toFixed(2)} s`);
		sim.dispose();
	}, 60_000);

	test('at 3 m/s, or 30 degrees off the axis, they do not', async () => {
		for (const [closing, off] of [
			[3, 0],
			[0.2, Math.PI / 6]
		] as const) {
			const { sim } = await approach(closing, off);
			run(sim, 10);
			expect(sim.snapshot().vessels.length, `${closing} m/s, ${off} rad`).toBe(2);
			sim.dispose();
		}
	}, 60_000);

	test('undock restores both names and designs; the mass is conserved', async () => {
		const { sim, a } = await approach(0.2);
		const before = sim.snapshot().vessels.reduce((m, v) => m + vesselMass(sim, v), 0);
		run(sim, 10);
		expect(sim.snapshot().vessels).toHaveLength(1);
		expect((await sim.designOf(a))!.design.parts).toHaveLength(6);
		const merged = sim.snapshot().vessels[0]!;
		const port = merged.parts.find((p) => p.definition === 'stock.docking-port')!;
		expect(
			sim.dispatch({
				type: 'action',
				vessel: a,
				part: port.id,
				module: 'stock.docking-port',
				action: 'undock'
			}).ok
		).toBe(true);
		sim.step(0.02);
		expect(names(sim)).toEqual(['Alpha', 'Beta']);
		const after = sim.snapshot().vessels.reduce((m, v) => m + vesselMass(sim, v), 0);
		expect(Math.abs(after - before) / before).toBeLessThan(1e-9);
		for (const v of sim.snapshot().vessels) {
			const record = (await sim.designOf(v.id))!;
			expect(record.design.name).toBe(v.name!);
			expect(record.parts).toEqual([0, 1, 2]);
		}
		sim.dispose();
	}, 60_000);

	for (const crossfeed of [true, false]) {
		test(`with crossfeed ${crossfeed ? 'on' : 'off'} the far side's tank ${crossfeed ? 'drains' : 'does not drain'}`, async () => {
			const { sim, a } = await approach(0.2, 0, {
				// a probe core to fly it: throttle and stage need a control source
				a: stack(
					'Alpha',
					['stock.docking-port', 'stock.engine-lv', 'stock.probe-core', 'fix.awake'],
					[[1]]
				)
			});
			run(sim, 10);
			expect(sim.snapshot().vessels).toHaveLength(1);
			const v = sim.snapshot().vessels[0]!;
			const ports = v.parts.filter((p) => p.definition === 'stock.docking-port');
			if (!crossfeed) {
				for (const p of ports) {
					sim.dispatch({
						type: 'action',
						vessel: a,
						part: p.id,
						module: 'stock.docking-port',
						action: 'setCrossfeed',
						args: [false]
					});
				}
			}
			const fuel = () => {
				const tank = sim
					.snapshot()
					.vessels[0]!.parts.find((p) => p.definition === 'stock.tank-small')!;
				return (tank.modules['stock.resource-container'] as { amounts: Record<string, number> })
					.amounts['stock.liquid-fuel']!;
			};
			const full = fuel();
			sim.dispatch({ type: 'throttle', vessel: a, value: 0.05 });
			sim.dispatch({ type: 'stage', vessel: a });
			run(sim, 2);
			if (crossfeed) expect(fuel()).toBeLessThan(full);
			else expect(fuel()).toBe(full);
			sim.dispose();
		}, 60_000);
	}

	test('targeting a port gives its alignment; a part that is not a port is refused', async () => {
		const { sim, a, b } = await approach(0.2, 0, {
			a: stack('Alpha', ['stock.docking-port', 'stock.probe-core', 'fix.awake'], [])
		});
		const beta = sim.snapshot().vessels.find((v) => v.id === b)!;
		const port = beta.parts.find((p) => p.definition === 'stock.docking-port')!;
		const tank = beta.parts.find((p) => p.definition === 'stock.tank-small')!;
		const set = (part: number) =>
			sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b, part } });
		expect(set(tank.id)).toMatchObject({
			ok: false,
			reason: expect.stringContaining('not a docking port')
		});
		expect(set(port.id)).toEqual({ ok: true });
		sim.step(0.02);
		const alpha = sim.snapshot().vessels.find((v) => v.id === a)!;
		// Alpha's port faces +Y (its root, unturned), its face 0.15 m above the root's origin
		expect(alpha.ports).toHaveLength(1);
		expect(alpha.ports![0]!).toMatchObject({ size: 1.25, free: true });
		expect(alpha.ports![0]!.direction.y).toBeCloseTo(1, 6);
		expect(alpha.ports![0]!.position.y).toBeCloseTo(0.15, 6);
		const align = alpha.target!.port!;
		expect(align.angle).toBeLessThan(0.5);
		expect(align.offset).toBeLessThan(0.05);
		// the probe core moves Alpha's centre of mass, so the gap is about, not exactly, 5 m
		expect(align.distance).toBeGreaterThan(3);
		expect(align.distance).toBeLessThan(7);
		expect(align.closing).toBeGreaterThan(0.1);
		sim.dispose();
	}, 60_000);

	test('a docked pair survives a save and resume; undock after it restores both names', async () => {
		const { sim, a } = await approach(0.2);
		run(sim, 10);
		expect(sim.snapshot().vessels).toHaveLength(1);
		const text = JSON.stringify(sim.save());
		const resumed = await createSim({
			plugins: [Stock, awake],
			backendFactory: rapier(),
			resume: JSON.parse(text)
		});
		expect(JSON.stringify(resumed.save())).toBe(text);
		const port = resumed
			.snapshot()
			.vessels[0]!.parts.find((p) => p.definition === 'stock.docking-port')!;
		expect(
			resumed.dispatch({
				type: 'action',
				vessel: a,
				part: port.id,
				module: 'stock.docking-port',
				action: 'undock'
			}).ok
		).toBe(true);
		resumed.step(0.02);
		expect(names(resumed)).toEqual(['Alpha', 'Beta']);
		sim.dispose();
		resumed.dispose();
	}, 60_000);

	test('the player types survive the dock, the undock and a save and resume (plan 237)', async () => {
		const { sim, a, b } = await approach(0.2);
		expect(sim.dispatch({ type: 'set-vessel-type', vessel: a, vesselType: 'station' }).ok).toBe(
			true
		);
		expect(sim.dispatch({ type: 'set-vessel-type', vessel: b, vesselType: 'relay' }).ok).toBe(true);
		run(sim, 10);
		expect(sim.snapshot().vessels).toHaveLength(1);
		const port = sim
			.snapshot()
			.vessels[0]!.parts.find((p) => p.definition === 'stock.docking-port')!;
		expect(
			sim.dispatch({
				type: 'action',
				vessel: sim.snapshot().vessels[0]!.id,
				part: port.id,
				module: 'stock.docking-port',
				action: 'undock'
			}).ok
		).toBe(true);
		sim.step(0.02);
		const typeOf = (x: Sim, name: string) =>
			x.snapshot().vessels.find((v) => v.name === name)?.type;
		expect([typeOf(sim, 'Alpha'), typeOf(sim, 'Beta')]).toEqual(['station', 'relay']);
		const resumed = await createSim({
			plugins: [Stock, awake],
			backendFactory: rapier(),
			resume: JSON.parse(JSON.stringify(sim.save()))
		});
		expect([typeOf(resumed, 'Alpha'), typeOf(resumed, 'Beta')]).toEqual(['station', 'relay']);
		sim.dispose();
		resumed.dispose();
	}, 60_000);

	test('a port vessel stays in flight within 50 m of another; farther it goes idle on rails', async () => {
		for (const [gap, mode] of [
			[30, 'flight'],
			[300, 'on-rails']
		] as const) {
			const sim = await createSim({ plugins: [Stock, awake], backendFactory: rapier(), seed: 3 });
			const s = orbitState(sim, 200_000);
			const at = (dy: number) => ({
				kind: 'state' as const,
				...s,
				position: { ...s.position, y: s.position.y + dy },
				orientation: { x: 0, y: 0, z: 0, w: 1 }
			});
			const a = sim.dispatch({
				type: 'load-vessel',
				design: stack('Alpha', ['stock.docking-port', 'stock.tank-small', 'fix.awake'], []),
				placement: at(0)
			});
			const b = sim.dispatch({
				type: 'load-vessel',
				design: stack('Station', ['stock.docking-port', 'stock.tank-small'], []),
				placement: at(gap)
			});
			const part = sim
				.snapshot()
				.vessels.find((v) => v.id === loaded(a))!
				.parts.find((p) => p.definition === 'fix.awake')!;
			sim.dispatch({
				type: 'action',
				vessel: loaded(a),
				part: part.id,
				module: 'fix.awake',
				action: 'wake'
			});
			run(sim, 6);
			const station = sim.snapshot().vessels.find((v) => v.id === loaded(b))!;
			expect(station.mode, `${gap} m`).toBe(mode);
			sim.dispose();
		}
	}, 60_000);

	test('the docking scenario run twice gives identical snapshots', async () => {
		const once = async () => {
			const { sim } = await approach(0.2);
			run(sim, 10);
			const snap = JSON.stringify(sim.snapshot());
			sim.dispose();
			return snap;
		};
		expect(await once()).toBe(await once());
	}, 60_000);
});
