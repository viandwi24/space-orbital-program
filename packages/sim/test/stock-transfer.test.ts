/**
 * Plan 381 / ADR 0318: a headless trip from Home to Ochre with a stock vessel. An upper stage of
 * stock parts (pod, two medium tanks, the wide engine) waits in an 80 km parking orbit in the plane of its
 * departure, burns at the first window with SAS on a maneuver node, makes one correction once it
 * is out in the Sun's sphere, and coasts on rails into Ochre's sphere of influence.
 */
import { describe, expect, test } from 'bun:test';
import { GRAVITATIONAL_CONSTANT, type EntityId } from '@orbital/core';
import { STOCK_BODIES } from '@orbital/mod-stock';
import {
	cross,
	hohmannToTarget,
	length,
	normalize,
	orbitalAxes,
	propagateUniversal,
	scale,
	sub,
	add,
	dot,
	toStateVector,
	type Vec3
} from '@orbital/kepler';
import type { Sim } from '../src/index.ts';
import { newSim, stack } from './helpers/vessels.ts';

const DAY = 21_651;
const byId = new Map(STOCK_BODIES.map((b) => [b.id as string, b]));
const muOf = (id: string): number => byId.get(id)!.mass * GRAVITATIONAL_CONSTANT;
const SUN = muOf('stock.sun');
const HOME = muOf('stock.home');
const at = (id: string, t: number) => toStateVector(byId.get(id)!.orbit!, SUN, t);

/** Lambert by shooting: the velocity at `r0` that reaches `r1` after `dt` around `mu`. */
function lambert(r0: Vec3, r1: Vec3, dt: number, mu: number, guess: Vec3): Vec3 {
	let v = guess;
	for (let k = 0; k < 30; k++) {
		const reach = propagateUniversal(r0, v, mu, dt).r;
		const miss = sub(reach, r1);
		if (length(miss) < 10_000) return v;
		const h = 0.5;
		const cols = (['x', 'y', 'z'] as const).map((axis) => {
			const dv = { ...v, [axis]: v[axis] + h };
			return scale(sub(propagateUniversal(r0, dv, mu, dt).r, reach), 1 / h);
		});
		// solve J · d = -miss (Cramer)
		const [a, b, c] = cols as [Vec3, Vec3, Vec3];
		const det = dot(a, cross(b, c));
		const m = scale(miss, -1);
		const d = {
			x: dot(m, cross(b, c)) / det,
			y: dot(a, cross(m, c)) / det,
			z: dot(a, cross(b, m)) / det
		};
		v = add(v, d);
	}
	throw new Error('lambert: no convergence');
}

/** An interplanetary upper stage of stock parts: pod, wheels, two medium tanks, the wide engine. */
const ochreStage = () =>
	stack(
		'Ochre stage',
		[
			'stock.command-pod',
			'stock.reaction-wheel',
			'stock.reaction-wheel',
			'stock.tank-medium',
			'stock.tank-medium',
			'stock.engine-wide'
		],
		[[5]]
	);

const vesselOf = (sim: Sim, id: EntityId) => sim.snapshot().vessels.find((v) => v.id === id)!;

/** Warp on rails to `time` (stopping wherever the sim stops warp, then going on). */
function warpTo(sim: Sim, time: number, stopAt?: (s: Sim) => boolean): void {
	for (let g = 0; g < 2_000 && sim.time < time - 1; g++) {
		if (stopAt?.(sim)) return;
		if (sim.warp === 1) sim.dispatch({ type: 'warp-to', time, factor: 1e4 });
		sim.step(10);
	}
}

const lit = new Set<EntityId>();

/**
 * Burn a node at `tNode` of `dv` m/s along `burn` (prograde, normal, radial m/s) with SAS on the
 * node, as a player would: warp to half the burn before it, settle, light the engine if needed.
 * Returns the Δv the node still had when the throttle was cut.
 */
function burnNode(
	sim: Sim,
	id: EntityId,
	tNode: number,
	burn: { prograde: number; normal: number; radial: number },
	seconds: number
): number {
	// a node is placed within the next few orbits: come close on rails first
	warpTo(sim, tNode - seconds / 2 - 600);
	const set = sim.dispatch({ type: 'node-set', vessel: id, time: tNode, ...burn });
	expect(set).toEqual(expect.objectContaining({ ok: true }));
	sim.dispatch({ type: 'sas', vessel: id, mode: 'maneuver' });
	warpTo(sim, tNode - seconds / 2 - 60);
	sim.dispatch({ type: 'attitude', vessel: id, pitch: 1e-9, yaw: 0, roll: 0 });
	sim.step(0.02);
	sim.dispatch({ type: 'attitude', vessel: id, pitch: 0, yaw: 0, roll: 0 });
	while (sim.time < tNode - seconds / 2) sim.step(0.05);
	// light the engine the first time (its stage)
	if (!lit.has(id)) {
		expect(sim.dispatch({ type: 'stage', vessel: id }).ok).toBe(true);
		lit.add(id);
	}
	let done = false;
	const off = sim.events.on('vessel:maneuver-complete', (e) => {
		if (e.vessel === id) done = true;
	});
	let rest = Infinity;
	let best = Infinity;
	for (let i = 0; i < 60 * 50 * 10 && !done; i++) {
		rest = vesselOf(sim, id).nodes?.[0]?.dv ?? 0;
		// past the best the burn only adds error: cut, as a player would, and let a correction finish
		if (rest > best + 0.5) break;
		best = Math.min(best, rest);
		sim.dispatch({ type: 'throttle', vessel: id, value: rest > 8 ? 1 : Math.max(rest / 8, 0.02) });
		sim.step(0.02);
	}
	sim.dispatch({ type: 'throttle', vessel: id, value: 0 });
	if (!done) sim.dispatch({ type: 'node-remove', vessel: id });
	off?.();
	return done ? 0 : best;
}

