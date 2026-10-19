/**
 * The map's navigation markers (plan 224, ADR 0223): ascending and descending nodes relative to the
 * target's orbit plane, or to the body's equator without a target, and the apsides of a planned
 * stretch. Pure and DOM-free; the HUD controller projects the points.
 */
import {
	cross,
	dot,
	length,
	normalize,
	propagateUniversal,
	relativeNodes,
	scale,
	trueToMean,
	wrapTwoPi,
	type StateVector,
	type Vec3
} from '@orbital/kepler';

/** A map marker the player can warp to or set an alarm at. */
export interface NavMark {
	kind: 'apoapsis' | 'periapsis' | 'ascending' | 'descending';
	/** On the orbit after a maneuver node. */
	planned: boolean;
	/** Sim time it is passed. */
	time: number;
	label: string;
}

export interface PlaneNode {
	kind: 'ascending' | 'descending';
	/** Sim time of the crossing, s. */
	time: number;
	/** Position of the crossing relative to the body, m. */
	position: Vec3;
	/** True anomaly of the crossing on the vessel's orbit, rad in [0, 2π). */
	trueAnomaly: number;
}

/** A state on a circle in the plane with unit normal `normal` (only its plane matters here). */
function planeState(normal: Vec3, mu: number): StateVector {
	const n = normalize(normal);
	const helper = Math.abs(n.x) < 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 0, z: 1 };
	const r = scale(normalize(cross(helper, n)), 1e7);
	const v = scale(normalize(cross(n, r)), Math.sqrt(mu / 1e7));
	return { r, v };
}

const TWO_PI = 2 * Math.PI;

/** True anomaly of `point` on the orbit of `own` (its periapsis direction, or `own.r` when circular). */
function trueAnomalyOf(own: StateVector, mu: number, point: Vec3): number {
	const r = length(own.r);
	const v2 = dot(own.v, own.v);
	const h = normalize(cross(own.r, own.v));
	const eVec = scale(
		{
			x: own.r.x * (v2 - mu / r) - own.v.x * dot(own.r, own.v),
			y: own.r.y * (v2 - mu / r) - own.v.y * dot(own.r, own.v),
			z: own.r.z * (v2 - mu / r) - own.v.z * dot(own.r, own.v)
		},
		1 / mu
	);
	const e = length(eVec);
	const p = e > 1e-9 ? scale(eVec, 1 / e) : normalize(own.r);
	const q = cross(h, p);
	const nu = Math.atan2(dot(point, q), dot(point, p));
	return nu < 0 ? nu + TWO_PI : nu;
}

/**
 * Where the closed orbit of `own` crosses the plane with normal `reference` (ADR 0223): the target's
 * orbit normal, or the body's pole for the equator. Empty for an open orbit or one in that plane.
 */
export function planeNodes(
	own: StateVector,
	reference: Vec3,
	mu: number,
	now: number
): PlaneNode[] {
	let found: ReturnType<typeof relativeNodes>;
	try {
		found = relativeNodes(own, planeState(reference, mu), mu, now);
	} catch {
		return [];
	}
	return found.map((n) => {
		const position = propagateUniversal(own.r, own.v, mu, n.time - now).r;
		return {
			kind: n.kind,
			time: n.time,
			position,
			trueAnomaly: trueAnomalyOf(own, mu, position)
		};
	});
}

/** The reference plane's normal: the target's orbit if it shares the vessel's sphere, else the pole. */
export function referenceNormal(
	own: StateVector,
	target: { position: Vec3; velocity: Vec3; sameSphere: boolean } | null,
	pole: Vec3
): { normal: Vec3; relativeTo: 'target' | 'equator' } {
	if (target?.sameSphere) {
		const r = {
			x: own.r.x + target.position.x,
			y: own.r.y + target.position.y,
			z: own.r.z + target.position.z
		};
		const v = {
			x: own.v.x + target.velocity.x,
			y: own.v.y + target.velocity.y,
			z: own.v.z + target.velocity.z
		};
		const n = cross(r, v);
		if (length(n) > 0) return { normal: normalize(n), relativeTo: 'target' };
	}
	return { normal: pole, relativeTo: 'equator' };
}

/** Apoapsis and periapsis points of a stretch that starts at `entry` and lasts `span` s, when they fall in it. */
export function stretchApsides(
	entry: StateVector,
	mu: number,
	span: number
): Array<{ kind: 'apoapsis' | 'periapsis'; after: number; position: Vec3; radius: number }> {
	const r = length(entry.r);
	const energy = dot(entry.v, entry.v) / 2 - mu / r;
	const h = length(cross(entry.r, entry.v));
	const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (mu * mu)));
	if (!(e > 1e-6) || Math.abs(e - 1) < 1e-6) return [];
	const a = -mu / (2 * energy);
	const n = Math.sqrt(mu / Math.abs(a * a * a));
	const nu = trueAnomalyOf(entry, mu, entry.r);
	const m0 = trueToMean(nu > Math.PI ? nu - TWO_PI : nu, e);
	const out: Array<{
		kind: 'apoapsis' | 'periapsis';
		after: number;
		position: Vec3;
		radius: number;
	}> = [];
	for (const kind of ['periapsis', 'apoapsis'] as const) {
		let after: number;
		if (e < 1) after = wrapTwoPi((kind === 'periapsis' ? 0 : Math.PI) - m0) / n;
		else if (kind === 'periapsis' && m0 < 0) after = -m0 / n;
		else continue; // an open path has no apoapsis, and its periapsis is behind it once it heads out
		if (after > span) continue;
		const position = propagateUniversal(entry.r, entry.v, mu, after).r;
		out.push({ kind, after, position, radius: length(position) });
	}
	return out;
}
