/**
 * Auto Dock in the headless sim (plan 310): a chaser 200 m behind a station in the same orbit docks
 * with the station's port within 15 minutes of sim time; from behind the port it aborts; without a
 * control port or a target port it refuses to start.
 */
import { describe, expect, test } from 'bun:test';
import {
	partId,
	type CommandResult,
	type EntityId,
	type Quat,
	type VesselDesign
} from '@orbital/sdk';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import AutoDockMod, { MAX_START_DISTANCE } from '../src/index.ts';

type Part = VesselDesign['parts'][number];
const link = (index: number, part: string, parent: number, parentNode = 'bottom'): Part => ({
	index,
	part: partId(part),
	parent: { index: parent, parentNode, node: parentNode === 'top' ? 'bottom' : 'top' }
});
const rcs = (first: number, on: number): Part[] =>
	[0, 1, 2, 3].map((k) => ({
		index: first + k,
		part: partId('stock.rcs-block'),
		parent: {
			index: on,
			parentNode: 'surface',
			node: 'radial',
			radial: { angle: (k * Math.PI) / 2, y: 0 }
		}
	}));

/** Probe core, a port on top, wheel, monopropellant, four RCS blocks. */
const chaser = (): VesselDesign =>
	({
		formatVersion: 3,
		name: 'Chaser',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			link(1, 'stock.docking-port', 0, 'top'),
			link(2, 'stock.reaction-wheel', 0),
			link(3, 'stock.monoprop-tank', 2),
			...rcs(4, 3)
		],
		stages: []
	}) as VesselDesign;

/** A heavier station: probe core, a port on top, wheel and two tanks. */
const station = (): VesselDesign =>
	({
		formatVersion: 3,
		name: 'Station',
		parts: [
			{ index: 0, part: partId('stock.probe-core'), parent: null },
			link(1, 'stock.docking-port', 0, 'top'),
			link(2, 'stock.reaction-wheel', 0),
			link(3, 'stock.tank-medium', 2),
			link(4, 'stock.tank-medium', 3)
		],
		stages: []
	}) as VesselDesign;

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const about = (axis: 'x', angle: number): Quat => ({
	x: axis === 'x' ? Math.sin(angle / 2) : 0,
	y: 0,
	z: 0,
	w: Math.cos(angle / 2)
});

/**
 * Both in one circular equatorial orbit; the station's port faces backwards along the track (+Z,
 * the orbit runs toward -Z) and the chaser trails it by `behind` m (negative: ahead of it).
 */
async function scene(behind: number): Promise<{ sim: Sim; a: EntityId; b: EntityId }> {
	const sim = await createSim({
		plugins: [Stock, AutoDockMod],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		seed: 4
	});
	const mu = 6.6743e-11 * sim.registries.bodies.get(sim.home)!.mass;
	const r = sim.registries.bodies.get(sim.home)!.radius + 100_000;
	const v = Math.sqrt(mu / r);
	const b = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: station(),
			placement: {
				kind: 'state',
				position: { x: r, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -v },
				orientation: about('x', Math.PI / 2)
			}
		})
	);
	// the chaser's port faces up its own +Y: the autopilot turns it round
	const a = loaded(
		sim.dispatch({
			type: 'load-vessel',
			design: chaser(),
			placement: {
				kind: 'state',
				position: { x: r, y: 0, z: behind },
				velocity: { x: 0, y: 0, z: -v },
				orientation: { x: 0, y: 0, z: 0, w: 1 }
			}
		})
	);
	sim.dispatch({ type: 'sas', vessel: b, mode: 'hold' });
	return { sim, a, b };
}

const snap = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id);
/** Control from the chaser's port and target the station's. */
function prepare(sim: Sim, a: EntityId, b: EntityId): void {
	const own = snap(sim, a)!.ports![0]!.part;
	const theirs = snap(sim, b)!.ports![0]!.part;
	expect(sim.dispatch({ type: 'set-control-part', vessel: a, part: own })).toMatchObject({
		ok: true
	});
	expect(
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b, part: theirs } })
	).toMatchObject({ ok: true });
}

describe('Auto Dock (plan 310)', () => {
	test('docks a chaser 200 m away within 15 minutes of sim time', async () => {
		const { sim, a, b } = await scene(200);
		prepare(sim, a, b);
		const ended: Array<{ outcome: string; reason: string }> = [];
		let docked = false;
		sim.events.on('autopilot:ended', (e) => ended.push(e));
		sim.events.on('vessel:docked', () => (docked = true));
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'autodock.dock' })
		).toEqual({
			ok: true
		});
		const phases = new Set<string>();
		const start = sim.time;
		let lastLog = start;
		while (!docked && sim.time - start < 15 * 60 && ended.length === 0) {
			for (let i = 0; i < 50; i++) sim.step(0.02);
			const p = snap(sim, a)?.autopilot;
			if (p) phases.add(p.phase);
			if (p && sim.time - lastLog >= 60) {
				lastLog = sim.time;
				console.log(`autodock t+${Math.round(sim.time - start)} s ${p.phase}: ${p.status}`);
			}
		}
		const took = sim.time - start;
		console.log(
			`autodock: ${docked ? `docked after ${took.toFixed(0)} s` : 'not docked'}; ended ${JSON.stringify(ended)}`
		);
		expect(docked).toBe(true);
		expect(took).toBeLessThan(15 * 60);
		expect([...phases]).toEqual(expect.arrayContaining(['align', 'approach']));
		expect(ended).toEqual([expect.objectContaining({ outcome: 'done', reason: 'docked' })]);
		expect(sim.snapshot().vessels.filter((v) => v.id === a || v.id === b)).toHaveLength(1);
		sim.dispose();
	}, 300_000);

	test('aborts from behind the target port', async () => {
		const { sim, a, b } = await scene(-100);
		prepare(sim, a, b);
		const ended: unknown[] = [];
		sim.events.on('autopilot:ended', (e) => ended.push(e));
		expect(
			sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'autodock.dock' })
		).toEqual({
			ok: true
		});
		for (let i = 0; i < 50 && ended.length === 0; i++) sim.step(0.02);
		expect(ended).toEqual([
			{
				vessel: a,
				autopilot: 'autodock.dock',
				outcome: 'aborted',
				reason: expect.stringContaining('Behind')
			}
		]);
		expect(snap(sim, a)!.autopilot).toBeUndefined();
		sim.dispose();
	}, 60_000);

	test('refuses to start without a control port, a target port, or from too far', async () => {
		const { sim, a, b } = await scene(200);
		const engage = () =>
			sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'autodock.dock' });
		expect(engage()).toMatchObject({
			ok: false,
			reason: expect.stringContaining('Control from a docking port')
		});
		const own = snap(sim, a)!.ports![0]!.part;
		sim.dispatch({ type: 'set-control-part', vessel: a, part: own });
		sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } });
		expect(engage()).toMatchObject({
			ok: false,
			reason: expect.stringContaining('Target a docking port')
		});
		sim.dispose();
		const far = await scene(MAX_START_DISTANCE + 100);
		prepare(far.sim, far.a, far.b);
		expect(
			far.sim.dispatch({ type: 'autopilot-engage', vessel: far.a, autopilot: 'autodock.dock' })
		).toMatchObject({ ok: false, reason: expect.stringContaining('Come within') });
		far.sim.dispose();
	}, 60_000);
});
