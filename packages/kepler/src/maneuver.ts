/**
 * Maneuver nodes on a patched-conic path (plan 045, ADR 0056). A node is an impulsive burn at a
 * time, given in the orbital frame of the path at that moment (prograde, normal, radial) or as an
 * absolute post-burn velocity (`target`, the burn that is left while the vessel is burning).
 * `predictWithManeuvers` chains `predictPatchedConics` through the nodes; the sim uses it to resolve
 * its nodes and the page to draw them, so both agree by construction. Pure functions.
 */
import { propagate, propagateUniversal } from './propagate.ts';
import type { StateVector } from './convert.ts';
import {
	predictPatchedConics,
	type PatchedBody,
	type PatchedOptions,
	type PatchedSegment,
	type PatchedStart
} from './patched.ts';
import { add, cross, dot, length, normalize, scale, sub, type Vec3 } from './vec3.ts';

/** Components of a burn along the axes of the orbital frame, m/s. */
export interface BurnComponents {
	prograde: number;
	normal: number;
	radial: number;
}

/** Unit axes of the orbital frame of a state: right-handed, `prograde x normal = radial`. */
export interface OrbitalAxes {
	prograde: Vec3;
	normal: Vec3;
	radial: Vec3;
}

/**
 * Orbital frame of the state `(r, v)`: prograde along the velocity, normal along `r x v`, radial
 * (out) perpendicular to both, in the orbit plane, away from the body for a bound orbit. A radial
 * or resting state has no plane; the normal is then any perpendicular of the velocity.
 */
