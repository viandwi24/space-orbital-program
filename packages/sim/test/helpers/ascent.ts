/**
 * Scripted ascent for the Phase 0 exit test. Talks to the sim only through `dispatch` and
 * `snapshot` (what a host or the web client has): full throttle, vertical to a turn altitude, a
 * pitch-over towards east, prograde after, stage when the active engine runs dry, cut at a target
 * apoapsis, coast, circularise at apoapsis. Crude on purpose: the point is that the pipeline works.
 * Attitude comes from a PD loop on the snapshot orientation (rate by finite difference) sent as
 * `attitude` commands to the reaction wheel.
 */
import { GRAVITATIONAL_CONSTANT, type EntityId, type Vec3 } from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';
import { UP_Y, clamp, createAttitude, rotate } from './attitude.ts';

export interface AscentOptions {
	/** Altitude where the pitch-over starts, m. */
	turnStart: number;
	/** Altitude by which the pitch reaches `turnPitch`, m. */
	turnEnd: number;
	/** Pitch from vertical at `turnEnd`, rad. */
	turnPitch: number;
	/** Throttle off when the apoapsis altitude reaches this, m. */
	apoapsis: number;
	/** Circularisation ends when the periapsis altitude reaches this, m. */
	periapsis: number;
	/** Closed-loop natural frequency of the attitude loop, rad/s. */
	bandwidth: number;
	/** How many times to stage when an engine runs dry (default 1: the two-stage vessel). */
	stageCount?: number;
	/** Fire the next stage when the throttle is cut (jettison spent boosters before the coast). */
	jettisonAtCut?: boolean;
}

export const defaultAscent: AscentOptions = {
	turnStart: 10_000,
	turnEnd: 40_000,
	turnPitch: Math.PI / 4,
	apoapsis: 80_000,
	periapsis: 76_000,
	bandwidth: 0.5
};

export type Phase = 'ascent' | 'coast' | 'circularise' | 'done';

export function createAscent(sim: Sim, vessel: EntityId, opts: AscentOptions = defaultAscent) {
	const home = sim.registries.bodies.get(sim.home)!;
	const mu = GRAVITATIONAL_CONSTANT * home.mass;
	const radius = home.radius;
	let phase: Phase = 'ascent';
	let started = false;
	let staged = 0;
	const log: Array<{ t: number; phase: Phase; note: string }> = [];

	const mark = (t: number, note: string): void => {
		log.push({ t, phase, note });
	};

	const attitude = createAttitude(
		sim,
		vessel,
		opts.bandwidth === defaultAscent.bandwidth ? defaultAscent.bandwidth : opts.bandwidth
	);
	const { massProperties } = attitude;
	const steer = (v: Parameters<typeof attitude.steer>[0], target: Vec3, t: number): void =>
		attitude.steer(v, target, t);

	/** One control tick; call after every `sim.step`. Returns the current phase. */
	function update(): Phase {
		if (phase === 'done') return phase;
		const snap = sim.snapshot();
		const v = snap.vessels.find((s) => s.id === vessel);
		if (!v) throw new Error('ascent: the vessel is gone');
		const t = snap.t;
		const r = length(v.position);
		const alt = r - radius;
		const up = scale(v.position, 1 / r);
		const east = normalize(cross(UP_Y, up));
		const orbit = v.orbit;

		if (!started) {
			started = true;
			sim.dispatch({ type: 'throttle', vessel, value: 1 });
			const s = sim.dispatch({ type: 'stage', vessel });
			if (!s.ok) throw new Error(s.reason);
			mark(t, 'liftoff');
		}

		if (phase === 'ascent') {
			// Stage when an engine has run dry.
			const dry = v.parts.some(
				(p) => (p.modules['stock.engine'] as { flameout?: boolean } | undefined)?.flameout
			);
			if (dry && staged < (opts.stageCount ?? 1)) {
				staged++;
				const s = sim.dispatch({ type: 'stage', vessel });
				if (!s.ok) throw new Error(s.reason);
				mark(t, 'staged');
			}
			const frac = clamp((alt - opts.turnStart) / (opts.turnEnd - opts.turnStart), 0, 1);
			const pitch = alt > opts.turnEnd ? undefined : opts.turnPitch * frac;
			const target =
				pitch === undefined
					? normalize(v.velocity)
					: add(scale(up, Math.cos(pitch)), scale(east, Math.sin(pitch)));
			steer(v, target, t);
			if (orbit && orbit.a * (1 + orbit.e) - radius >= opts.apoapsis) {
				phase = 'coast';
				sim.dispatch({ type: 'throttle', vessel, value: 0 });
				if (opts.jettisonAtCut) {
					const s = sim.dispatch({ type: 'stage', vessel });
					if (!s.ok) throw new Error(s.reason);
					staged++;
				}
				mark(t, `cut: apoapsis ${(orbit.a * (1 + orbit.e) - radius).toFixed(0)} m`);
			}
		} else if (phase === 'coast' || phase === 'circularise') {
			// Hold prograde in the horizontal plane at apoapsis, prograde otherwise.
			const horizontal = normalize(sub(v.velocity, scale(up, dot(v.velocity, up))));
			steer(v, phase === 'coast' ? normalize(v.velocity) : horizontal, t);
			if (!orbit) throw new Error('ascent: orbit unavailable while coasting');
			if (phase === 'coast') {
				const n = Math.sqrt(mu / orbit.a ** 3);
				const toApo = ((Math.PI - orbit.m0 + 2 * Math.PI) % (2 * Math.PI)) / n;
				const apoR = orbit.a * (1 + orbit.e);
				const vApo = Math.sqrt(mu * (2 / apoR - 1 / orbit.a));
				const dv = Math.sqrt(mu / apoR) - vApo;
				const { mass } = massProperties(v, rotate(v.orientation, UP_Y));
				// Rocket equation for one engine (vacuum thrust 215 kN, Isp 300 s): the burn is shorter
				// than dv·m/F because the vessel gets lighter, and centring it on apoapsis matters.
				const ve = 300 * 9.80665;
				const burn = (mass * ve * (1 - Math.exp(-dv / ve))) / 215_000;
				if (toApo <= burn / 2) {
					phase = 'circularise';
					sim.dispatch({ type: 'throttle', vessel, value: 1 });
					mark(t, `circularise: dv ${dv.toFixed(0)} m/s, t to apoapsis ${toApo.toFixed(0)} s`);
				}
			} else {
				const peri = orbit.a * (1 - orbit.e) - radius;
				if (peri >= opts.periapsis) {
					phase = 'done';
					sim.dispatch({ type: 'throttle', vessel, value: 0 });
					sim.dispatch({ type: 'attitude', vessel, pitch: 0, yaw: 0, roll: 0 });
					mark(t, `done: periapsis ${peri.toFixed(0)} m`);
				}
			}
		}
		return phase;
	}

	return {
		update,
		get phase() {
			return phase;
		},
		log
	};
}
