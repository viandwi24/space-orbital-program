/**
 * The re-entry shock layer shaped by the vessel (plan 040, ADR 0078). The stack is reduced to a
 * radius profile along the airflow (a silhouette of revolution: for each slice of the stack the
 * widest thing in it), and the shell is that profile pushed out by the shock stand-off, with a
 * blunt cap at the windward end. Pure CPU arithmetic over the parts' shapes; no pass on the GPU.
 */
import type { Quat, Vec3 } from '@orbital/core';
import type { PartShape } from '../parts/types.ts';
import { add, clamp, cross, dot, normalize, rotate, scale, vec } from '../vec.ts';

/** Slices along the airflow. */
export const PROFILE_BINS = 10;
/** Rings on the blunt cap in front of the first slice. */
export const CAP_RINGS = 5;
/** Rings of the shell: cap (with its tip), the slices, and the tapering tail. */
export const SHELL_RINGS = CAP_RINGS + 1 + PROFILE_BINS + 1;
/** Segments around the shell. */
export const SHELL_SEGMENTS = 24;
/** The glow is drawn this many times thicker than the real stand-off (it is a shock layer, not a line). */
export const VISUAL_STANDOFF_GAIN = 2.5;
/** Speed of sound used for the Mach number, m/s (the home air at 288 K). */
export const SOUND_SPEED = 340;

/** A part as a cylinder: axis along its local +Y. */
export interface SilhouettePart {
	/** Centre relative to the vessel root, inertial axes, m. */
	position: Vec3;
	orientation: Quat;
	/** Radius about the part's axis, m. */
	radius: number;
	/** Half the length along the axis, m. */
	halfLength: number;
}

export interface Profile {
	/** Axial coordinate (along the airflow) of the windward end of the stack, m. */
	front: number;
	/** Axial coordinate of the leeward end, m. */
	back: number;
	/** Radius of slice `i`, from the windward end back; slice `i` is centred at `front - (i + 0.5) h`. */
	radii: Float64Array;
	/** Slice height, m. */
	step: number;
	/** The axis of the profile: root-relative point the silhouette is centred on (perpendicular offset). */
	axisPoint: Vec3;
}

