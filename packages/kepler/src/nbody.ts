/**
 * Restricted n-body motion of a vessel (plan 125, ADR 0122): a test particle in the frame of its
 * dominant body, pulled by every other body on its path (direct term) less the pull on the frame's
 * own centre (indirect term), integrated by an adaptive Bulirsch–Stoer method. Pure float64 with a
 * fixed operation order: the same inputs give the same bits.
 */
import type { StateVector } from './convert.ts';
import type { Vec3 } from './vec3.ts';

/** A body that pulls: its gravitational parameter and its position relative to the frame body at `t`. */
export interface Perturber {
	mu: number;
	at(t: number): Vec3;
}

export interface NBodyField {
	/** The frame body's gravitational parameter, m³/s². */
	mu: number;
	/** Every other body that pulls. */
	perturbers: readonly Perturber[];
}

/** Acceleration in the frame of the dominant body at `t` for position `r` (ADR 0122 point 2). */
export function nBodyAcceleration(field: NBodyField, t: number, r: Vec3): Vec3 {
	const d = Math.hypot(r.x, r.y, r.z);
	const k = -field.mu / (d * d * d);
	let ax = k * r.x;
	let ay = k * r.y;
	let az = k * r.z;
	for (const p of field.perturbers) {
		if (p.mu === 0) continue;
		const s = p.at(t);
		const dx = s.x - r.x;
		const dy = s.y - r.y;
		const dz = s.z - r.z;
		const dd = Math.hypot(dx, dy, dz);
		const sd = Math.hypot(s.x, s.y, s.z);
		const kd = p.mu / (dd * dd * dd);
		const ks = p.mu / (sd * sd * sd);
		ax += kd * dx - ks * s.x;
		ay += kd * dy - ks * s.y;
		az += kd * dz - ks * s.z;
	}
	return { x: ax, y: ay, z: az };
}

/** The perturbation alone (direct less indirect, without the frame body), for the flight bubble. */
export function thirdBodyAcceleration(field: NBodyField, t: number, r: Vec3): Vec3 {
	return nBodyAcceleration({ mu: 0, perturbers: field.perturbers }, t, r) as Vec3;
}

export interface IntegrateOptions {
	/** Relative error per step (default 1e-12). */
	tolerance?: number;
	/** Longest step, s (default: a twentieth of the local circular period). */
	maxStep?: number;
	/** First step to try, s (the last call's `h`). */
	step?: number;
}

export interface IntegrateResult extends StateVector {
	/** The step to try next. */
	h: number;
	/** Acceleration evaluations spent (the warp budget counts these, ADR 0122 point 5). */
	evaluations: number;
}

type Y = [number, number, number, number, number, number];

const SEQUENCE = [2, 4, 6, 8, 10, 12, 14, 16];
const SAFETY = 0.9;

/**
 * Integrate `state` from `t0` to `t1` (either direction) in `field` with Bulirsch–Stoer steps: Gragg's
 * modified midpoint over `n` substeps for n in 2, 4, 6, …, extrapolated to zero step in h², the step
 * grown or cut from the extrapolation error (ADR 0122 point 3).
 */
export function integrateNBody(
	field: NBodyField,
	state: StateVector,
	t0: number,
	t1: number,
	options: IntegrateOptions = {}
): IntegrateResult {
	const tol = options.tolerance ?? 1e-12;
	let y: Y = [state.r.x, state.r.y, state.r.z, state.v.x, state.v.y, state.v.z];
	let evaluations = 0;
	const deriv = (t: number, s: Y): Y => {
		evaluations++;
		const a = nBodyAcceleration(field, t, { x: s[0], y: s[1], z: s[2] });
		return [s[3], s[4], s[5], a.x, a.y, a.z];
	};
	const span = t1 - t0;
	if (span === 0) return { r: { ...state.r }, v: { ...state.v }, h: options.step ?? 0, evaluations };
	const dir = Math.sign(span);
	const period = (s: Y): number => {
		const d = Math.hypot(s[0], s[1], s[2]);
		return 2 * Math.PI * Math.sqrt((d * d * d) / field.mu);
	};
	let t = t0;
	let h = Math.abs(options.step ?? period(y) / 100);
	for (let guard = 0; guard < 1e6 && dir * (t1 - t) > 0; guard++) {
		const hMax = options.maxStep ?? period(y) / 20;
		h = Math.min(h, hMax, Math.abs(t1 - t));
		const step = bsStep(deriv, t, y, dir * h, tol);
		if (!step.ok) {
			h = step.next;
			continue;
		}
		const last = Math.abs(t1 - t) <= h;
		t = last ? t1 : t + dir * h;
		y = step.y;
		h = step.next;
	}
	return {
		r: { x: y[0], y: y[1], z: y[2] },
		v: { x: y[3], y: y[4], z: y[5] },
		h,
		evaluations
	};
}

/**
 * One accepted Bulirsch–Stoer step from `state` at `t`, trying `h` first and cutting it until the step
 * converges (the sim's dense rails, ADR 0122 point 3): the state at `t + step` and the next step.
 */
