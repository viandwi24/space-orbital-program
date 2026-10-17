/**
 * A body's orientation as pole times spin (plan 085, ADRs 0103 point 4 and 0145): the body-fixed
 * frame (+Y the body's north pole, longitude 0 on +X) turns into the inertial frame by
 * `q_pole · Ry(W(t))`. The pole is fixed in the inertial frame; `W(t) = w0 + wDot t` plus optional
 * periodic terms. Without `BodyDefinition.rotation` the pole is +Y and `W = 2 pi t / rotationPeriod`,
 * computed exactly as before, so every existing orbit, placement and save is unchanged.
 */
import type { BodyDefinition } from './definitions.ts';
import type { Quat, Vec3 } from './math.ts';

type Spun = Pick<BodyDefinition, 'rotationPeriod' | 'rotation'>;

const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

const aboutY = (angle: number): Quat => ({
	x: 0,
	y: Math.sin(angle / 2),
	z: 0,
	w: Math.cos(angle / 2)
});

const mul = (a: Quat, b: Quat): Quat => ({
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});

const rotate = (q: Quat, v: Vec3): Vec3 => {
	const cx = q.y * v.z - q.z * v.y;
	const cy = q.z * v.x - q.x * v.z;
	const cz = q.x * v.y - q.y * v.x;
	return {
		x: v.x + 2 * (q.w * cx + q.y * cz - q.z * cy),
		y: v.y + 2 * (q.w * cy + q.z * cx - q.x * cz),
		z: v.z + 2 * (q.w * cz + q.x * cy - q.y * cx)
	};
};

/**
 * The pole as a quaternion: given directly, or from a direction (`ra`, `dec`, rad) in the system
 * frame with the same convention as latitude and longitude (+Y north, `ra` 0 on +X, right-handed),
 * as the shortest turn of +Y onto it, so `ra` and `dec` fix the prime meridian too (ADR 0145).
 */
export function poleQuaternion(def: Spun): Quat {
	const pole = def.rotation?.pole;
	if (!pole) return IDENTITY;
	if ('w' in pole) {
		const n = Math.hypot(pole.x, pole.y, pole.z, pole.w);
		return { x: pole.x / n, y: pole.y / n, z: pole.z / n, w: pole.w / n };
	}
	const d = {
		x: Math.cos(pole.dec) * Math.cos(pole.ra),
		y: Math.sin(pole.dec),
		z: -Math.cos(pole.dec) * Math.sin(pole.ra)
	};
	// +Y onto d: axis Y x d, angle acos(d.y); half-angle form, stable away from d = -Y
	const w = 1 + d.y;
	if (w < 1e-12) return { x: 1, y: 0, z: 0, w: 0 };
	const q = { x: d.z, y: 0, z: -d.x, w };
	const n = Math.hypot(q.x, q.z, q.w);
	return { x: q.x / n, y: 0, z: q.z / n, w: q.w / n };
}

/** Spin rate `dW/dt` without periodic terms, rad/s. */
export const spinRate = (def: Spun): number =>
	def.rotation?.wDot ?? (2 * Math.PI) / def.rotationPeriod;

/** The spin angle `W(t)`, rad. */
export function spinAngle(def: Spun, t: number): number {
	const r = def.rotation;
	if (!r) return ((2 * Math.PI) / def.rotationPeriod) * t;
	let w = (r.w0 ?? 0) + spinRate(def) * t;
	for (const p of r.periodic ?? []) w += p.amplitude * Math.sin(p.rate * t + p.phase);
	return w;
}

/** `dW/dt` at `t`, periodic terms included, rad/s. */
export function spinRateAt(def: Spun, t: number): number {
	let rate = spinRate(def);
	for (const p of def.rotation?.periodic ?? [])
		rate += p.amplitude * p.rate * Math.cos(p.rate * t + p.phase);
	return rate;
}

/** Orientation of the body at `t`: body-fixed to inertial, `q_pole · Ry(W(t))`. */
export function bodyOrientation(def: Spun, t: number): Quat {
	const spin = aboutY(spinAngle(def, t));
	return def.rotation?.pole ? mul(poleQuaternion(def), spin) : spin;
}

/** The body's north pole in the inertial frame (unit); +Y without `rotation.pole`. */
export const bodyPole = (def: Spun): Vec3 =>
	def.rotation?.pole ? rotate(poleQuaternion(def), { x: 0, y: 1, z: 0 }) : { x: 0, y: 1, z: 0 };

/** Angular velocity of the body in the inertial frame at `t`, rad/s: the pole times `dW/dt`. */
export function bodyAngularVelocity(def: Spun, t: number): Vec3 {
	const rate = spinRateAt(def, t);
	if (!def.rotation?.pole) return { x: 0, y: rate, z: 0 };
	const p = bodyPole(def);
	return { x: p.x * rate, y: p.y * rate, z: p.z * rate };
}
