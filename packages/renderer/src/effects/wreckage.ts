/**
 * Wreckage that stays (plan 040, ADR 0077): the pieces an impact throws land, lie flat on the
 * ground and stay for `WRECK_LIFETIME` seconds of simulated time. Pure maths in a tangent frame
 * with +Y up and the explosion centre at the origin, so it is tested without a GPU. The sim has
 * long since deleted the vessel (ADR 0021); this is only what the player sees.
 */
import type { Vec3 } from '@orbital/core';
import { createParticleRng } from './particles.ts';
import type { Shard } from './explosion.ts';
import type { ShardSource } from './shards.ts';

/** Seconds of simulated time a wreck stays. */
export const WRECK_LIFETIME = 900;
/** Seconds at the end of the life during which the wreck sinks into the ground. */
export const WRECK_FADE = 30;
/** How deep a fading wreck sinks, m. */
export const WRECK_SINK_DEPTH = 1.5;
/** Wrecks kept; the oldest goes when a new one arrives. */
export const MAX_WRECKS = 8;
/** Seconds of faint smoke from a fresh wreck. */
export const WRECK_SMOULDER = 45;
/** Colour multiplier of scorched wreckage. */
export const WRECK_SCORCH = 0.55;
/** A piece that would take longer than this to land is not kept (it was thrown from high up), s. */
export const MAX_FLIGHT_TIME = 12;
/** A piece rests this share of its thickness above the ground. */
const REST_CLEARANCE = 0.5;

export interface Quaternion4 {
	x: number;
	y: number;
	z: number;
	w: number;
}

/** Time when a piece thrown from height `y0` with vertical speed `vy` reaches `floor` under gravity `g`. */
export function landingTime(y0: number, vy: number, floor: number, g: number): number {
	const disc = vy * vy + 2 * g * (y0 - floor);
	if (disc < 0) return Math.max(0, vy / g);
	return Math.max(0, (vy + Math.sqrt(disc)) / g);
}

/** Where a shard touches the floor (tangent plane coordinates) and when. */
export function landing(
	shard: Shard,
	floor: number,
	g: number
): { time: number; x: number; z: number } {
	const time = landingTime(shard.y0, shard.vy, floor, g);
	return { time, x: shard.x0 + shard.vx * time, z: shard.z0 + shard.vz * time };
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x
});

/** Unit normal of triangle `t` of a source, part frame (the thickness direction of its prism). */
export function triangleNormal(source: ShardSource, t: number): Vec3 {
	const p = source.triangles;
	const o = t * 9;
	const u = { x: p[o + 3]! - p[o]!, y: p[o + 4]! - p[o + 1]!, z: p[o + 5]! - p[o + 2]! };
	const v = { x: p[o + 6]! - p[o]!, y: p[o + 7]! - p[o + 1]!, z: p[o + 8]! - p[o + 2]! };
	const n = cross3(u, v);
	const l = Math.hypot(n.x, n.y, n.z);
	return l > 1e-12 ? { x: n.x / l, y: n.y / l, z: n.z / l } : { x: 0, y: 1, z: 0 };
}

