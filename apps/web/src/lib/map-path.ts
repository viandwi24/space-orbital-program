/**
 * The predicted path across spheres of influence for the map view (plan 044): `kepler`'s patched
 * conics sampled into polylines, one per body the path passes through. The renderer draws them
 * (`Renderer.setMapPath`); it never imports kepler. Plan 045 reuses `bodyNodes` to plan burns.
 */
import {
	GRAVITATIONAL_CONSTANT,
	type BodyDefinition,
	type Snapshot,
	type Vec3
} from '@orbital/core';
import {
	fromStateVector,
	KeplerError,
	orbitalAxes,
	trajectoryFor,
	propagateUniversal,
	soiRadius,
	type ManeuverInput,
	type OrbitalAxes,
	tagTrajectoryModel,
	type PatchedBody,
	type PatchedSegment
} from '@orbital/kepler';

/**
 * What a body contributes to the prediction, from its definition; the list is tagged with the
 * world's gravity model, so the map and the aids predict as the sim flies (plan 125).
 */
export function bodyNodes(
	bodies: readonly BodyDefinition[],
	gravityModel: 'patched' | 'n-body' = 'patched'
): PatchedBody[] {
	const byId = new Map(bodies.map((b) => [b.id, b]));
	return tagTrajectoryModel(bodies.map((b) => {
		const parent = b.parent === undefined ? undefined : byId.get(b.parent);
		return {
			id: b.id,
			mu: GRAVITATIONAL_CONSTANT * b.mass,
			soi: parent && b.orbit ? soiRadius(b.orbit.a, b.mass, parent.mass) : Number.POSITIVE_INFINITY,
			radius: b.radius,
			...(parent && b.orbit ? { parent: parent.id, orbit: b.orbit } : {})
		};
	}), gravityModel);
}

export interface MapPath {
	body: string;
	/** Where the body's centre is when the stretch starts, system frame, m. */
	offset: Vec3;
	points: Vec3[];
	/** Start and end of the stretch, s of sim time. */
	t0: number;
	t1: number;
	end: PatchedSegment['end'];
	/** The stretch lies after a maneuver node (plan 045). */
	planned?: boolean;
	/** Periapsis radius of the stretch's conic, m from the body's centre, when it has one. */
	periapsis?: number;
}

/** Samples per stretch. */
const SAMPLES = 160;

/**
 * Predicted path of `vessel` for `horizon` seconds from `snapshot`, or `[]` for a vessel fixed to the
 * ground or one that never leaves its sphere (the vessel's own orbit line already shows that).
 */
export function predictMapPath(
	snapshot: Snapshot,
	vessel: number,
	nodes: readonly PatchedBody[],
	horizon: number,
	/** Return the path also when it stays in one sphere (picking a node's time needs it). */
	keepSingle = false
): MapPath[] {
	const v = snapshot.vessels.find((s) => Number(s.id) === vessel);
	if (!v || v.surface) return [];
	// The root part's origin, not the centre of mass: metres of difference at the scale of a map.
	const segments = trajectoryFor(nodes).predict(
		{ body: String(v.soi), r: v.position, v: v.velocity, t: snapshot.t },
		horizon
	);
	if (segments.length < 2 && !keepSingle) return [];
	return segments.map((s) => mapPathOf(s, nodes));
}

/** One stretch sampled into a polyline relative to its body. */
function mapPathOf(s: PatchedSegment, bodies: readonly PatchedBody[], planned = false): MapPath {
	const node = bodies.find((n) => n.id === s.body)!;
	const points: Vec3[] = [];
	const span = Math.max(s.t1 - s.t0, 0);
	for (let k = 0; k <= SAMPLES; k++) {
		points.push(propagateUniversal(s.entry.r, s.entry.v, node.mu, (span * k) / SAMPLES).r);
	}
	const out: MapPath = {
		body: s.body,
		offset: s.bodyOffset,
		points,
		t0: s.t0,
		t1: s.t1,
		end: s.end
	};
	if (planned) out.planned = true;
	if (s.elements && s.elements.e < 1) out.periapsis = s.elements.a * (1 - s.elements.e);
	else if (s.elements) out.periapsis = Math.abs(s.elements.a) * (s.elements.e - 1);
	return out;
}

/** A maneuver as the snapshot reports it (the burn that is left, orbital frame at the node). */
export type NodeInput = Pick<ManeuverInput, 'id' | 'time' | 'prograde' | 'normal' | 'radial'>;

/** Where a node sits on the drawn path, for the handles. */
export interface NodePlacement {
	id: number;
	time: number;
	/** Position of the node in the system frame, m (the drawn path's body offset plus the state). */
	world: Vec3;
	/** Orbital frame axes at the node (unit vectors, inertial axes). */
	axes: OrbitalAxes;
	/** Speed at the node, m/s. */
	speed: number;
	/** Index of the path the node ends. */
	path: number;
}

