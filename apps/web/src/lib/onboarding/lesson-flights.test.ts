/**
 * The lesson vessels fly their lessons (plan 344, ADR 0293 point 6): in a headless sim, each
 * reaches its goal with the controls or the autopilot the lesson teaches. Long runs: these are the
 * players' flights, sped up.
 */
import {
	loadPlugins,
	type CommandResult,
	type EntityId,
	type Quat,
	type Vec3
} from '@orbital/core';
import AutoDock from '@orbital/mod-autodock';
import Guidance, { orbitOf } from '@orbital/mod-guidance';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim, type Sim } from '@orbital/sim';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { spinVector, surfaceVelocity } from '../speed';
import {
	LESSON_HOME_RADIUS as HOME_RADIUS,
	LESSON_PARKING as PARKING,
	LESSON_RENDEZVOUS_LEAD as RENDEZVOUS_LEAD,
	LESSON_TARGET_LEAD as TARGET_LEAD
} from '@orbital/mod-stock';
import { beacon, chaser, lander, pathfinder, pathfinderCapsule, skylark } from './lesson-vessels';

const { registries } = loadPlugins([Stock, Guidance, AutoDock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};

const newSim = (): Promise<Sim> =>
	createSim({
		plugins: [Stock, Guidance, AutoDock],
		backendFactory: () => createRapierBackend({ solverIterations: 8 }),
		seed: 344
	});

const loaded = (r: CommandResult): EntityId => {
	if (!r.ok || r.vessel === undefined) throw new Error(r.ok ? 'no vessel' : r.reason);
	return r.vessel;
};
const muOf = (sim: Sim, body: string): number => sim.registries.bodies.get(body)!.mass * 6.6743e-11;
const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id);
/** The vessel that carries a part of `definition` (a stage away, the pod's vessel may change). */
const withPart = (sim: Sim, definition: string) =>
	sim.snapshot().vessels.find((v) => v.parts.some((p) => p.definition === definition));

/** A state `lead` metres ahead on a circular equatorial orbit at `alt` round `body` (prograde about +Y). */
function circular(sim: Sim, body: string, alt: number, lead = 0) {
	const r = sim.registries.bodies.get(body)!.radius + alt;
	const a = lead / r;
	const v = Math.sqrt(muOf(sim, body) / r);
	return {
		body,
		position: { x: r * Math.cos(a), y: 0, z: -r * Math.sin(a) },
		velocity: { x: -v * Math.sin(a), y: 0, z: -v * Math.cos(a) }
	};
}

/** Step `dt` until `until` holds or `limit` sim seconds pass; returns whether it held. */
function runUntil(sim: Sim, limit: number, until: () => boolean, dt = 0.1): boolean {
	const start = sim.time;
	while (sim.time - start < limit) {
		sim.step(dt);
		if (until()) return true;
	}
	return false;
}

/** Fly until the vessel's autopilot ends; how it ended. */
function flyProgram(sim: Sim, id: EntityId, limit: number): string {
	let ended = '';
	const off = sim.events.on('autopilot:ended', (e) => {
		if (e.vessel === id) ended = `${e.outcome}: ${e.reason}`;
	});
	runUntil(sim, limit, () => ended !== '');
	off();
	return ended || 'still running';
}

/** Speed over the ground of `v` round `body`, m/s. */
function groundSpeed(sim: Sim, body: string, v: { position: Vec3; velocity: Vec3 }): number {
	const b = sim.registries.bodies.get(body)!;
	const s = surfaceVelocity(v.position, v.velocity, spinVector(b));
	return Math.hypot(s.x, s.y, s.z);
}

/** Apsides above the surface of `body`, m. */
function apsides(sim: Sim, body: string, v: { position: Vec3; velocity: Vec3 }) {
	const o = orbitOf(v.position, v.velocity, muOf(sim, body));
	const radius = sim.registries.bodies.get(body)!.radius;
	return { apoapsis: o.apoapsis - radius, periapsis: o.periapsis - radius };
}

/** Down under the parachute: the capsule's touchdown speed and whether it is whole. */
function rideDown(
	sim: Sim,
	limit: number
): { landed: boolean; touchdown: number; parts: string[] } {
	let last = Infinity;
	const landed = runUntil(sim, limit, () => {
		const v = withPart(sim, 'stock.command-pod');
		if (!v) return true;
		if (v.surface || v.splashed) return true;
		last = groundSpeed(sim, 'stock.home', v);
		return false;
	});
	const v = withPart(sim, 'stock.command-pod');
	return {
		landed: landed && v !== undefined,
		touchdown: last,
		parts: v ? v.parts.map((p) => p.definition) : []
	};
}

