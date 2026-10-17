/**
 * Navball maths (plan 021, ADR 0026), pure and DOM-free. Frames: the local horizon at the vessel is
 * (east, north, up) with up = r-hat, north = +Y projected onto the horizontal and east = north x up
 * (units-and-frames.md: +Y is north, right-handed). Vessel axes: nose +Y, ball "up" +Z, ball
 * "right" +X, so looking along the nose with +Z up, right = nose x up = +X. Screen coordinates here
 * are mathematical (x right, y up); the painter flips y.
 */
import type { Quat, Vec3 } from '@orbital/core';

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const add3 = (a: Vec3, b: Vec3, c: Vec3): Vec3 => ({
	x: a.x + b.x + c.x,
	y: a.y + b.y + c.y,
	z: a.z + b.z + c.z
});
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export function normalize(a: Vec3): Vec3 {
	const l = length(a);
	return l > 0 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
}

/** Rotates `v` by the unit quaternion `q`. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
	// v' = v + 2w (u x v) + 2 u x (u x v), u = (x, y, z)
	const u = { x: q.x, y: q.y, z: q.z };
	const t = scale(cross(u, v), 2);
	const c = cross(u, t);
	return { x: v.x + q.w * t.x + c.x, y: v.y + q.w * t.y + c.y, z: v.z + q.w * t.z + c.z };
}

export interface Horizon {
	east: Vec3;
	north: Vec3;
	up: Vec3;
}

/** The body's north pole when it has no tilt: +Y (units-and-frames.md). */
const PLUS_Y: Vec3 = { x: 0, y: 1, z: 0 };

/**
 * Local horizon frame at `position` (BCI); north is towards the body's `pole` (inertial, unit;
 * `bodyPole` of core, plan 085). At the poles north falls back to -Z (arbitrary but stable).
 */
export function localHorizon(position: Vec3, pole: Vec3 = PLUS_Y): Horizon {
	const up = normalize(position);
	let north = normalize({
		x: pole.x - dot(pole, up) * up.x,
		y: pole.y - dot(pole, up) * up.y,
		z: pole.z - dot(pole, up) * up.z
	});
	if (length(north) === 0) north = { x: 0, y: 0, z: -1 };
	return { east: cross(north, up), north, up };
}

export interface Attitude {
	/** Nose elevation above the horizon, rad, -pi/2..pi/2. */
	pitch: number;
	/** Nose azimuth clockwise from north, rad, [0, 2pi). */
	heading: number;
	/** Rotation about the nose, rad, positive = right side down, (-pi, pi]. */
	roll: number;
}

/** Nose/up/right axes of the vessel in BCI for orientation `q`. */
export function vesselAxes(q: Quat): { nose: Vec3; up: Vec3; right: Vec3 } {
	return {
		nose: qRotate(q, { x: 0, y: 1, z: 0 }),
		up: qRotate(q, { x: 0, y: 0, z: 1 }),
		right: qRotate(q, { x: 1, y: 0, z: 0 })
	};
}

/** Near-vertical band (rad) where the heading is taken from the vessel's up axis. */
const VERTICAL_BAND = 0.1 * DEG;

export function attitudeAngles(q: Quat, position: Vec3, pole: Vec3 = PLUS_Y): Attitude {
	const h = localHorizon(position, pole);
	const { nose, up: bodyUp, right } = vesselAxes(q);
	const sinPitch = Math.max(-1, Math.min(1, dot(nose, h.up)));
	const pitch = Math.asin(sinPitch);
	const azimuth = (v: Vec3): number => Math.atan2(dot(v, h.east), dot(v, h.north));
	let headingRad: number;
	if (Math.PI / 2 - Math.abs(pitch) < VERTICAL_BAND) {
		// Nose (anti)vertical: a plane pitched through the vertical keeps its heading, and its up
		// axis then points behind it (pitch > 0) or ahead of it (pitch < 0).
		headingRad = azimuth(pitch > 0 ? scale(bodyUp, -1) : bodyUp);
	} else {
		headingRad = azimuth(nose);
	}
	const heading = ((headingRad % TWO_PI) + TWO_PI) % TWO_PI;
	// Level reference for that heading: horizontal heading vector, level-right and level-up.
	const hv = add3(scale(h.north, Math.cos(headingRad)), scale(h.east, Math.sin(headingRad)), {
		x: 0,
		y: 0,
		z: 0
	});
	const levelRight = cross(hv, h.up);
	const levelUp = add3(scale(hv, -Math.sin(pitch)), scale(h.up, Math.cos(pitch)), {
		x: 0,
		y: 0,
		z: 0
	});
	const roll = Math.atan2(-dot(right, levelUp), dot(right, levelRight));
	return { pitch, heading, roll };
}

