/**
 * DEV-ONLY ascent autopilot (toggle `P`, see flight-loop.ts). Hand-flying a reaction-wheel-only
 * stack through browser automation is not feasible (attitude needs closed-loop control at the
 * snapshot rate), so the manual run of plan 009 uses this. It is a port of the scripted ascent in
 * `packages/sim/test/helpers/ascent.ts`, talks to the sim only through snapshots and `dispatch`
 * (the same path as the keyboard), and is crude on purpose: vertical to 10 km, pitch-over towards
 * east by 40 km, cut at 80 km apoapsis, coast, circularise at apoapsis.
 */
import type {
	BodyDefinition,
	Command,
	EntityId,
	Quat,
	ResourceDefinition,
	PartDefinition,
	Snapshot,
	Vec3,
	VesselSnapshot
} from '@orbital/core';
import { GRAVITATIONAL_CONSTANT } from '@orbital/core';
import { add, cross, dot, length, normalize, scale, sub } from '@orbital/kepler';

export type AutopilotPhase = 'ascent' | 'coast' | 'circularise' | 'done';

export interface AutopilotOptions {
	vessel: EntityId;
	body: BodyDefinition;
	parts: readonly PartDefinition[];
	resources: readonly ResourceDefinition[];
	send(command: Command): void;
	/** Altitudes, m. */
	turnStart?: number;
	turnEnd?: number;
	apoapsis?: number;
	periapsis?: number;
}

const UP_Y: Vec3 = { x: 0, y: 1, z: 0 };
const TORQUE_MAX = 5_000;
const BANDWIDTH = 0.5;
const ENGINE_THRUST = 215_000;

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

export function createAutopilot(o: AutopilotOptions) {
	const mu = GRAVITATIONAL_CONSTANT * o.body.mass;
	const radius = o.body.radius;
	const turnStart = o.turnStart ?? 10_000;
	const turnEnd = o.turnEnd ?? 40_000;
	const targetApo = o.apoapsis ?? 80_000;
	const targetPeri = o.periapsis ?? 76_000;
	const partDefs = new Map(o.parts.map((p) => [p.id as string, p]));
	const density = new Map(o.resources.map((r) => [r.id as string, r.density ?? 0]));
	let phase: AutopilotPhase = 'ascent';
	let started = false;
	let staged = 0;
	let prev: { q: Quat; t: number } | null = null;
	let note = 'liftoff';

	function masses(v: VesselSnapshot): number[] {
		return v.parts.map((p) => {
			let m = partDefs.get(p.definition)?.mass ?? 0;
			const c = p.modules['stock.resource-container'] as
				{ amounts: Record<string, number> } | undefined;
			for (const [r, a] of Object.entries(c?.amounts ?? {})) m += a * (density.get(r) ?? 0);
			return m;
		});
	}

	function massProperties(v: VesselSnapshot, nose: Vec3): { mass: number; inertia: number } {
		const ms = masses(v);
		const mass = ms.reduce((a, b) => a + b, 0);
		let c: Vec3 = { x: 0, y: 0, z: 0 };
		v.parts.forEach((p, i) => (c = add(c, scale(p.position, ms[i]! / mass))));
		let inertia = 0;
		v.parts.forEach((p, i) => {
			const along = dot(sub(p.position, c), nose);
			inertia += ms[i]! * (along * along + 0.1);
		});
		return { mass, inertia: Math.max(inertia, 1) };
	}

	function steer(v: VesselSnapshot, target: Vec3, dt: number): void {
		const nose = rotate(v.orientation, UP_Y);
		let rate: Vec3 = { x: 0, y: 0, z: 0 };
		if (prev && dt > 0) {
			const dq = mul(v.orientation, conj(prev.q));
			const sign = dq.w < 0 ? -1 : 1;
			rate = rotate(conj(v.orientation), scale({ x: dq.x, y: dq.y, z: dq.z }, (2 * sign) / dt));
		}
		const err = rotate(conj(v.orientation), cross(nose, normalize(target)));
		const alpha = TORQUE_MAX / massProperties(v, nose).inertia;
		const kp = (BANDWIDTH * BANDWIDTH) / alpha;
		const kd = (2 * BANDWIDTH) / alpha;
		o.send({
			type: 'attitude',
			vessel: o.vessel,
			pitch: clamp(kp * err.x - kd * rate.x, -1, 1),
			yaw: clamp(kp * err.z - kd * rate.z, -1, 1),
			roll: clamp(-kd * rate.y, -1, 1)
		});
	}

	/** Call with every new snapshot; sends commands. Returns the phase. */
	function update(snap: Snapshot): AutopilotPhase {
		if (phase === 'done') return phase;
		const v = snap.vessels.find((s) => s.id === o.vessel);
		if (!v || v.mode !== 'flight') return phase;
		const t = snap.t;
		if (prev && t <= prev.t) return phase; // same snapshot twice
		const dt = prev ? t - prev.t : 0;
		const r = length(v.position);
		const alt = r - radius;
		const up = scale(v.position, 1 / r);
		const east = normalize(cross(UP_Y, up));
		const orbit = v.orbit;

		if (!started) {
			started = true;
			o.send({ type: 'throttle', vessel: o.vessel, value: 1 });
			o.send({ type: 'stage', vessel: o.vessel });
			note = 'liftoff';
		}

		if (phase === 'ascent') {
			const dry = v.parts.some(
				(p) => (p.modules['stock.engine'] as { flameout?: boolean } | undefined)?.flameout
			);
			if (dry && staged < 1) {
				staged++;
				o.send({ type: 'stage', vessel: o.vessel });
				note = 'staging';
			}
			const frac = clamp((alt - turnStart) / (turnEnd - turnStart), 0, 1);
			const target =
				alt > turnEnd
					? normalize(v.velocity)
					: add(
							scale(up, Math.cos((Math.PI / 4) * frac)),
							scale(east, Math.sin((Math.PI / 4) * frac))
						);
			steer(v, target, dt);
			if (orbit && orbit.a * (1 + orbit.e) - radius >= targetApo) {
				phase = 'coast';
				o.send({ type: 'throttle', vessel: o.vessel, value: 0 });
				note = 'coasting to apoapsis';
			}
		} else if (orbit) {
			const horizontal = normalize(sub(v.velocity, scale(up, dot(v.velocity, up))));
			steer(v, phase === 'coast' ? normalize(v.velocity) : horizontal, dt);
			if (phase === 'coast') {
				const n = Math.sqrt(mu / orbit.a ** 3);
				const toApo = ((Math.PI - orbit.m0 + 2 * Math.PI) % (2 * Math.PI)) / n;
				const apoR = orbit.a * (1 + orbit.e);
				const dv = Math.sqrt(mu / apoR) - Math.sqrt(mu * (2 / apoR - 1 / orbit.a));
				const { mass } = massProperties(v, rotate(v.orientation, UP_Y));
				if (toApo <= (dv * mass) / ENGINE_THRUST / 2) {
					phase = 'circularise';
					o.send({ type: 'throttle', vessel: o.vessel, value: 1 });
					note = 'circularising';
				}
			} else if (orbit.a * (1 - orbit.e) - radius >= targetPeri) {
				phase = 'done';
				o.send({ type: 'throttle', vessel: o.vessel, value: 0 });
				o.send({ type: 'attitude', vessel: o.vessel, pitch: 0, yaw: 0, roll: 0 });
				note = 'orbit reached';
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
		get note() {
			return note;
		}
	};
}