describe('lesson flights (plan 344)', () => {
	it('First launch: Skylark climbs past 20 km, drops its stage and lands under the parachute', async () => {
		const sim = await newSim();
		try {
			const id = loaded(sim.dispatch({ type: 'load-vessel', design: skylark(content) }));
			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
			sim.dispatch({ type: 'sas', vessel: id, mode: 'hold' });
			// the player cuts at Ap 20 km
			const cut = runUntil(
				sim,
				120,
				() => {
					const v = vesselOf(sim, id)!;
					return apsides(sim, 'stock.home', v).apoapsis > 20_000;
				},
				0.05
			);
			expect(cut).toBe(true);
			sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
			// coast to the top, drop the stage, arm the parachute
			runUntil(sim, 200, () => {
				const v = vesselOf(sim, id)!;
				const up =
					v.position.x * v.velocity.x + v.position.y * v.velocity.y + v.position.z * v.velocity.z;
				return up < 0;
			});
			expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
			const pod = withPart(sim, 'stock.command-pod')!;
			expect(sim.dispatch({ type: 'stage', vessel: pod.id }).ok).toBe(true);
			const r = rideDown(sim, 900);
			console.log(`Skylark: touchdown ${r.touchdown.toFixed(1)} m/s, parts ${r.parts.join(', ')}`);
			expect(r.landed).toBe(true);
			expect(r.touchdown).toBeLessThan(10);
			expect(r.parts).toEqual(
				expect.arrayContaining(['stock.command-pod', 'stock.parachute', 'stock.heat-shield'])
			);
		} finally {
			sim.dispose();
		}
	}, 600_000);

	it('Orbit: Pathfinder reaches an 80 km orbit on the Guidance Computer’s Ascent', async () => {
		const sim = await newSim();
		try {
			const id = loaded(sim.dispatch({ type: 'load-vessel', design: pathfinder(content) }));
			expect(
				sim.dispatch({
					type: 'autopilot-engage',
					vessel: id,
					autopilot: 'guidance.ascent',
					params: { altitude: 80_000 }
				}).ok
			).toBe(true);
			const ended = flyProgram(sim, id, 1_500);
			const v = withPart(sim, 'stock.command-pod')!;
			const o = apsides(sim, 'stock.home', v);
			console.log(
				`Pathfinder ascent: ${ended}; ${Math.round(o.apoapsis)} x ${Math.round(o.periapsis)} m`
			);
			expect(ended).toMatch(/^done/);
			expect(o.periapsis).toBeGreaterThan(70_000);
			// the capsule ship keeps its delta-v for the orbit lessons
			expect(v.parts.some((p) => p.definition === 'stock.engine-lv')).toBe(true);
		} finally {
			sim.dispose();
		}
	}, 900_000);

	it('Coming home: the capsule deorbits, drops its service module and lands under the parachute, whole', async () => {
		const sim = await newSim();
		try {
			const id = loaded(
				sim.dispatch({
					type: 'load-vessel',
					design: pathfinderCapsule(content),
					placement: { kind: 'state', ...circular(sim, 'stock.home', PARKING) }
				})
			);
			expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
			sim.dispatch({ type: 'sas', vessel: id, mode: 'retrograde' });
			// turn round, then burn until the periapsis is below 30 km
			runUntil(sim, 60, () => false);
			sim.dispatch({ type: 'throttle', vessel: id, value: 1 });
			const low = runUntil(
				sim,
				300,
				() => apsides(sim, 'stock.home', vesselOf(sim, id)!).periapsis < 30_000,
				0.05
			);
			sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
			expect(low).toBe(true);
			// drop the service module, shield first, arm the parachute
			expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
			const pod = withPart(sim, 'stock.command-pod')!;
			sim.dispatch({ type: 'sas', vessel: pod.id, mode: 'retrograde' });
			expect(sim.dispatch({ type: 'stage', vessel: pod.id }).ok).toBe(true);
			const r = rideDown(sim, 4_000);
			console.log(`Re-entry: touchdown ${r.touchdown.toFixed(1)} m/s, parts ${r.parts.join(', ')}`);
			expect(r.landed).toBe(true);
			expect(r.touchdown).toBeLessThan(10);
			expect(r.parts).toEqual(
				expect.arrayContaining(['stock.command-pod', 'stock.parachute', 'stock.heat-shield'])
			);
		} finally {
			sim.dispose();
		}
	}, 900_000);

	it('Landing: the Lark lander sets down on Cinder from a 30 km arc on the Landing program', async () => {
		const sim = await newSim();
		try {
			const start = circular(sim, 'stock.cinder', 30_000);
			// the lesson's arc: 250 m/s along the ground, a little down
			const r = Math.hypot(start.position.x, start.position.y, start.position.z);
			start.velocity = { x: -50 * (start.position.x / r), y: 0, z: -250 };
			const orientation: Quat = { x: 0, y: 0, z: -0.7071068, w: 0.7071068 };
			const id = loaded(
				sim.dispatch({
					type: 'load-vessel',
					design: lander(content),
					placement: { kind: 'state', ...start, orientation }
				})
			);
			expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
			expect(
				sim.dispatch({ type: 'action-group', vessel: id, group: 'stock.landing-gear' } as never).ok
			).toBe(true);
			const parts = vesselOf(sim, id)!.parts.length;
			expect(
				sim.dispatch({ type: 'autopilot-engage', vessel: id, autopilot: 'guidance.land' }).ok
			).toBe(true);
			const ended = flyProgram(sim, id, 900);
			const v = vesselOf(sim, id)!;
			console.log(`Lark landing: ${ended}; ${v.parts.length}/${parts} parts, surface ${v.surface}`);
			expect(ended).toMatch(/^done/);
			expect(v.parts.length).toBe(parts);
			expect(v.soi).toBe('stock.cinder');
		} finally {
			sim.dispose();
		}
	}, 600_000);

	it('Rendezvous: Kestrel catches Beacon Station 20 km ahead and holds within 300 m', async () => {
		const sim = await newSim();
		try {
			const b = loaded(
				sim.dispatch({
					type: 'load-vessel',
					design: beacon(content),
					placement: { kind: 'state', ...circular(sim, 'stock.home', PARKING, RENDEZVOUS_LEAD) }
				})
			);
			const a = loaded(
				sim.dispatch({
					type: 'load-vessel',
					design: chaser(content),
					placement: { kind: 'state', ...circular(sim, 'stock.home', PARKING) }
				})
			);
			expect(sim.dispatch({ type: 'stage', vessel: a }).ok).toBe(true);
			expect(
				sim.dispatch({ type: 'target-set', vessel: a, target: { kind: 'vessel', id: b } }).ok
			).toBe(true);
			expect(
				sim.dispatch({ type: 'autopilot-engage', vessel: a, autopilot: 'guidance.rendezvous' }).ok
			).toBe(true);
			let held = 0;
			let ended = '';
			const off = sim.events.on('autopilot:ended', (e) => {
				if (e.vessel === a) ended = `${e.outcome}: ${e.reason}`;
			});
			runUntil(sim, 6 * 3_600, () => {
				const v = vesselOf(sim, a)!;
				held = v.autopilot?.phase === 'hold' ? held + 1 : 0;
				return ended !== '' || held > 100;
			});
			off();
			const v = vesselOf(sim, a)!;
			console.log(
				`Rendezvous: ${ended || 'holding'}; ${Math.round(v.target?.distance ?? -1)} m at ${(v.target?.relativeSpeed ?? -1).toFixed(2)} m/s`
			);
			expect(v.target!.distance).toBeLessThan(300);
			expect(v.target!.relativeSpeed).toBeLessThan(1);
		} finally {
			sim.dispose();
		}
	}, 600_000);

	it('Docking: Kestrel docks with Beacon Station from 200 m on Auto Dock', async () => {
		const sim = await newSim();
		try {
			const b = loaded(
				sim.dispatch({
					type: 'load-vessel',
					design: beacon(content),
					placement: { kind: 'state', ...circular(sim, 'stock.home', PARKING, TARGET_LEAD) }
				})
			);
			const a = loaded(
				sim.dispatch({
					type: 'load-vessel',
					design: chaser(content),
					placement: { kind: 'state', ...circular(sim, 'stock.home', PARKING) }
				})
			);
			sim.dispatch({ type: 'sas', vessel: b, mode: 'hold' });
			expect(sim.dispatch({ type: 'stage', vessel: a }).ok).toBe(true);
			const theirs = vesselOf(sim, b)!.ports![0]!.part;
			const own = vesselOf(sim, a)!.ports![0]!.part;
			expect(sim.dispatch({ type: 'set-control-part', vessel: a, part: own }).ok).toBe(true);
			expect(
				sim.dispatch({
					type: 'target-set',
					vessel: a,
					target: { kind: 'vessel', id: b, part: theirs }
				}).ok
			).toBe(true);
			let docked = false;
			const ended: string[] = [];
			sim.events.on('vessel:docked', () => (docked = true));
			sim.events.on('autopilot:ended', (e) => ended.push(`${e.outcome}: ${e.reason}`));
			const engage = sim.dispatch({
				type: 'autopilot-engage',
				vessel: a,
				autopilot: 'autodock.dock'
			});
			expect(engage, JSON.stringify(engage)).toEqual({ ok: true });
			runUntil(sim, 20 * 60, () => docked || ended.length > 0, 0.02);
			console.log(`Auto Dock: ${docked ? 'docked' : 'not docked'}; ${ended.join('; ')}`);
			expect(docked).toBe(true);
			// one vessel now: Kestrel and the station
			expect(
				withPart(sim, 'stock.probe-core')?.parts.some((p) => p.definition === 'stock.command-pod')
			).toBe(true);
		} finally {
			sim.dispose();
		}
	}, 900_000);
});

void HOME_RADIUS;
