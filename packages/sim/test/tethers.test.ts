/**
 * Tethers (plan 313, ADR 0272): a winch ties its rope on to another vessel's socket, reels it in,
 * snaps above its strength and is kept by a save; a strut lets go of its far end.
 */
import { describe, expect, test } from 'bun:test';
import type { EntityId, Snapshot, Vec3, VesselDesign } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createSim, type Sim } from '../src/index.ts';
import { orbitState, vesselMass } from './helpers/measure.ts';
import { rapier } from './helpers/vessels.ts';

type WinchView = { connected: boolean; length: number; tension: number; snapped: boolean };

const radial = (
	index: number,
	part: string,
	parent: number,
	angle: number,
	y: number,
	settings?: Record<string, Record<string, unknown>>
) => ({
	index,
	part,
	parent: { index: parent, parentNode: 'surface', node: 'radial', radial: { angle, y } },
	...(settings ? { settings } : {})
});

/** A tank with a probe core on top and a winch on its +X side. */
function winchVessel(winch: Record<string, unknown> = {}): VesselDesign {
	return {
		formatVersion: 3,
		name: 'Tug',
		parts: [
			{ index: 0, part: 'stock.tank-small', parent: null },
			{
				index: 1,
				part: 'stock.probe-core',
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			},
			radial(2, 'stock.winch', 0, 0, 0, { 'stock.winch': { power: 0, ...winch } })
		],
		stages: []
	} as unknown as VesselDesign;
}

/** A tank with a probe core and a socket on its -X side. */
function socketVessel(name = 'Cargo'): VesselDesign {
	return {
		formatVersion: 3,
		name,
		parts: [
			{ index: 0, part: 'stock.tank-small', parent: null },
			{
				index: 1,
				part: 'stock.probe-core',
				parent: { index: 0, parentNode: 'top', node: 'bottom' }
			},
			radial(2, 'stock.tether-socket', 0, Math.PI, 0)
		],
		stages: []
	} as unknown as VesselDesign;
}

const newSim = () => createSim({ plugins: [Stock], backendFactory: rapier(), seed: 7 });

function load(sim: Sim, design: VesselDesign, position: Vec3, velocity: Vec3): EntityId {
	const r = sim.dispatch({
		type: 'load-vessel',
		design,
		placement: { kind: 'state', position, velocity, orientation: { x: 0, y: 0, z: 0, w: 1 } }
	});
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
}

/** The tug and the cargo in orbit, `gap` m apart along +X (the tug's winch faces the cargo's socket). */
async function pair(gap: number, winch: Record<string, unknown> = {}) {
	const sim = await newSim();
	const s = orbitState(sim, 200_000);
	const tug = load(sim, winchVessel(winch), s.position, s.velocity);
	const cargo = load(sim, socketVessel(), { ...s.position, x: s.position.x + gap }, s.velocity);
	sim.step(0.02);
	return { sim, tug, cargo };
}

const vesselOf = (snap: Snapshot, id: EntityId) => snap.vessels.find((v) => v.id === id)!;
const winchOf = (sim: Sim, tug: EntityId) => {
	const part = vesselOf(sim.snapshot(), tug).parts.find((p) => p.definition === 'stock.winch')!;
	return { part, view: part.modules['stock.winch'] as WinchView };
};
const act = (sim: Sim, vessel: EntityId, part: EntityId, action: string, args?: unknown[]) => {
	const r = sim.dispatch({
		type: 'action',
		vessel,
		part,
		module: 'stock.winch',
		action,
		...(args ? { args } : {})
	});
	if (!r.ok) throw new Error(r.reason);
};
const run = (sim: Sim, seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) sim.step(0.02);
};
const gapOf = (sim: Sim, a: EntityId, b: EntityId): number => {
	const snap = sim.snapshot();
	const pa = vesselOf(snap, a).position;
	const pb = vesselOf(snap, b).position;
	return Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z);
};
const momentum = (sim: Sim, ids: EntityId[]): Vec3 => {
	const out = { x: 0, y: 0, z: 0 };
	for (const id of ids) {
		const v = vesselOf(sim.snapshot(), id);
		const m = vesselMass(sim, v);
		out.x += m * v.velocity.x;
		out.y += m * v.velocity.y;
		out.z += m * v.velocity.z;
	}
	return out;
};