describe('Home to Ochre with a stock vessel (plan 381)', () => {
	test('a parking orbit, the window burn, one correction, and Ochre’s sphere', async () => {
		const sim = await newSim();
		// the window: the planner's departure, and the transfer the Sun's gravity alone would fly
		const plan = hohmannToTarget(at('stock.home', 0), at('stock.ochre', 0), SUN, 0, 60)!;
		const tDep = plan.time;
		// a little faster than the Hohmann ellipse: a transfer of exactly 180° has no plane to solve for
		const tArr = tDep + 0.97 * plan.transferTime;
		expect(tDep / DAY).toBeGreaterThan(40);
		expect(tDep / DAY).toBeLessThan(50);
		const home = at('stock.home', tDep);
		const target = at('stock.ochre', tArr).r;
		const vHelio = lambert(
			home.r,
			target,
			tArr - tDep,
			SUN,
			scale(normalize(home.v), length(home.v) + plan.dv1)
		);
		const vInf = sub(vHelio, home.v);
		// the parking orbit: 80 km, in a plane holding the departure asymptote
		const rp = byId.get('stock.home')!.radius + 80_000;
		const vc = Math.sqrt(HOME / rp);
		const ejection = Math.sqrt(length(vInf) ** 2 + (2 * HOME) / rp) - vc;
		const vHat = normalize(vInf);
		const n = normalize(cross(vHat, { x: 0, y: 1, z: 0 }));
		const e = 1 + (rp * length(vInf) ** 2) / HOME;
		const nuInf = Math.acos(-1 / e);
		const nxv = cross(n, vHat);
		const pHat = sub(scale(vHat, Math.cos(nuInf)), scale(nxv, Math.sin(nuInf)));
		const qHat = cross(n, pHat);
		// where to start so the vessel passes the burn point at the departure time
		const mean = vc / rp;
		const back = -mean * tDep;
		const position = scale(add(scale(pHat, Math.cos(back)), scale(qHat, Math.sin(back))), rp);
		const velocity = scale(add(scale(pHat, -Math.sin(back)), scale(qHat, Math.cos(back))), vc);
		const loaded = sim.dispatch({
			type: 'load-vessel',
			design: ochreStage(),
			placement: { kind: 'state', position, velocity }
		});
		expect(loaded.ok).toBe(true);
		const id = (loaded as { vessel: EntityId }).vessel;

		// the window burn: prograde at the periapsis of the departure hyperbola
		const left1 = burnNode(sim, id, tDep, { prograde: ejection, normal: 0, radial: 0 }, 60);
		// a burn of a minute along a fixed vector leaves some metres per second for the correction
		expect(left1).toBeLessThan(80);
		// out of Home's sphere into the Sun's
		warpTo(sim, tDep + 12 * DAY, (s) => vesselOf(s, id).soi === ('stock.sun' as never));
		expect(vesselOf(sim, id).soi).toBe('stock.sun' as never);
		warpTo(sim, sim.time + 3 * DAY);

		// one correction: aim at where Ochre will be at the planned arrival
		const tFix = sim.time + 1_200;
		const now = vesselOf(sim, id);
		const there = propagateUniversal(now.position, now.velocity, SUN, tFix - sim.time);
		const need = lambert(there.r, at('stock.ochre', tArr).r, tArr - tFix, SUN, there.v);
		const dvFix = sub(need, there.v);
		const axes = orbitalAxes(there.r, there.v);
		const fix = {
			prograde: dot(dvFix, axes.prograde),
			normal: dot(dvFix, axes.normal),
			radial: dot(dvFix, axes.radial)
		};
		const correction = length(dvFix);
		const left2 = burnNode(sim, id, tFix, fix, 30);
		expect(left2).toBeLessThan(2);

		// coast into Ochre's sphere
		warpTo(sim, tArr + 20 * DAY, (s) => vesselOf(s, id).soi === ('stock.ochre' as never));
		const arrived = vesselOf(sim, id);
		expect(arrived.soi).toBe('stock.ochre' as never);
		const arrival = (sim.time - tDep) / DAY;
		const vRel = length(arrived.velocity);
		const capture =
			Math.sqrt(
				vRel ** 2 -
					(2 * muOf('stock.ochre')) / length(arrived.position) +
					(2 * muOf('stock.ochre')) / 388_000
			) - Math.sqrt(muOf('stock.ochre') / 388_000);
		console.log(
			`Home→Ochre: depart day ${(tDep / DAY).toFixed(1)}, ejection ${ejection.toFixed(0)} m/s, ` +
				`correction ${correction.toFixed(0)} m/s, in Ochre's sphere after ${arrival.toFixed(0)} days, ` +
				`capture to a 58 km orbit ~${capture.toFixed(0)} m/s`
		);
		// the research note's numbers: 1 093 m/s to leave, a few tens to correct, ~650 to stay
		expect(ejection).toBeGreaterThan(1_000);
		expect(ejection).toBeLessThan(1_250);
		expect(correction).toBeLessThan(250);
		expect(capture).toBeLessThan(900);
		sim.dispose();
	}, 120_000);
});