export interface ManeuverPrediction {
	paths: MapPath[];
	nodes: NodePlacement[];
	/** Ids of nodes the path never reaches. */
	unreachable: number[];
}

/** Longest look-ahead after the last node, s (ten days, like the node limit). */
const MAX_AFTER = 10 * 86_400;

/**
 * How far to predict past `start` with `maneuvers` applied: up to the last node, then what its new
 * orbit needs (`horizon` when no node is reached), at most ten days after it.
 */
export function maneuverReach(
	start: { body: string; r: Vec3; v: Vec3; t: number },
	bodies: readonly PatchedBody[],
	maneuvers: readonly NodeInput[],
	horizon: number
): number {
	const last = Math.max(...maneuvers.map((m) => m.time));
	const ahead = Math.max(0, last - start.t);
	// Look past the last node by what its new orbit needs.
	const probe = trajectoryFor(bodies).predictWithManeuvers(start, maneuvers, ahead + 1);
	const post = probe.nodes.at(-1)?.post;
	const postBody = probe.nodes.at(-1)?.body;
	let after = horizon;
	if (post && postBody) {
		const mu = bodies.find((b) => b.id === postBody)?.mu ?? 0;
		let elements: ReturnType<typeof fromStateVector> | undefined;
		try {
			elements = fromStateVector(post.r, post.v, mu, last);
		} catch (e) {
			if (!(e instanceof KeplerError)) throw e;
		}
		after = predictionHorizon(elements, mu);
	}
	return ahead + Math.min(after, MAX_AFTER);
}

/**
 * Predicted path of `vessel` with the impulsive burns of `maneuvers` applied (plan 045). Unlike
 * `predictMapPath` this returns the path also when it stays in one sphere, because the stretch
 * after a node is the point of the exercise; stretches after the first node are `planned`.
 */
export function predictManeuvers(
	snapshot: Snapshot,
	vessel: number,
	bodies: readonly PatchedBody[],
	maneuvers: readonly NodeInput[],
	horizon: number
): ManeuverPrediction {
	const v = snapshot.vessels.find((s) => Number(s.id) === vessel);
	if (!v || v.surface || maneuvers.length === 0) return { paths: [], nodes: [], unreachable: [] };
	const start = { body: String(v.soi), r: v.position, v: v.velocity, t: snapshot.t };
	const reach = maneuverReach(start, bodies, maneuvers, horizon);
	// A node whose time has passed still has burn left: the path is drawn as if that burn were
	// finished now, the node itself stays where it was.
	const past = maneuvers.some((m) => m.time <= snapshot.t);
	const drawn = past
		? maneuvers.map((m) => (m.time <= snapshot.t ? { ...m, time: snapshot.t + 0.5 } : m))
		: maneuvers;
	const trajectory = trajectoryFor(bodies);
	const result = trajectory.predictWithManeuvers(start, drawn, reach);
	const where = new Map(
		(past ? trajectory.predictWithManeuvers(start, maneuvers, 1).nodes : []).map((n) => [n.id, n])
	);
	const firstNode = Math.min(...result.nodes.map((n) => n.segment).filter((i) => i >= 0), Infinity);
	const paths = result.segments.map((s, i) => mapPathOf(s, bodies, i > firstNode));
	const nodes: NodePlacement[] = result.nodes.flatMap((moved) => {
		const n = where.get(moved.id) ?? moved;
		const path = n.segment >= 0 ? paths[n.segment] : undefined;
		const offset = path?.offset ?? n.bodyOffset;
		if (n.segment >= 0 && !path) return [];
		return [
			{
				id: n.id,
				time: n.time,
				world: { x: offset.x + n.pre.r.x, y: offset.y + n.pre.r.y, z: offset.z + n.pre.r.z },
				axes: orbitalAxes(n.pre.r, n.pre.v),
				speed: Math.hypot(n.pre.v.x, n.pre.v.y, n.pre.v.z),
				path: n.segment
			}
		];
	});
	return { paths, nodes, unreachable: result.unreachable };
}

/** A look-ahead long enough to cross a sphere: 1.5 periods of a bound orbit, a day of sim time for an escape. */
export function predictionHorizon(orbit: Snapshot['vessels'][number]['orbit'], mu: number): number {
	if (!orbit || orbit.e >= 1 || orbit.a <= 0) return 3 * 86_400;
	const period = 2 * Math.PI * Math.sqrt((orbit.a * orbit.a * orbit.a) / mu);
	return Math.min(Math.max(1.5 * period, 6_000), 4 * 86_400);
}
