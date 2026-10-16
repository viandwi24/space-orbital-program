/** Plan 045 / ADR 0056: maneuver nodes in the sim - commands, resolution, the moon encounter, SAS, burns. */
import { describe, expect, test } from 'bun:test';
import { GRAVITATIONAL_CONSTANT, MAX_NODES, type EntityId } from '@orbital/core';
import {
	length,
	normalize,
	predictWithManeuvers,
	soiRadius,
	sub,
	type PatchedBody
} from '@orbital/kepler';
import type { Sim } from '../src/index.ts';
import { centreOfMass, homeMu, orbitState, vesselMass } from './helpers/measure.ts';
import { transferBurnTime } from './helpers/mission.ts';
import { systemOf } from './helpers/moon.ts';
import { noseOf, pointingError } from './helpers/sas.ts';
import { moonLander, newSim } from './helpers/vessels.ts';

const SHIFT = 500_000;
const DEG = 180 / Math.PI;

/** The bodies of the sim as the prediction wants them. */
export function bodiesOf(sim: Sim): PatchedBody[] {
	const defs = sim.registries.bodies.list();
	return defs.map((b) => {
		const parent = defs.find((p) => p.id === b.parent);
		return {
			id: b.id,
			mu: GRAVITATIONAL_CONSTANT * b.mass,
			soi: parent && b.orbit ? soiRadius(b.orbit.a, b.mass, parent.mass) : Number.POSITIVE_INFINITY,
			radius: b.radius,
			...(parent && b.orbit ? { parent: parent.id, orbit: b.orbit } : {})
		};
	});
}

async function inOrbit(alt = 150_000) {
	const sim = await newSim();
	const res = sim.dispatch({
		type: 'load-vessel',
		design: moonLander(),
		placement: { kind: 'state', ...orbitState(sim, alt) }
	});
	if (!res.ok) throw new Error(res.reason);
	const id = res.vessel as EntityId;
	return { sim, id };
}
const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;

/** Prograde Δv of the transfer onto an apoapsis at the moon's orbit radius plus `SHIFT`. */
function transferDv(sim: Sim, r1: number): number {
	const s = systemOf(sim);
	const rm = s.orbit.a + SHIFT;
	const at = (r1 + rm) / 2;
	return Math.sqrt(s.homeMu * (2 / r1 - 1 / at)) - Math.sqrt(s.homeMu / r1);
}