export interface BallPoint {
	/** Screen position on the unit disc, x right, y up. */
	x: number;
	y: number;
	/** Depth towards the viewer; > 0 is the visible hemisphere (in front of the nose). */
	z: number;
}

/** Local (east, north, up) coordinates of a horizon-frame direction as a BCI vector. */
export const fromHorizon = (h: Horizon, east: number, north: number, up: number): Vec3 =>
	add3(scale(h.east, east), scale(h.north, north), scale(h.up, up));

/** Direction at elevation `elev` and azimuth `az` (rad, clockwise from north) in BCI. */
export function horizonDirection(h: Horizon, az: number, elev: number): Vec3 {
	const c = Math.cos(elev);
	return fromHorizon(h, c * Math.sin(az), c * Math.cos(az), Math.sin(elev));
}

/** Projects a BCI direction onto the ball seen from behind the nose with +Z up. */
export function projectDirection(dir: Vec3, q: Quat): BallPoint {
	const a = vesselAxes(q);
	return { x: dot(dir, a.right), y: dot(dir, a.up), z: dot(dir, a.nose) };
}

/**
 * Contiguous visible (z >= 0) pieces of a curve given as BCI directions; pieces are cut exactly at
 * the rim so they can be stroked without crossing the disc edge.
 */
export function visibleRuns(dirs: readonly Vec3[], q: Quat): BallPoint[][] {
	const runs: BallPoint[][] = [];
	let run: BallPoint[] = [];
	let prev: BallPoint | null = null;
	for (const d of dirs) {
		const p = projectDirection(d, q);
		if (prev) {
			if (prev.z >= 0 !== p.z >= 0) {
				const t = prev.z / (prev.z - p.z);
				const cut = {
					x: prev.x + (p.x - prev.x) * t,
					y: prev.y + (p.y - prev.y) * t,
					z: 0
				};
				const m = Math.hypot(cut.x, cut.y) || 1;
				cut.x /= m;
				cut.y /= m;
				if (prev.z >= 0) {
					run.push(cut);
					runs.push(run);
					run = [];
				} else {
					run = [cut];
				}
			}
		}
		if (p.z >= 0) run.push(p);
		prev = p;
	}
	if (run.length > 1) runs.push(run);
	return runs.filter((r) => r.length > 1);
}

/** A latitude circle (constant elevation) as a closed list of BCI directions. */
export function elevationCircle(h: Horizon, elev: number, segments = 72): Vec3[] {
	const out: Vec3[] = [];
	for (let i = 0; i <= segments; i++) out.push(horizonDirection(h, (i / segments) * TWO_PI, elev));
	return out;
}

/** A meridian (constant azimuth) between two elevations. */
export function meridian(h: Horizon, az: number, from: number, to: number, segments = 24): Vec3[] {
	const out: Vec3[] = [];
	for (let i = 0; i <= segments; i++)
		out.push(horizonDirection(h, az, from + ((to - from) * i) / segments));
	return out;
}

export type GroundRegion =
	| { kind: 'none' }
	| { kind: 'full' }
	| {
			kind: 'region';
			/** Horizon curve from rim point A to rim point B (on the visible side). */
			horizon: BallPoint[];
			/** Rim arc from B back to A, mathematical angles, counter-clockwise if `ccw`. */
			rimFrom: number;
			rimTo: number;
			ccw: boolean;
	  };

/** The visible part of the below-horizon hemisphere, as a closed region of the disc. */
export function groundRegion(h: Horizon, q: Quat): GroundRegion {
	const n = projectDirection({ x: -h.up.x, y: -h.up.y, z: -h.up.z }, q); // ground pole in view coords
	const nxy = Math.hypot(n.x, n.y);
	if (nxy < 1e-9) return n.z > 0 ? { kind: 'full' } : { kind: 'none' };
	// Orthonormal basis (c, s) of the horizon plane, in view coordinates.
	const c = projectDirection(h.north, q);
	const s = projectDirection(h.east, q);
	const pts: BallPoint[] = [];
	const N = 180;
	for (let i = 0; i <= N; i++) {
		const a = (i / N) * TWO_PI;
		pts.push({
			x: c.x * Math.cos(a) + s.x * Math.sin(a),
			y: c.y * Math.cos(a) + s.y * Math.sin(a),
			z: c.z * Math.cos(a) + s.z * Math.sin(a)
		});
	}
	// Rim end points: perpendicular to the ground pole's screen direction.
	const A = { x: -n.y / nxy, y: n.x / nxy, z: 0 };
	const B = { x: n.y / nxy, y: -n.x / nxy, z: 0 };
	// Walk the front half of the horizon circle; the end nearest A goes first.
	const front = frontHalf(pts);
	if (front.length < 2) return n.z > 0 ? { kind: 'full' } : { kind: 'none' };
	const first = front[0]!;
	const dA = Math.hypot(first.x - A.x, first.y - A.y);
	const dB = Math.hypot(first.x - B.x, first.y - B.y);
	const ordered = dA <= dB ? front : [...front].reverse();
	const mAngle = Math.atan2(n.y, n.x);
	const bAngle = Math.atan2(B.y, B.x);
	const aAngle = Math.atan2(A.y, A.x);
	// CCW from B by +90 degrees points along rot90(B); the ground side of the rim contains m.
	const rot = { x: -B.y, y: B.x };
	const ccw = Math.cos(mAngle) * rot.x + Math.sin(mAngle) * rot.y > 0;
	return { kind: 'region', horizon: ordered, rimFrom: bAngle, rimTo: aAngle, ccw };
}

