/**
 * Scripted ascent for the Phase 0 exit test. Talks to the sim only through `dispatch` and
 * `snapshot` (what a host or the web client has): full throttle, vertical to a turn altitude, a
 * pitch-over towards east, prograde after, stage when the active engine runs dry, cut at a target
 * apoapsis, coast, circularise at apoapsis. Crude on purpose: the point is that the pipeline works.
 * Attitude comes from a PD loop on the snapshot orientation (rate by finite difference) sent as
 * `attitude` commands to the reaction wheel.
 */
import {
	GRAVITATIONAL_CONSTANT,
	type EntityId,
	type Quat,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';
import type { Sim } from '../../src/index.ts';

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

const UP_Y: Vec3 = { x: 0, y: 1, z: 0 };
const conj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const mul = (a: Quat, b: Quat): Quat => ({
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});
const rotate = (q: Quat, v: Vec3): Vec3 => {
	const u = { x: q.x, y: q.y, z: q.z };
	const t = scale(cross(u, v), 2);
	return add(add(v, scale(t, q.w)), cross(u, t));
};
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

export function createAscent(sim: Sim, vessel: EntityId, opts: AscentOptions = defaultAscent) {
	const home = sim.registries.bodies.list().find((b) => b.parent === undefined)!;
	const mu = GRAVITATIONAL_CONSTANT * home.mass;
	const radius = home.radius;
	let phase: Phase = 'ascent';
	let started = false;
	let prev: { q: Quat; t: number } | null = null;
	let staged = 0;
	const log: Array<{ t: number; phase: Phase; note: string }> = [];

	const mark = (t: number, note: string): void => {
		log.push({ t, phase, note });
	};

	/** Mass and transverse moment of inertia of the vessel from its parts, kg and kg·m². */
	function massProperties(v: VesselSnapshot, nose: Vec3): { mass: number; inertia: number } {
		let mass = 0;
		let c: Vec3 = { x: 0, y: 0, z: 0 };
		const masses: number[] = [];
		for (const p of v.parts) {
			const def = sim.registries.parts.get(p.definition)!;
			let m = def.mass;
			const container = p.modules['stock.resource-container'] as
				{ amounts: Record<string, number> } | undefined;
			if (container) {
				for (const [r, amount] of Object.entries(container.amounts)) {
					m += amount * (sim.registries.resources.get(r)?.density ?? 0);
				}
			}
			masses.push(m);
			mass += m;
			c = add(c, scale(p.position, m));
		}
		c = scale(c, 1 / mass);
		let inertia = 0;
		v.parts.forEach((p, i) => {
			const d = sub(p.position, c);
			const along = dot(d, nose);
			// Transverse axis of a slender stack: distance along the nose dominates (plus a small own term).
			inertia += masses[i]! * (along * along + 0.1);
		});
		return { mass, inertia: Math.max(inertia, 1) };
	}

	function steer(v: VesselSnapshot, target: Vec3, dt: number, torqueMax: number): void {
		const nose = rotate(v.orientation, UP_Y);
		let rate: Vec3 = { x: 0, y: 0, z: 0 };
		if (prev && dt > 0) {
			const dq = mul(v.orientation, conj(prev.q));
			const sign = dq.w < 0 ? -1 : 1;
			rate = rotate(conj(v.orientation), scale({ x: dq.x, y: dq.y, z: dq.z }, (2 * sign) / dt));
		}
		const err = rotate(conj(v.orientation), cross(nose, normalize(target)));
		const { inertia } = massProperties(v, nose);
		const alpha = torqueMax / inertia;
		const w = defaultAscent.bandwidth;
		const kp = (w * w) / alpha;
		const kd = (2 * w) / alpha;
		const res = sim.dispatch({
			type: 'attitude',
			vessel,
			pitch: clamp(kp * err.x - kd * rate.x, -1, 1),
			yaw: clamp(kp * err.z - kd * rate.z, -1, 1),
			roll: clamp(-kd * rate.y, -1, 1)
		});
		if (!res.ok) throw new Error(`attitude refused: ${res.reason}`);
	}

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
		const dt = prev ? t - prev.t : 0;
		const torqueMax = 5_000;
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
			if (dry && staged < 1) {
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
			steer(v, target, dt, torqueMax);
			if (orbit && orbit.a * (1 + orbit.e) - radius >= opts.apoapsis) {
				phase = 'coast';
				sim.dispatch({ type: 'throttle', vessel, value: 0 });
				mark(t, `cut: apoapsis ${(orbit.a * (1 + orbit.e) - radius).toFixed(0)} m`);
			}
		} else if (phase === 'coast' || phase === 'circularise') {
			// Hold prograde in the horizontal plane at apoapsis, prograde otherwise.
			const horizontal = normalize(sub(v.velocity, scale(up, dot(v.velocity, up))));
			steer(v, phase === 'coast' ? normalize(v.velocity) : horizontal, dt, torqueMax);
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
		prev = { q: v.orientation, t };
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
