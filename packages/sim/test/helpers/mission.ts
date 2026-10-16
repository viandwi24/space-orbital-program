/**
 * Scripted trip to the moon (plan 044), through `dispatch` and `snapshot` only: the ascent helper
 * to a low orbit, a phased transfer burn, coasting across the sphere of influence at time warp,
 * a capture burn at periapsis, then the landing helper. Crude on purpose, like the other scripts;
 * the planning uses only what a host has (orbit elements, body data).
 */
import type { EntityId } from '@orbital/core';
import { length, normalize, propagate, scale, type OrbitalElements } from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';
import { vesselMass } from './measure.ts';
import { systemOf } from './moon.ts';

const TWO_PI = 2 * Math.PI;
const wrap = (a: number): number => ((((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;

export interface Mission {
	sim: Sim;
	vessel: EntityId;
	log: Array<{ t: number; note: string }>;
}

export const snapshotOf = (m: Mission) => {
	const snap = m.sim.snapshot();
	const v = snap.vessels.find((x) => x.id === m.vessel);
	if (!v) throw new Error('mission: the vessel is gone');
	return { snap, v };
};

export const note = (m: Mission, text: string): void => {
	m.log.push({ t: m.sim.time, note: text });
};

/** Next time the orbit is at periapsis (elliptic) or was/will be (hyperbolic), s. */
export function periapsisTime(el: OrbitalElements, mu: number, now: number): number {
	const n = Math.sqrt(mu / Math.abs(el.a ** 3));
	if (el.e >= 1) return el.epoch - el.m0 / n;
	const m = el.m0 + n * (now - el.epoch);
	return now + ((TWO_PI - (((m % TWO_PI) + TWO_PI) % TWO_PI)) % TWO_PI) / n;
}

/** Advance at time warp to `target` seconds (stopping by itself if the vessel changes sphere). */
export function warpTo(m: Mission, target: number, stopAtSoi = false): void {
	const { sim } = m;
	const start = snapshotOf(m).v.soi;
	for (let guard = 0; guard < 100_000 && target - sim.time > 30; guard++) {
		const factor = Math.max(1, Math.min(1_000, Math.floor((target - sim.time) / 10)));
		const res = sim.dispatch({ type: 'warp', factor });
		if (!res.ok) {
			sim.step(0.02); // still settling onto rails
		} else sim.step(0.1);
		if (stopAtSoi && snapshotOf(m).v.soi !== start) break;
	}
	sim.dispatch({ type: 'warp', factor: 1 });
}

/**
 * Burn along the pointing the stability assist holds (set it before), at `throttle()` (default
 * full; tapering at the end makes the cut precise), until `done()`. Returns the burn time.
 */
export function burn(
	m: Mission,
	done: () => boolean,
	limit = 400,
	throttle: () => number = () => 1
): number {
	const { sim, vessel } = m;
	const t0 = sim.time;
	while (!done() && sim.time - t0 < limit) {
		sim.dispatch({ type: 'throttle', vessel, value: throttle() });
		sim.step(0.02);
	}
	sim.dispatch({ type: 'throttle', vessel, value: 0 });
	return sim.time - t0;
}

/** Hold the nose on the orbit's prograde or retrograde direction (plan 042). */
export function point(m: Mission, mode: 'prograde' | 'retrograde'): void {
	const res = m.sim.dispatch({ type: 'sas', vessel: m.vessel, mode, reference: 'orbit' });
	if (!res.ok) throw new Error(res.reason);
}

/**
 * Time at which a prograde burn centred on it, from the vessel's near-circular orbit, ends on a
 * transfer whose apoapsis (radius `moon orbit + shift`) meets the moon half a transfer later.
 */
export function transferBurnTime(
	sim: Sim,
	el: OrbitalElements,
	now: number,
	shift: number
): number {
	const s = systemOf(sim);
	const angleAt = (t: number): number => {
		const r = propagate(el, s.homeMu, t).r;
		return Math.atan2(-r.z, r.x);
	};
	const r1 = length(propagate(el, s.homeMu, now).r);
	const rm = s.orbit.a + shift;
	const a = (r1 + rm) / 2;
	const flight = Math.PI * Math.sqrt(a ** 3 / s.homeMu);
	const nm = Math.sqrt(s.homeMu / s.orbit.a ** 3);
	const miss = (t: number): number => wrap(angleAt(t) - (s.orbit.m0 + nm * (t + flight) - Math.PI));
	const period = TWO_PI * Math.sqrt(el.a ** 3 / s.homeMu);
	let lo = now + 120;
	let prev = miss(lo);
	for (let t = lo + 5; t < now + 2 * period; t += 5) {
		const cur = miss(t);
		if (prev < 0 && cur >= 0 && Math.abs(cur - prev) < 1) {
			lo = t - 5;
			let hi = t;
			for (let k = 0; k < 60; k++) {
				const mid = 0.5 * (lo + hi);
				if (miss(mid) >= 0) hi = mid;
				else lo = mid;
			}
			return hi;
		}
		prev = cur;
	}
	throw new Error('mission: no transfer window found');
}

/**
 * A retrograde burn centred on the next periapsis that cuts when the apoapsis radius is below
 * `apoapsis` (m). Returns the burn time.
 */
export function retroBurnAtPeriapsis(m: Mission, mu: number, apoapsis: number): number {
	const { sim } = m;
	const first = snapshotOf(m).v;
	const el = first.orbit!;
	const tPeri = periapsisTime(el, mu, sim.time);
	// Half the burn time of the impulsive estimate: centring the burn keeps the periapsis.
	const rp = el.a * (1 - el.e);
	const speedAt = (a: number): number => Math.sqrt(mu * (2 / rp - 1 / a));
	const dv = speedAt(el.a) - speedAt((rp + apoapsis) / 2);
	const lead = (0.5 * dv) / (215_000 / vesselMass(sim, first));
	point(m, 'retrograde');
	warpTo(m, tPeri - lead - 30);
	while (sim.time < tPeri - lead) sim.step(0.02);
	const ap = (): number => {
		const o = snapshotOf(m).v.orbit;
		return o === undefined || o.e >= 1 ? Infinity : o.a * (1 + o.e);
	};
	return burn(
		m,
		() => ap() <= apoapsis,
		400,
		() => (ap() - apoapsis > 100_000 ? 1 : 0.15)
	);
}

/** Time of the next apoapsis of a bound orbit. */
export const apoapsisTime = (el: OrbitalElements, mu: number, now: number): number => {
	const period = TWO_PI * Math.sqrt(el.a ** 3 / mu);
	const peri = periapsisTime(el, mu, now);
	return peri - period / 2 > now ? peri - period / 2 : peri + period / 2;
};

/**
 * A short retrograde burn at apoapsis that lowers the periapsis radius to `periapsis` (m): the
 * start of a descent, from which the landing script brakes at the low point.
 */
export function lowerPeriapsis(m: Mission, mu: number, periapsis: number): number {
	const { sim } = m;
	const el = snapshotOf(m).v.orbit!;
	const tApo = apoapsisTime(el, mu, sim.time);
	point(m, 'retrograde');
	warpTo(m, tApo - 20);
	while (sim.time < tApo - 0.5) sim.step(0.02);
	return burn(
		m,
		() => {
			const o = snapshotOf(m).v.orbit;
			return o !== undefined && o.a * (1 - o.e) <= periapsis;
		},
		60,
		() => 0.2
	);
}