/** The z >= 0 stretch of the sampled horizon circle, cut at the rim; assumes one such stretch. */
function frontHalf(pts: readonly BallPoint[]): BallPoint[] {
	// Rotate the start so the sequence begins on a back-facing sample, then take the z >= 0 run.
	let start = 0;
	for (let i = 0; i < pts.length; i++) {
		if (pts[i]!.z < 0) {
			start = i;
			break;
		}
	}
	const ring = [...pts.slice(start, pts.length - 1), ...pts.slice(0, start + 1)];
	const out: BallPoint[] = [];
	for (let i = 0; i < ring.length; i++) {
		const p = ring[i]!;
		const prev = ring[i - 1];
		if (prev && prev.z < 0 !== p.z < 0) {
			const t = prev.z / (prev.z - p.z);
			const m = { x: prev.x + (p.x - prev.x) * t, y: prev.y + (p.y - prev.y) * t, z: 0 };
			const l = Math.hypot(m.x, m.y) || 1;
			out.push({ x: m.x / l, y: m.y / l, z: 0 });
		}
		if (p.z >= 0) out.push(p);
	}
	return out;
}

export type MarkerKind =
	| 'prograde'
	| 'retrograde'
	| 'radial-out'
	| 'radial-in'
	| 'normal'
	| 'anti-normal'
	| 'maneuver'
	| 'target'
	| 'anti-target'
	| 'target-prograde'
	| 'target-retrograde';

/** The target as the markers need it (plan 057): relative to the vessel, BCI axes. */
export interface MarkerTarget {
	/** Position of the target relative to the vessel, m. */
	position: Vec3;
	/** Velocity of the target relative to the vessel, m/s. */
	velocity: Vec3;
	/** The speed readout is in `target` mode: its prograde pair is relative to the target. */
	relative: boolean;
}

export interface Marker {
	kind: MarkerKind;
	dir: Vec3;
}

/** A remaining burn shorter than this (m/s) has no marker. */
export const MIN_BURN = 0.01;

/** Below this speed (m/s) in the selected mode the velocity-based markers are meaningless. */
export const MARKER_MIN_SPEED = 0.5;

/**
 * Marker directions (BCI): prograde/retrograde from `velocity` (the speed mode's velocity), and the
 * orbit's radial and normal directions from the inertial state (`h = r x v`), and the remaining
 * burn of the earliest maneuver node (`burn`, BCI) when there is one, and with a `target` its
 * direction and the opposite (plan 057); in target mode the prograde pair is relative to the target
 * (`velocity` is then the vessel's velocity relative to it). Empty when slow, no node, no target.
 */
export function markerDirections(
	position: Vec3,
	inertialVelocity: Vec3,
	velocity: Vec3,
	burn?: Vec3,
	target?: MarkerTarget | null
): Marker[] {
	const node: Marker[] =
		burn && length(burn) > MIN_BURN ? [{ kind: 'maneuver', dir: normalize(burn) }] : [];
	const neg = (v: Vec3): Vec3 => ({ x: 0 - v.x, y: 0 - v.y, z: 0 - v.z });
	// The target and its opposite, whenever there is a target further than a metre away.
	const aim: Marker[] =
		target && length(target.position) > 1
			? [
					{ kind: 'target', dir: normalize(target.position) },
					{ kind: 'anti-target', dir: neg(normalize(target.position)) }
				]
			: [];
	if (length(velocity) < MARKER_MIN_SPEED) return [...aim, ...node];
	const pro = normalize(velocity);
	const radial = normalize(position);
	const h = normalize(cross(position, inertialVelocity));
	const relative = target?.relative === true;
	const out: Marker[] = [
		{ kind: relative ? 'target-prograde' : 'prograde', dir: pro },
		{ kind: relative ? 'target-retrograde' : 'retrograde', dir: neg(pro) }
	];
	if (length(h) > 0) {
		out.push(
			{ kind: 'radial-out', dir: radial },
			{ kind: 'radial-in', dir: neg(radial) },
			{ kind: 'normal', dir: h },
			{ kind: 'anti-normal', dir: neg(h) }
		);
	}
	return [...out, ...aim, ...node];
}