/** Two unit vectors perpendicular to `f`. */
export function lateralBasis(f: Vec3): [Vec3, Vec3] {
	const helper = Math.abs(f.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
	const e1 = normalize(cross(f, helper));
	return [e1, cross(f, e1)];
}

/**
 * Radius profile of `parts` seen along unit `forward` (direction of travel through the air, the
 * windward end has the largest coordinate along it). Each part covers the axial range its cylinder
 * covers and contributes `distance of its axis from the profile axis + its radius` to the slices
 * in that range; the profile axis is the centre of the stack's lateral bounding box.
 */
export function silhouetteProfile(
	parts: readonly SilhouettePart[],
	forward: Vec3,
	bins = PROFILE_BINS
): Profile {
	const f = normalize(forward);
	const [e1, e2] = lateralBasis(f);
	if (parts.length === 0) {
		return {
			front: 0,
			back: 0,
			radii: new Float64Array(bins),
			step: 0,
			axisPoint: vec(0, 0, 0)
		};
	}
	// Axis segment of each part: its two cap centres as (s, a, b).
	const segs = parts.map((p) => {
		const axis = rotate(p.orientation, vec(0, 1, 0));
		const h = scale(axis, p.halfLength);
		const c0 = add(p.position, scale(h, -1));
		const c1 = add(p.position, h);
		const cosT = Math.abs(dot(axis, f));
		const sinT = Math.sqrt(Math.max(0, 1 - cosT * cosT));
		const tip = p.radius * sinT; // the rim of a tilted cap reaches this far along the airflow
		return {
			s0: dot(c0, f),
			s1: dot(c1, f),
			a0: dot(c0, e1),
			a1: dot(c1, e1),
			b0: dot(c0, e2),
			b1: dot(c1, e2),
			radius: p.radius,
			tip
		};
	});
	let front = -Infinity;
	let back = Infinity;
	let amin = Infinity;
	let amax = -Infinity;
	let bmin = Infinity;
	let bmax = -Infinity;
	for (const s of segs) {
		front = Math.max(front, s.s0 + s.tip, s.s1 + s.tip);
		back = Math.min(back, s.s0 - s.tip, s.s1 - s.tip);
		amin = Math.min(amin, s.a0 - s.radius, s.a1 - s.radius);
		amax = Math.max(amax, s.a0 + s.radius, s.a1 + s.radius);
		bmin = Math.min(bmin, s.b0 - s.radius, s.b1 - s.radius);
		bmax = Math.max(bmax, s.b0 + s.radius, s.b1 + s.radius);
	}
	const ca = (amin + amax) / 2;
	const cb = (bmin + bmax) / 2;
	const span = Math.max(front - back, 1e-6);
	const step = span / bins;
	const radii = new Float64Array(bins);
	for (let i = 0; i < bins; i++) {
		// A slice sees every part whose axial range overlaps it.
		const lo = front - (i + 1) * step;
		const hi = front - i * step;
		let r = 0;
		for (const s of segs) {
			const sLo = Math.min(s.s0, s.s1) - s.tip;
			const sHi = Math.max(s.s0, s.s1) + s.tip;
			if (sHi < lo || sLo > hi) continue;
			// The part's axis inside this slice (extended by the rim of a tilted cap); the farthest
			// point from the profile axis of a straight segment is at one of its ends.
			const ds = s.s1 - s.s0;
			let u0 = 0;
			let u1 = 1;
			if (Math.abs(ds) > 1e-9) {
				const ua = (lo - s.tip - s.s0) / ds;
				const ub = (hi + s.tip - s.s0) / ds;
				u0 = clamp(Math.min(ua, ub), 0, 1);
				u1 = clamp(Math.max(ua, ub), 0, 1);
			}
			for (const u of [u0, u1]) {
				const a = s.a0 + (s.a1 - s.a0) * u - ca;
				const b = s.b0 + (s.b1 - s.b0) * u - cb;
				r = Math.max(r, Math.hypot(a, b) + s.radius);
			}
		}
		radii[i] = r;
	}
	return {
		front,
		back,
		radii,
		step,
		axisPoint: add(scale(e1, ca), scale(e2, cb))
	};
}

/**
 * Shock stand-off of a sphere of radius `R` in a flow of Mach `mach`, as a multiple of `R`: the
 * correlation `0.143 exp(3.24 / M^2)` (Billig 1967, gamma 1.4). It grows without bound towards
 * Mach 1, so the Mach number is held at 1.5 or more.
 */
export function standoffRatio(mach: number): number {
	const m = Math.max(1.5, mach);
	return 0.143 * Math.exp(3.24 / (m * m));
}

/** Stand-off at the nose for the nose radius `noseRadius` and an airspeed, m (not yet visually boosted). */
export const standoff = (noseRadius: number, airspeed: number): number =>
	standoffRatio(airspeed / SOUND_SPEED) * noseRadius;

export interface ShellRing {
	/** Axial coordinate along the airflow, m. */
	s: number;
	/** Radius of the shell about the profile axis, m. */
	r: number;
}

/**
 * The shell as rings from the nose tip back: `SHELL_RINGS` of them, `s` never increasing, `r`
 * never inside the profile (plus the stand-off) at the same `s`. The stand-off grows with depth
 * behind the nose from `delta` to 2.5 `delta`, as a shock lies further out on the flanks.
 */
export function shellRings(profile: Profile, airspeed: number): ShellRing[] {
	const bins = profile.radii.length;
	const out: ShellRing[] = [];
	const nose = Math.max(0.3, profile.radii[0] ?? 0.3);
	const delta = standoff(nose, airspeed) * VISUAL_STANDOFF_GAIN;
	const gap = (depth: number): number => delta * (1 + (1.5 * depth) / (depth + 2 * nose));
	const first = profile.radii[0] ?? 0;
	const capLength = delta + 0.9 * nose;
	const capRadius = first + gap(capLength);
	// Cap: an ellipse from the tip (r = 0) out to the first slice's shell radius.
	for (let k = 0; k <= CAP_RINGS; k++) {
		const phi = (k / CAP_RINGS) * (Math.PI / 2);
		out.push({
			s: profile.front + delta - capLength * (1 - Math.cos(phi)),
			r: capRadius * Math.sin(phi)
		});
	}
	// Slices.
	for (let i = 0; i < bins; i++) {
		const s = profile.front - (i + 0.5) * profile.step;
		const depth = Math.max(0, profile.front - s);
		const r = Math.max(profile.radii[i]!, 0) + gap(depth);
		const prev = out[out.length - 1]!;
		out.push({ s: Math.min(s, prev.s), r: Math.max(r, i === 0 ? capRadius : 0) });
	}
	// Tail: closes in so the shell does not end in a cut.
	const last = out[out.length - 1]!;
	out.push({ s: Math.min(last.s, profile.back - 0.4 * nose), r: last.r * 0.35 });
	return out;
}

/** Axial length from the nose tip to the last ring, m. */
export const shellLength = (rings: readonly ShellRing[]): number =>
	rings.length > 0 ? rings[0]!.s - rings[rings.length - 1]!.s : 0;

/**
 * Writes the shell into `positions` and `normals` (3 floats per vertex, `SHELL_RINGS` x
 * (`SHELL_SEGMENTS` + 1) vertices) in a frame with +Y along the airflow and the origin at the
 * stack's windward end (`profile.front`), x/z the lateral plane about the profile axis.
 */
export function writeShell(
	rings: readonly ShellRing[],
	front: number,
	positions: Float32Array,
	normals: Float32Array
): void {
	const n = rings.length;
	for (let i = 0; i < n; i++) {
		const a = rings[Math.max(0, i - 1)]!;
		const b = rings[Math.min(n - 1, i + 1)]!;
		// The curve runs from the nose back: ds <= 0. In (radial, axial) its tangent is (dr, ds), so
		// the outward normal is (-ds, dr): radial part >= 0, axial part forward on the cap.
		const ds = b.s - a.s;
		const dr = b.r - a.r;
		const nr = ds === 0 && dr === 0 ? 1 : -ds;
		const ny = dr;
		for (let j = 0; j <= SHELL_SEGMENTS; j++) {
			const th = (j / SHELL_SEGMENTS) * Math.PI * 2;
			const c = Math.cos(th);
			const s = Math.sin(th);
			const o = (i * (SHELL_SEGMENTS + 1) + j) * 3;
			positions[o] = rings[i]!.r * c;
			positions[o + 1] = rings[i]!.s - front;
			positions[o + 2] = rings[i]!.r * s;
			const l = Math.hypot(nr, ny) || 1;
			normals[o] = (nr / l) * c;
			normals[o + 1] = ny / l;
			normals[o + 2] = (nr / l) * s;
		}
	}
}

/** Triangle indices of the shell (the same for every frame). */
export function shellIndices(): Uint16Array {
	const idx: number[] = [];
	for (let i = 0; i < SHELL_RINGS - 1; i++) {
		for (let j = 0; j < SHELL_SEGMENTS; j++) {
			const a = i * (SHELL_SEGMENTS + 1) + j;
			const b = a + SHELL_SEGMENTS + 1;
			idx.push(a, b, a + 1, a + 1, b, b + 1);
		}
	}
	return Uint16Array.from(idx);
}

/** A part's physics shape as the cylinder the silhouette uses (a box: its wider horizontal half side). */
export function silhouetteOfShape(
	shape: PartShape | undefined
): { radius: number; halfLength: number } | undefined {
	if (!shape) return undefined;
	if (shape.kind === 'cylinder') return { radius: shape.radius, halfLength: shape.height / 2 };
	return { radius: Math.max(shape.size.x, shape.size.z) / 2, halfLength: shape.size.y / 2 };
}