describe('node commands', () => {
	test('create, list in time order, edit, remove; the result carries the id', async () => {
		const { sim, id } = await inOrbit();
		const a = sim.dispatch({
			type: 'node-set',
			vessel: id,
			time: 2_000,
			prograde: 100,
			normal: 0,
			radial: 0
		});
		const b = sim.dispatch({
			type: 'node-set',
			vessel: id,
			time: 1_000,
			prograde: 0,
			normal: 50,
			radial: 0
		});
		expect(a).toEqual({ ok: true, node: 1 });
		expect(b).toEqual({ ok: true, node: 2 });
		let nodes = vesselOf(sim, id).nodes!;
		expect(nodes.map((n) => n.id)).toEqual([2, 1]);
		expect(nodes[0]!.normal).toBeCloseTo(50, 6);
		expect(nodes[1]!.prograde).toBeCloseTo(100, 6);
		expect(nodes[1]!.dv).toBeCloseTo(100, 6);
		expect(String(nodes[0]!.body)).toBe('stock.home');
		// the burn vector of a prograde node is along the velocity at the node time
		const v = nodes[1]!.vector!;
		expect(length(v)).toBeCloseTo(100, 6);
		// edit node 1
		expect(
			sim.dispatch({
				type: 'node-set',
				vessel: id,
				id: 1,
				time: 3_000,
				prograde: 10,
				normal: 0,
				radial: 5
			}).ok
		).toBe(true);
		nodes = vesselOf(sim, id).nodes!;
		expect(nodes.map((n) => [n.id, n.time])).toEqual([
			[2, 1_000],
			[1, 3_000]
		]);
		expect(nodes[1]!.radial).toBeCloseTo(5, 6);
		expect(sim.dispatch({ type: 'node-remove', vessel: id, id: 2 }).ok).toBe(true);
		expect(vesselOf(sim, id).nodes!.map((n) => n.id)).toEqual([1]);
		expect(sim.dispatch({ type: 'node-remove', vessel: id }).ok).toBe(true);
		expect(vesselOf(sim, id).nodes).toEqual([]);
		sim.dispose();
	});

	test('refusals carry a reason: past, unknown id, ninth node, too far, no orbit', async () => {
		const { sim, id } = await inOrbit();
		sim.step(100);
		const set = (extra: object) =>
			sim.dispatch({
				type: 'node-set',
				vessel: id,
				time: 500,
				prograde: 1,
				normal: 0,
				radial: 0,
				...extra
			});
		const past = set({ time: 50 });
		expect(past.ok).toBe(false);
		if (!past.ok) expect(past.reason).toContain('passed');
		const unknown = set({ id: 9 });
		expect(unknown.ok).toBe(false);
		if (!unknown.ok) expect(unknown.reason).toContain('no maneuver node 9');
		const far = set({ time: sim.time + 11 * 86_400 });
		expect(far.ok).toBe(false);
		expect(
			sim.dispatch({
				type: 'node-set',
				vessel: id,
				time: Number.NaN,
				prograde: 1,
				normal: 0,
				radial: 0
			}).ok
		).toBe(false);
		expect(
			sim.dispatch({ type: 'node-set', vessel: id, time: 500, prograde: 1e9, normal: 0, radial: 0 })
				.ok
		).toBe(false);
		expect(sim.dispatch({ type: 'node-remove', vessel: id, id: 4 }).ok).toBe(false);
		for (let k = 0; k < MAX_NODES; k++) expect(set({ time: 500 + 10 * k }).ok).toBe(true);
		const ninth = set({ time: 900 });
		expect(ninth.ok).toBe(false);
		if (!ninth.ok) expect(ninth.reason).toContain(`at most ${MAX_NODES}`);
		sim.dispose();
	});

	test('a node the path never reaches (a suborbital arc ends in the ground) is refused', async () => {
		const sim = await newSim();
		const res = sim.dispatch({
			type: 'load-vessel',
			design: moonLander(),
			placement: {
				kind: 'state',
				position: { x: 650_000, y: 0, z: 0 },
				velocity: { x: 0, y: 0, z: -1_000 }
			}
		});
		if (!res.ok) throw new Error(res.reason);
		const r = sim.dispatch({
			type: 'node-set',
			vessel: res.vessel as EntityId,
			time: 3_000,
			prograde: 5,
			normal: 0,
			radial: 0
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.reason).toContain('never reaches');
		sim.dispose();
	});

	test('a vessel standing on the ground has no orbit to plan on', async () => {
		const sim = await newSim();
		const res = sim.dispatch({ type: 'load-vessel', design: moonLander() });
		if (!res.ok) throw new Error(res.reason);
		for (let i = 0; i < 400; i++) sim.step(0.02);
		for (let i = 0; i < 400; i++) sim.step(0.02);
		const id = res.vessel as EntityId;
		const r = sim.dispatch({
			type: 'node-set',
			vessel: id,
			time: sim.time + 100,
			prograde: 5,
			normal: 0,
			radial: 0
		});
		expect(r.ok).toBe(false);
		sim.dispose();
	}, 30_000);
});

describe('the moon encounter', () => {
	test('the predicted moon periapsis and entry time match the sim run within 1 km and 10 s', async () => {
		const { sim, id } = await inOrbit(150_000);
		sim.step(10);
		const el = vesselOf(sim, id).orbit!;
		const td = transferBurnTime(sim, el, sim.time, SHIFT);
		const dv = transferDv(sim, 600_000 + 150_000);
		const set = sim.dispatch({
			type: 'node-set',
			vessel: id,
			time: td,
			prograde: dv,
			normal: 0,
			radial: 0
		});
		expect(set.ok).toBe(true);
		const v = vesselOf(sim, id);
		const node = v.nodes![0]!;
		expect(node.dv).toBeCloseTo(dv, 3);

		// What the map would draw: the same kepler call on the snapshot.
		const bodies = bodiesOf(sim);
		const path = predictWithManeuvers(
			bodies,
			{ body: v.soi, r: v.position, v: v.velocity, t: sim.time },
			[
				{
					id: node.id,
					time: node.time,
					prograde: node.prograde,
					normal: node.normal,
					radial: node.radial
				}
			],
			3 * 86_400
		);
		const moonSeg = path.segments.find((s) => s.body === 'stock.cinder');
		expect(moonSeg).toBeDefined();
		const predictedPe = moonSeg!.elements!.a * (1 - moonSeg!.elements!.e);
		expect(predictedPe).toBeGreaterThan(190_000); // above the moon's surface
		const post = path.nodes[0]!.post;

		// The sim run: a vessel started at the post-burn state flies to the moon on rails.
		const run = await newSim();
		run.dispatch({ type: 'warp-to', time: td, factor: 1_000 });
		for (let i = 0; i < 100_000 && run.time < td - 1e-9; i++) run.step(0.5);
		expect(run.time).toBeCloseTo(td, 6);
		const flown = run.dispatch({
			type: 'load-vessel',
			design: moonLander(),
			placement: { kind: 'state', position: post.r, velocity: post.v }
		});
		if (!flown.ok) throw new Error(flown.reason);
		let entered = -1;
		run.events.on('vessel:soi-changed', (e) => {
			if (e.to === 'stock.cinder' && entered < 0) entered = run.time;
		});
		for (let i = 0; i < 100 && entered < 0; i++) {
			run.dispatch({ type: 'warp', factor: 20_000 });
			run.step(2);
		}
		expect(entered).toBeGreaterThan(0);
		const flownOrbit = run.snapshot().vessels[0]!.orbit!;
		const simPe = flownOrbit.a * (1 - flownOrbit.e);
		console.log(
			`moon encounter: predicted pe ${(predictedPe / 1000).toFixed(3)} km at t0 ${moonSeg!.t0.toFixed(1)}; ` +
				`sim pe ${(simPe / 1000).toFixed(3)} km at ${entered.toFixed(1)}`
		);
		expect(Math.abs(simPe - predictedPe)).toBeLessThan(1_000);
		expect(Math.abs(entered - moonSeg!.t0)).toBeLessThan(10);
		sim.dispose();
		run.dispose();
	}, 60_000);
});

describe('SAS maneuver', () => {
	test('points at the burn vector on rails and follows an edit of the node', async () => {
		const { sim, id } = await inOrbit();
		sim.dispatch({
			type: 'node-set',
			vessel: id,
			time: 3_000,
			prograde: 200,
			normal: 0,
			radial: 0
		});
		expect(sim.dispatch({ type: 'sas', vessel: id, mode: 'maneuver' }).ok).toBe(true);
		sim.step(1);
		const burnDir = () => normalize(vesselOf(sim, id).nodes![0]!.vector!);
		let v = vesselOf(sim, id);
		expect(v.mode).toBe('on-rails');
		expect(pointingError(v.orientation, burnDir()) * DEG).toBeLessThan(1);
		// a normal burn flips the target by 90 degrees; the nose follows
		sim.dispatch({
			type: 'node-set',
			vessel: id,
			id: 1,
			time: 3_000,
			prograde: 0,
			normal: 150,
			radial: 0
		});
		sim.step(1);
		v = vesselOf(sim, id);
		expect(pointingError(v.orientation, burnDir()) * DEG).toBeLessThan(1);
		// the direction of a normal burn is the orbit normal
		const h = normalize({
			x: v.position.y * v.velocity.z - v.position.z * v.velocity.y,
			y: v.position.z * v.velocity.x - v.position.x * v.velocity.z,
			z: v.position.x * v.velocity.y - v.position.y * v.velocity.x
		});
		expect(length(sub(burnDir(), h))).toBeLessThan(1e-3);
		expect(v.sas!.mode).toBe('maneuver');
		sim.dispose();
	});

	test('in flight the nose settles within 1 degree of the burn vector', async () => {
		const { sim, id } = await inOrbit();
		sim.dispatch({
			type: 'node-set',
			vessel: id,
			time: 3_000,
			prograde: 0,
			normal: 0,
			radial: 200
		});
		sim.dispatch({ type: 'sas', vessel: id, mode: 'maneuver' });
		// wake into flight with a tiny attitude demand, then let SAS do the work
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 1e-9, yaw: 0, roll: 0 });
		sim.step(0.02);
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		expect(vesselOf(sim, id).mode).toBe('flight');
		let worst = 0;
		for (let i = 0; i < 40 * 50; i++) {
			sim.step(0.02);
			if (sim.time > 25) {
				const v = vesselOf(sim, id);
				worst = Math.max(worst, pointingError(v.orientation, normalize(v.nodes![0]!.vector!)));
			}
		}
		console.log(`sas maneuver in flight: worst error after 25 s ${(worst * DEG).toFixed(3)} deg`);
		expect(worst * DEG).toBeLessThan(1);
		sim.dispose();
	}, 30_000);
});