describe('tethers (plan 313)', () => {
	test('Connect ties the rope on at the distance it finds, with no jerk; reeling in closes 10 m, momentum kept', async () => {
		const { sim, tug, cargo } = await pair(13);
		const w = winchOf(sim, tug);
		const p0 = momentum(sim, [tug, cargo]);
		const rel = () => {
			const a = vesselOf(sim.snapshot(), tug).velocity;
			const b = vesselOf(sim.snapshot(), cargo).velocity;
			return { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
		};
		const v0 = rel();
		act(sim, tug, w.part.id, 'connect');
		run(sim, 0.2);
		const tied = winchOf(sim, tug).view;
		expect(tied.connected).toBe(true);
		expect(tied.length).toBeGreaterThan(10);
		expect(tied.length).toBeLessThan(12);
		// tying on changes neither vessel's velocity (gravity moves both alike)
		const v1 = rel();
		expect(Math.hypot(v1.x - v0.x, v1.y - v0.y, v1.z - v0.z)).toBeLessThan(0.01);
		expect(winchOf(sim, tug).part.tether?.peerVessel).toBe(cargo);

		const g0 = gapOf(sim, tug, cargo);
		act(sim, tug, w.part.id, 'setReel', ['in']);
		run(sim, 25);
		const g1 = gapOf(sim, tug, cargo);
		console.log(
			`tethers: ${g0.toFixed(2)} m -> ${g1.toFixed(2)} m, rope ${winchOf(sim, tug).view.length.toFixed(2)} m`
		);
		expect(g0 - g1).toBeGreaterThan(9.5);
		// the same pair untied, for what gravity alone did over the 25 s
		const control = await pair(13);
		run(control.sim, 0.2 + 25);
		const p1 = momentum(sim, [tug, cargo]);
		const c0 = momentum(control.sim, [control.tug, control.cargo]);
		const scale = Math.hypot(p0.x, p0.y, p0.z);
		console.log(
			`tethers: momentum off by ${((Math.hypot(p1.x - c0.x, p1.y - c0.y, p1.z - c0.z) / scale) * 100).toFixed(4)} %`
		);
		expect(Math.hypot(p1.x - c0.x, p1.y - c0.y, p1.z - c0.z) / scale).toBeLessThan(1e-3);
		control.sim.dispose();
		sim.dispose();
	}, 60_000);

	test('above its strength the rope snaps; Release lets go', async () => {
		// (strength 40 left the second tie 4 % short of holding: the pull of the stretched rope was
		// 41.7 N once the pair stayed in flight beside a controlled vessel; plan 391)
		const { sim, tug, cargo } = await pair(13, { strength: 100, speed: 2 });
		const snapped: unknown[] = [];
		sim.events.on('tether:snapped', (e) => snapped.push(e));
		const w = winchOf(sim, tug);
		act(sim, tug, w.part.id, 'connect');
		run(sim, 0.2);
		act(sim, tug, w.part.id, 'setReel', ['in']);
		run(sim, 3);
		expect(snapped.length).toBe(1);
		const view = winchOf(sim, tug).view;
		expect(view.connected).toBe(false);
		expect(view.snapped).toBe(true);
		// the drum stopped with it
		expect((winchOf(sim, tug).part.modules['stock.winch'] as { reel: string }).reel).toBe('stop');
		// armed again, it ties on again; Release lets go for good
		act(sim, tug, w.part.id, 'connect');
		run(sim, 0.2);
		expect(winchOf(sim, tug).view.connected).toBe(true);
		act(sim, tug, w.part.id, 'release');
		run(sim, 0.2);
		expect(winchOf(sim, tug).view.connected).toBe(false);
		expect(winchOf(sim, tug).part.tether).toBeUndefined();
		expect(gapOf(sim, tug, cargo)).toBeGreaterThan(5);
		sim.dispose();
	}, 60_000);

	test('a save keeps the rope and its length', async () => {
		const { sim, tug } = await pair(13);
		const w = winchOf(sim, tug);
		act(sim, tug, w.part.id, 'connect');
		run(sim, 0.2);
		act(sim, tug, w.part.id, 'setReel', ['in']);
		run(sim, 3);
		act(sim, tug, w.part.id, 'setReel', ['stop']);
		run(sim, 0.1);
		const before = winchOf(sim, tug).view.length;
		const text = JSON.stringify(sim.save());
		const resumed = await createSim({
			plugins: [Stock],
			backendFactory: rapier(),
			resume: JSON.parse(text)
		});
		const after = winchOf(resumed, tug);
		expect(after.view.connected).toBe(true);
		expect(after.view.length).toBeCloseTo(before, 6);
		expect(after.part.tether).toBeDefined();
		resumed.step(0.02);
		expect(winchOf(resumed, tug).view.connected).toBe(true);
		resumed.dispose();
		sim.dispose();
	}, 60_000);

	test('a crane on the ground reels a 1 t load up 10 m', async () => {
		const sim = await newSim();
		// four wide tanks stand 15 m tall; the winch near the top faces east (+X)
		const crane: VesselDesign = {
			formatVersion: 3,
			name: 'Crane',
			parts: [
				{ index: 0, part: 'stock.tank-wide', parent: null },
				{
					index: 1,
					part: 'stock.tank-wide',
					parent: { index: 0, parentNode: 'top', node: 'bottom' }
				},
				{
					index: 2,
					part: 'stock.tank-wide',
					parent: { index: 1, parentNode: 'top', node: 'bottom' }
				},
				{
					index: 3,
					part: 'stock.tank-wide',
					parent: { index: 2, parentNode: 'top', node: 'bottom' }
				},
				{
					index: 4,
					part: 'stock.probe-core',
					parent: { index: 3, parentNode: 'top', node: 'bottom' }
				},
				radial(5, 'stock.winch', 3, 0, 0.8, { 'stock.winch': { power: 0 } })
			],
			stages: []
		} as unknown as VesselDesign;
		const load: VesselDesign = {
			formatVersion: 3,
			name: 'Load',
			parts: [
				// a 1 t crew cabin, 1.6 m tall, the socket on its top
				{ index: 0, part: 'stock.crew-cabin', parent: null },
				{
					index: 1,
					part: 'stock.tether-socket',
					parent: {
						index: 0,
						parentNode: 'surface',
						node: 'radial',
						surface: { point: [0, 0.8, 0], normal: [0, 1, 0] }
					}
				}
			],
			stages: []
		} as unknown as VesselDesign;
		const R = sim.registries.bodies.get('stock.home')!.radius;
		const a = sim.dispatch({
			type: 'load-vessel',
			design: crane,
			placement: { kind: 'surface', latitude: 0, longitude: 0 }
		});
		const b = sim.dispatch({
			type: 'load-vessel',
			design: load,
			placement: { kind: 'surface', latitude: 0, longitude: 1.9 / R }
		});
		if (!a.ok || !b.ok)
			throw new Error(`not loaded: ${a.ok ? '' : a.reason} ${b.ok ? '' : b.reason}`);
		const craneId = a.vessel!;
		const loadId = b.vessel!;
		run(sim, 1);
		const h0 = Math.hypot(
			...(Object.values(vesselOf(sim.snapshot(), loadId).position) as [number, number, number])
		);
		const w = winchOf(sim, craneId);
		act(sim, craneId, w.part.id, 'connect');
		run(sim, 0.2);
		expect(winchOf(sim, craneId).view.connected).toBe(true);
		act(sim, craneId, w.part.id, 'setReel', ['in']);
		run(sim, 14);
		act(sim, craneId, w.part.id, 'setReel', ['stop']);
		run(sim, 2);
		const h1 = Math.hypot(
			...(Object.values(vesselOf(sim.snapshot(), loadId).position) as [number, number, number])
		);
		console.log(
			`crane: the load rose ${(h1 - h0).toFixed(2)} m, rope ${winchOf(sim, craneId).view.length.toFixed(2)} m, pull ${(winchOf(sim, craneId).view.tension / 1000).toFixed(1)} kN`
		);
		expect(h1 - h0).toBeGreaterThan(9);
		sim.dispose();
	}, 120_000);
});

describe('strut release (plan 313)', () => {
	test('Release cuts the strut link; the strut stays', async () => {
		const sim = await newSim();
		const design = {
			formatVersion: 3,
			name: 'Strutted',
			parts: [
				{ index: 0, part: 'stock.tank-small', parent: null },
				{
					index: 1,
					part: 'stock.probe-core',
					parent: { index: 0, parentNode: 'top', node: 'bottom' }
				},
				{
					index: 2,
					part: 'stock.tank-small',
					parent: { index: 0, parentNode: 'bottom', node: 'top' }
				},
				{
					index: 3,
					part: 'stock.strut',
					parent: { index: 0, parentNode: 'surface', node: 'end', radial: { angle: 0, y: -0.2 } },
					link: { index: 2, angle: 0, y: 0.2 }
				}
			],
			stages: []
		} as unknown as VesselDesign;
		const s = orbitState(sim, 200_000);
		const id = load(sim, design, s.position, s.velocity);
		sim.step(0.02);
		const strut = () =>
			vesselOf(sim.snapshot(), id).parts.find((p) => p.definition === 'stock.strut')!;
		expect(strut().link).toBeDefined();
		const r = sim.dispatch({
			type: 'action',
			vessel: id,
			part: strut().id,
			module: 'stock.strut',
			action: 'release'
		});
		expect(r.ok).toBe(true);
		sim.step(0.02);
		expect(strut().link).toBeUndefined();
		expect((strut().modules['stock.strut'] as { released: boolean }).released).toBe(true);
		sim.dispose();
	}, 60_000);
});