/** Quaternion of the shortest rotation taking unit `a` to unit `b`. */
export function rotationBetween(a: Vec3, b: Vec3): Quaternion4 {
	const d = a.x * b.x + a.y * b.y + a.z * b.z;
	if (d < -1 + 1e-9) {
		// opposite: half a turn about any axis perpendicular to a
		const axis = Math.abs(a.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
		const c = cross3(a, axis);
		const l = Math.hypot(c.x, c.y, c.z);
		return { x: c.x / l, y: c.y / l, z: c.z / l, w: 0 };
	}
	const c = cross3(a, b);
	const q = { x: c.x, y: c.y, z: c.z, w: 1 + d };
	const l = Math.hypot(q.x, q.y, q.z, q.w);
	return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

export const quatMul = (a: Quaternion4, b: Quaternion4): Quaternion4 => ({
	w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
	x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
	y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
	z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
});

export function rotateBy(q: Quaternion4, v: Vec3): Vec3 {
	const t = cross3({ x: q.x, y: q.y, z: q.z }, v);
	const tx = 2 * t.x;
	const ty = 2 * t.y;
	const tz = 2 * t.z;
	const u = cross3({ x: q.x, y: q.y, z: q.z }, { x: tx, y: ty, z: tz });
	return { x: v.x + q.w * tx + u.x, y: v.y + q.w * ty + u.y, z: v.z + q.w * tz + u.z };
}

export const axisAngle = (axis: Vec3, angle: number): Quaternion4 => {
	const l = Math.hypot(axis.x, axis.y, axis.z) || 1;
	const s = Math.sin(angle / 2) / l;
	return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: Math.cos(angle / 2) };
};

/**
 * The pose of a piece lying on the ground: its prism's thickness axis (the triangle normal in
 * the part frame) turned to point up (either face may lie down: the nearer is taken), then turned
 * about the vertical by `yaw`. Returns the rotation from the part frame to the tangent frame.
 */
export function layFlat(normal: Vec3, yaw: number): Quaternion4 {
	const up = { x: 0, y: 1, z: 0 };
	const sign = normal.y >= 0 ? 1 : -1;
	const flat = rotationBetween({ x: normal.x * sign, y: normal.y * sign, z: normal.z * sign }, up);
	return quatMul(axisAngle(up, yaw), flat);
}

export interface WreckPiece {
	/** Index of the shard this piece is (into `Explosion.shards`). */
	shard: number;
	/** Index into the sources the wreck was cut from. */
	source: number;
	triangle: number;
	/** Edge length, m, and thickness, m (as the flight draws it). */
	edge: number;
	thickness: number;
	/** Seconds after the impact when it touches the ground. */
	landTime: number;
	/** Rest position in the tangent frame, m. */
	x: number;
	z: number;
	/** Rest height above the centre plane, m (follows the ground under the piece). */
	y: number;
	/** Rest rotation, part frame to tangent frame. */
	rest: Quaternion4;
}

export interface WreckPlan {
	pieces: WreckPiece[];
	/** Time after the impact when the last piece has landed, s. */
	settled: number;
}

export interface WreckInput {
	seed: number;
	shards: readonly Shard[];
	/** For shard `k`: source index and triangle (`Explosion.pieces`). */
	pieces: ReadonlyArray<{ source: number; triangle: number }>;
	sources: readonly ShardSource[];
	/** Height of the floor at the centre above the centre plane, m (<= 0 when the centre is above ground). */
	floor: number;
	/** Height of the ground above the centre plane at a tangent point, m. Default: the floor. */
	groundAt?: (x: number, z: number) => number;
	gravity: number;
}

/** Lays out where every shard comes to rest (deterministic for a seed). */
export function planWreck(input: WreckInput): WreckPlan {
	const rnd = createParticleRng(input.seed ^ 0x9e3779b9);
	const out: WreckPiece[] = [];
	let settled = 0;
	for (let k = 0; k < input.shards.length; k++) {
		const s = input.shards[k]!;
		const piece = input.pieces[k];
		if (!piece) continue;
		const source = input.sources[piece.source];
		if (!source || piece.triangle >= source.cumulativeArea.length) continue;
		const l = landing(s, input.floor, input.gravity);
		if (l.time > MAX_FLIGHT_TIME) continue;
		const edge = s.size * 3;
		const thickness = s.size * 0.5;
		const ground = input.groundAt ? input.groundAt(l.x, l.z) : input.floor;
		const yaw = rnd() * Math.PI * 2;
		out.push({
			shard: k,
			source: piece.source,
			triangle: piece.triangle,
			edge,
			thickness,
			landTime: l.time,
			x: l.x,
			z: l.z,
			y: ground + thickness * REST_CLEARANCE,
			rest: layFlat(triangleNormal(source, piece.triangle), yaw)
		});
		settled = Math.max(settled, l.time);
	}
	return { pieces: out, settled };
}

const smooth = (t: number): number => {
	const c = Math.min(1, Math.max(0, t));
	return c * c * (3 - 2 * c);
};

/** 1 while the wreck is whole, falling to 0 over the last `WRECK_FADE` s of its life. */
export function wreckPresence(age: number): number {
	if (!(age < WRECK_LIFETIME)) return 0;
	return 1 - smooth((age - (WRECK_LIFETIME - WRECK_FADE)) / WRECK_FADE);
}

/** How far a wreck has sunk at `age`, m (0 until the fade). */
export const wreckSink = (age: number): number => (1 - wreckPresence(age)) * WRECK_SINK_DEPTH;

/** Seconds after `landTime` over which a landing piece settles into its rest pose. */
export const SETTLE_TIME = 0.25;

/** 0 while in flight, 1 once settled, smooth between: the blend from the tumble to the rest pose. */
export const settleBlend = (age: number, landTime: number): number =>
	smooth((age - landTime) / SETTLE_TIME);

/** Keeps at most `max` wrecks, dropping the oldest first. Returns the kept list (new array). */
export function evictOldest<T>(list: readonly T[], max: number): T[] {
	return list.length > max ? list.slice(list.length - max) : list.slice();
}