describe('executing a burn', () => {
	test('a finite burn with SAS maneuver removes the node and reaches the impulsive orbit within 2 %', async () => {
		const { sim, id } = await inOrbit(150_000);
		sim.step(5);
		const dv = 400;
		const mu = homeMu(sim);
		const tNode = sim.time + 600;
		sim.dispatch({ type: 'node-set', vessel: id, time: tNode, prograde: dv, normal: 0, radial: 0 });
		const v0 = vesselOf(sim, id);
		// impulsive apoapsis from the vis-viva value at the node
		const rNode = 750_000;
		const vNew = Math.sqrt(mu / rNode) + dv;
		const aNew = 1 / (2 / rNode - (vNew * vNew) / mu);
		const apoapsisImpulsive = 2 * aNew - rNode;
		// burn time of this vessel: Tsiolkovsky with the stock engine
		const part = sim.registries.parts.get('stock.engine-lv')!;
		const cfg = part.modules!.find(([m]) => m === 'stock.engine')![1] as {
			thrust: number;
			ispVacuum: number;
		};
		const ve = cfg.ispVacuum * 9.80665;
		const m0 = vesselMass(sim, v0);
		const T = (m0 * (1 - Math.exp(-dv / ve))) / (cfg.thrust / ve);
		sim.dispatch({ type: 'sas', vessel: id, mode: 'maneuver' });
		sim.dispatch({ type: 'warp-to', time: tNode - T / 2 - 20, factor: 1_000 });
		for (let i = 0; i < 100_000 && sim.time < tNode - T / 2 - 20 - 1e-9; i++) sim.step(0.2);
		expect(sim.warp).toBe(1);
		// settle onto the burn direction (the vessel wakes for its attitude), then burn
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 1e-9, yaw: 0, roll: 0 });
		sim.step(0.02);
		sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
		let completed = -1;
		sim.events.on('vessel:maneuver-complete', (e) => {
			if (e.vessel === id) completed = e.node;
		});
		while (sim.time < tNode - T / 2) sim.step(0.02);
		const dir = vesselOf(sim, id);
		expect(pointingError(dir.orientation, normalize(dir.nodes![0]!.vector!)) * DEG).toBeLessThan(1);
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true); // light the engine
		const t0 = sim.time;
		let remainingAtNode = -1;
		let fullThrottleTime = -1;
		for (let i = 0; i < 60 * 50 && completed < 0; i++) {
			const v = vesselOf(sim, id);
			const rest = v.nodes![0]?.dv ?? 0;
			// throttle down for the last metres per second so the cut is clean
			sim.dispatch({
				type: 'throttle',
				vessel: id,
				value: rest > 8 ? 1 : Math.max(rest / 8, 0.02)
			});
			sim.step(0.02);
			if (fullThrottleTime < 0 && rest <= 8) fullThrottleTime = sim.time - t0;
			if (remainingAtNode < 0 && sim.time >= tNode) remainingAtNode = v.nodes![0]?.dv ?? 0;
		}
		sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
		const burned = sim.time - t0;
		expect(completed).toBe(1);
		expect(vesselOf(sim, id).nodes).toEqual([]);
		const o = vesselOf(sim, id).orbit!;
		const apoapsis = o.a * (1 + o.e);
		const err = Math.abs(apoapsis - apoapsisImpulsive) / apoapsisImpulsive;
		console.log(
			`finite burn: ${burned.toFixed(2)} s (Tsiolkovsky ${T.toFixed(2)} s, full throttle), ` +
				`remaining at node time ${remainingAtNode.toFixed(1)} m/s of ${dv}, ` +
				`apoapsis ${(apoapsis / 1000).toFixed(1)} km vs impulsive ${(apoapsisImpulsive / 1000).toFixed(1)} km (${(err * 100).toFixed(2)} %)`
		);
		expect(err).toBeLessThan(0.02);
		// full throttle until 8 m/s are left took as long as the rocket equation says (within 3 %)
		const T8 = (m0 * (1 - Math.exp(-(dv - 8) / ve))) / (cfg.thrust / ve);
		console.log(
			`full-throttle part: ${fullThrottleTime.toFixed(2)} s vs rocket equation ${T8.toFixed(2)} s`
		);
		expect(Math.abs(fullThrottleTime - T8) / T8).toBeLessThan(0.03);
		expect(length(noseOf(vesselOf(sim, id).orientation))).toBeCloseTo(1, 6);
		expect(centreOfMass(sim, vesselOf(sim, id))).toBeDefined();
		sim.dispose();
	}, 120_000);
});