export function nBodyStep(
	field: NBodyField,
	state: StateVector,
	t: number,
	h: number,
	options: IntegrateOptions = {}
): { r: Vec3; v: Vec3; step: number; next: number; evaluations: number } {
	const tol = options.tolerance ?? 1e-12;
	let evaluations = 0;
	const deriv = (tau: number, s: Y): Y => {
		evaluations++;
		const a = nBodyAcceleration(field, tau, { x: s[0], y: s[1], z: s[2] });
		return [s[3], s[4], s[5], a.x, a.y, a.z];
	};
	const y: Y = [state.r.x, state.r.y, state.r.z, state.v.x, state.v.y, state.v.z];
	const d = Math.hypot(y[0], y[1], y[2]);
	const hMax = options.maxStep ?? (2 * Math.PI * Math.sqrt((d * d * d) / field.mu)) / 20;
	let H = Math.min(h > 0 ? h : hMax / 5, hMax);
	for (let guard = 0; guard < 200; guard++) {
		const out = bsStep(deriv, t, y, H, tol);
		if (out.ok) {
			const z = out.y;
			return {
				r: { x: z[0], y: z[1], z: z[2] },
				v: { x: z[3], y: z[4], z: z[5] },
				step: H,
				next: Math.min(out.next, hMax),
				evaluations
			};
		}
		H = out.next;
	}
	throw new RangeError('nBodyStep: the step did not converge');
}

/**
 * Position and velocity between two states of a trajectory (quintic Hermite from positions,
 * velocities and accelerations at both ends): the dense output of numeric rails.
 */
export function hermiteState(
	a: { r: Vec3; v: Vec3; acc: Vec3; t: number },
	b: { r: Vec3; v: Vec3; acc: Vec3; t: number },
	t: number
): StateVector {
	const h = b.t - a.t;
	const s = (t - a.t) / h;
	const s2 = s * s;
	const s3 = s2 * s;
	const s4 = s3 * s;
	const s5 = s4 * s;
	// quintic Hermite basis and its derivative in s
	const h0 = 1 - 10 * s3 + 15 * s4 - 6 * s5;
	const h1 = s - 6 * s3 + 8 * s4 - 3 * s5;
	const h2 = 0.5 * s2 - 1.5 * s3 + 1.5 * s4 - 0.5 * s5;
	const h3 = 0.5 * s3 - s4 + 0.5 * s5;
	const h4 = -4 * s3 + 7 * s4 - 3 * s5;
	const h5 = 10 * s3 - 15 * s4 + 6 * s5;
	const d0 = -30 * s2 + 60 * s3 - 30 * s4;
	const d1 = 1 - 18 * s2 + 32 * s3 - 15 * s4;
	const d2 = s - 4.5 * s2 + 6 * s3 - 2.5 * s4;
	const d3 = 1.5 * s2 - 4 * s3 + 2.5 * s4;
	const d4 = -12 * s2 + 28 * s3 - 15 * s4;
	const d5 = 30 * s2 - 60 * s3 + 30 * s4;
	const axis = (k: 'x' | 'y' | 'z'): [number, number] => [
		h0 * a.r[k] + h1 * h * a.v[k] + h2 * h * h * a.acc[k] + h3 * h * h * b.acc[k] + h4 * h * b.v[k] + h5 * b.r[k],
		(d0 * a.r[k] + d1 * h * a.v[k] + d2 * h * h * a.acc[k] + d3 * h * h * b.acc[k] + d4 * h * b.v[k] + d5 * b.r[k]) / h
	];
	const [rx, vx] = axis('x');
	const [ry, vy] = axis('y');
	const [rz, vz] = axis('z');
	return { r: { x: rx, y: ry, z: rz }, v: { x: vx, y: vy, z: vz } };
}

/** Gragg's modified midpoint over `n` substeps of a step `H`. */
function midpoint(deriv: (t: number, s: Y) => Y, t: number, y: Y, d0: Y, H: number, n: number): Y {
	const h = H / n;
	let zPrev = y.slice() as Y;
	let z = y.map((v, i) => v + h * d0[i]!) as Y;
	for (let m = 1; m < n; m++) {
		const d = deriv(t + m * h, z);
		const next = zPrev.map((v, i) => v + 2 * h * d[i]!) as Y;
		zPrev = z;
		z = next;
	}
	const d = deriv(t + H, z);
	return z.map((v, i) => 0.5 * (v + zPrev[i]! + h * d[i]!)) as Y;
}

/** One Bulirsch–Stoer step; on failure `next` is a smaller step to retry. */
function bsStep(
	deriv: (t: number, s: Y) => Y,
	t: number,
	y: Y,
	H: number,
	tol: number
): { ok: true; y: Y; next: number } | { ok: false; next: number } {
	const d0 = deriv(t, y);
	const scaleR = Math.max(Math.hypot(y[0], y[1], y[2]), 1);
	const scaleV = Math.max(Math.hypot(y[3], y[4], y[5]), 1e-3);
	// Neville tableau in h², one row per sequence entry
	const rows: Y[][] = [];
	for (let k = 0; k < SEQUENCE.length; k++) {
		const n = SEQUENCE[k]!;
		const row: Y[] = [midpoint(deriv, t, y, d0, H, n)];
		for (let j = 1; j <= k; j++) {
			const ratio = (n / SEQUENCE[k - j]!) ** 2 - 1;
			const a = row[j - 1]!;
			const b = rows[k - 1]![j - 1]!;
			row.push(a.map((v, i) => v + (v - b[i]!) / ratio) as Y);
		}
		rows.push(row);
		if (k >= 2) {
			const best = row[k]!;
			const prev = row[k - 1]!;
			let err = 0;
			for (let i = 0; i < 6; i++) {
				const scale = i < 3 ? scaleR : scaleV;
				err = Math.max(err, Math.abs(best[i]! - prev[i]!) / scale);
			}
			if (err <= tol) {
				// converged early: grow; at the last columns: keep about the same
				const grow = k <= 3 ? 1.6 : k <= 5 ? 1.2 : 1;
				return { ok: true, y: best, next: Math.abs(H) * grow };
			}
		}
	}
	return { ok: false, next: Math.abs(H) * 0.5 * SAFETY };
}