export function orbitalAxes(r: Vec3, v: Vec3): OrbitalAxes {
	const speed = length(v);
	const prograde = speed > 0 ? scale(v, 1 / speed) : normalize(r);
	const h = cross(r, v);
	let normal: Vec3;
	if (length(h) > 1e-9 * Math.max(length(r) * speed, 1e-300)) normal = normalize(h);
	else {
		const pick = Math.abs(prograde.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
		normal = normalize(cross(pick, prograde));
	}
	return { prograde, normal, radial: cross(prograde, normal) };
}

/** The burn vector with these components in the frame `axes`. */
export const burnVector = (axes: OrbitalAxes, dv: BurnComponents): Vec3 =>
	add(
		add(scale(axes.prograde, dv.prograde), scale(axes.normal, dv.normal)),
		scale(axes.radial, dv.radial)
	);

/** Components of the vector `burn` along the axes. Inverse of `burnVector`. */
export const burnComponents = (axes: OrbitalAxes, burn: Vec3): BurnComponents => ({
	prograde: dot(burn, axes.prograde),
	normal: dot(burn, axes.normal),
	radial: dot(burn, axes.radial)
});

export interface ManeuverInput extends BurnComponents {
	id: number;
	/** Sim time of the burn, s. */
	time: number;
	/**
	 * Absolute velocity after the burn, relative to `body` (the frame the node lies in). When the
	 * path passes the node in that body the burn is `target.v - pre.v` and the components are
	 * ignored; otherwise the components apply.
	 */
	target?: { body: string; v: Vec3 };
}

export interface ManeuverNodeResult {
	id: number;
	time: number;
	/** Body whose frame the node lies in. */
	body: string;
	/** Index in `ManeuverPath.segments` of the stretch that ends at the node (-1 for a node in the past). */
	segment: number;
	/** Position of the body's centre in the system frame at the node time. */
	bodyOffset: Vec3;
	pre: StateVector;
	post: StateVector;
	/** The burn that applies, as a vector (inertial axes) and in the orbital frame at the node. */
	burn: Vec3;
	dv: BurnComponents;
	/** Magnitude of the burn, m/s. */
	magnitude: number;
}

export interface ManeuverPath {
	segments: PatchedSegment[];
	/** Reachable nodes, in time order. */
	nodes: ManeuverNodeResult[];
	/** Ids of nodes the path never reaches (an impact comes first, or the path is cut short). */
	unreachable: number[];
}

/** Position of `body`'s centre in the system frame at `t`. */
function systemOffset(bodies: readonly PatchedBody[], id: string, t: number): Vec3 {
	const byId = new Map(bodies.map((b) => [b.id, b]));
	let r: Vec3 = { x: 0, y: 0, z: 0 };
	for (let b = byId.get(id); b?.parent && b.orbit; b = byId.get(b.parent)) {
		const parent = byId.get(b.parent);
		if (!parent) throw new RangeError(`unknown body "${b.parent}"`);
		r = add(r, propagate(b.orbit, parent.mu, t).r);
	}
	return r;
}

const muOf = (bodies: readonly PatchedBody[], id: string): number => {
	const b = bodies.find((x) => x.id === id);
	if (!b) throw new RangeError(`unknown body "${id}"`);
	return b.mu;
};

/**
 * The state of the path from `start` at time `t`: before `start.t` the conic is run backwards in
 * the starting body, after it the patched path is followed through the spheres of influence.
 * Undefined when the path ends first (impact, segment limit).
 */
export function patchedStateAt(
	bodies: readonly PatchedBody[],
	start: PatchedStart,
	t: number,
	options: PatchedOptions = {}
): { body: string; r: Vec3; v: Vec3 } | undefined {
	if (t <= start.t) {
		const s = propagateUniversal(start.r, start.v, muOf(bodies, start.body), t - start.t);
		return { body: start.body, r: s.r, v: s.v };
	}
	const segments = predictPatchedConics(bodies, start, t - start.t, options);
	const last = segments.at(-1);
	if (!last || last.end !== 'horizon' || last.t1 < t - 1e-6) return undefined;
	return { body: last.body, r: last.exit.r, v: last.exit.v };
}

/**
 * Path of `start` for `horizon` seconds with the impulsive burns of `nodes` applied in time order.
 * A node at or before `start.t` is reported (its burn from the conic run backwards) but changes
 * nothing: the start state already contains what has been burned.
 */
export function predictWithManeuvers(
	bodies: readonly PatchedBody[],
	start: PatchedStart,
	nodes: readonly ManeuverInput[],
	horizon: number,
	options: PatchedOptions = {},
	/** The path between burns: patched conics, or the n-body path (plan 125). */
	predict: typeof predictPatchedConics = predictPatchedConics
): ManeuverPath {
	const sorted = [...nodes].sort((a, b) => a.time - b.time || a.id - b.id);
	const end = start.t + horizon;
	const segments: PatchedSegment[] = [];
	const results: ManeuverNodeResult[] = [];
	const unreachable: number[] = [];
	let cur: PatchedStart = start;

	const resolve = (
		node: ManeuverInput,
		body: string,
		pre: StateVector
	): { burn: Vec3; dv: BurnComponents } => {
		const axes = orbitalAxes(pre.r, pre.v);
		if (node.target && node.target.body === body) {
			const burn = sub(node.target.v, pre.v);
			return { burn, dv: burnComponents(axes, burn) };
		}
		const dv = { prograde: node.prograde, normal: node.normal, radial: node.radial };
		return { burn: burnVector(axes, dv), dv };
	};
	const record = (
		node: ManeuverInput,
		body: string,
		segment: number,
		pre: StateVector,
		applied: boolean
	): StateVector => {
		const { burn, dv } = resolve(node, body, pre);
		const post = { r: pre.r, v: add(pre.v, burn) };
		results.push({
			id: node.id,
			time: node.time,
			body,
			segment,
			bodyOffset: systemOffset(bodies, body, node.time),
			pre,
			post,
			burn,
			dv,
			magnitude: length(burn)
		});
		return applied ? post : pre;
	};

	for (let k = 0; k < sorted.length; k++) {
		const node = sorted[k]!;
		if (node.time <= start.t) {
			const s = propagateUniversal(start.r, start.v, muOf(bodies, start.body), node.time - start.t);
			record(node, start.body, -1, s, false);
			continue;
		}
		if (node.time > end) break;
		if (node.time > cur.t) {
			const leg = predict(bodies, cur, node.time - cur.t, options);
			const last = leg.at(-1);
			if (!last || last.end !== 'horizon' || last.t1 < node.time - 1e-6) {
				segments.push(...leg);
				for (const rest of sorted.slice(k)) if (rest.time > start.t) unreachable.push(rest.id);
				return { segments, nodes: results, unreachable };
			}
			segments.push(...leg);
			const post = record(node, last.body, segments.length - 1, last.exit, true);
			cur = { body: last.body, r: post.r, v: post.v, t: node.time };
		} else {
			// Two nodes at the same time: the second burns from where the first left off.
			const post = record(node, cur.body, segments.length - 1, { r: cur.r, v: cur.v }, true);
			cur = { ...cur, v: post.v };
		}
	}
	if (cur.t < end) segments.push(...predict(bodies, cur, end - cur.t, options));
	return { segments, nodes: results, unreachable };
}
