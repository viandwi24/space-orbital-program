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
	propagate,
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
	return tagTrajectoryModel(
		bodies.map((b) => {
			const parent = b.parent === undefined ? undefined : byId.get(b.parent);
			return {
				id: b.id,
				mu: GRAVITATIONAL_CONSTANT * b.mass,
				soi:
					parent && b.orbit ? soiRadius(b.orbit.a, b.mass, parent.mass) : Number.POSITIVE_INFINITY,
				radius: b.radius,
				...(parent && b.orbit ? { parent: parent.id, orbit: b.orbit } : {})
			};
		}),
		gravityModel
	);
}

export interface MapPath {
	body: string;
	/** Where the body's centre is when the stretch starts, system frame, m. */
	offset: Vec3;
	/**
	 * Where the stretch is drawn (plan 293, ADR 0266): at the current centre of `frame.body` plus
	 * `relative`. A stretch around the vessel's own body or one of its parents hangs at that body as
	 * it is now; one around another body (a moon's encounter) hangs where that body will be,
	 * relative to the vessel's body now. So the path moves with the planets between predictions and
	 * never lags behind the planet it circles.
	 */
	frame: { body: string; relative: Vec3 };
	points: Vec3[];
	/** Sim time of each point, s. */
	times: number[];
	/** Start and end of the stretch, s of sim time. */
	t0: number;
	t1: number;
	end: PatchedSegment['end'];
	/** The stretch lies after a maneuver node (plan 045). */
	planned?: boolean;
	/** Periapsis radius of the stretch's conic, m from the body's centre, when it has one. */
	periapsis?: number;
}

/**
 * The conic of a stretch (plan 224: planned apsides and the node panel): its entry state relative
 * to its body and its elements. Kept beside the path, so the drawn data and its goldens stay as
 * they were.
 */
export interface PathConic {
	entry: { r: Vec3; v: Vec3 };
	elements?: { a: number; e: number };
}
const conics = new WeakMap<MapPath, PathConic>();
export const conicOf = (path: MapPath): PathConic | undefined => conics.get(path);

/** Samples per stretch, about: the step is a power of two seconds (see `sampleTimes`). */
const SAMPLES = 160;

/**
 * Times to sample a stretch at: its two ends and, between them, the multiples of one step, a power of
 * two seconds near span / SAMPLES. The grid is fixed in sim time, so a path predicted again a
 * moment later (from where the vessel is now) puts its points where they were, instead of sliding
 * every chord along the curve (the twitch of plan 293).
 */
export function sampleTimes(t0: number, t1: number): number[] {
	const span = t1 - t0;
	if (!(span > 0)) return [t0];
	const step = 2 ** Math.round(Math.log2(span / SAMPLES));
	const out = [t0];
	for (let t = (Math.floor(t0 / step) + 1) * step; t < t1 - step * 1e-3; t += step) out.push(t);
	out.push(t1);
	return out;
}

/** Centre of `id` at `t`, system frame (the root's centre), from the bodies' orbits. */
function centreAt(bodies: readonly PatchedBody[], id: string, t: number): Vec3 {
	const out = { x: 0, y: 0, z: 0 };
	for (let b = bodies.find((x) => x.id === id); b?.parent && b.orbit;) {
		const parent = bodies.find((x) => x.id === b!.parent);
		if (!parent) break;
		const r = propagate(b.orbit, parent.mu, t).r;
		out.x += r.x;
		out.y += r.y;
		out.z += r.z;
		b = parent;
	}
	return out;
}

/** `ancestor` is `id` or one of its parents. */
function isSelfOrParent(bodies: readonly PatchedBody[], ancestor: string, id: string): boolean {
	for (let b = bodies.find((x) => x.id === id); b; b = bodies.find((x) => x.id === b!.parent)) {
		if (b.id === ancestor) return true;
		if (b.parent === undefined) break;
	}
	return false;
}

/**
 * Where to draw a stretch around `body` that starts at `t0` (centre then: `offset`), for a vessel
 * now in the sphere of `anchor`: see `MapPath.frame`.
 */
function frameFor(
	bodies: readonly PatchedBody[],
	anchor: string,
	body: string,
	t0: number,
	offset: Vec3
): MapPath['frame'] {
	if (isSelfOrParent(bodies, body, anchor)) return { body, relative: { x: 0, y: 0, z: 0 } };
	const a = centreAt(bodies, anchor, t0);
	return { body: anchor, relative: { x: offset.x - a.x, y: offset.y - a.y, z: offset.z - a.z } };
}

/**
 * The system-frame point a path's points are relative to, given where the bodies are now
 * (`centre`, e.g. the snapshot's body positions); the predicted centre when the body is unknown.
 */
export function pathOrigin(path: MapPath, centre: (body: string) => Vec3 | undefined): Vec3 {
	const c = centre(path.frame.body);
	if (!c) return path.offset;
	return {
		x: c.x + path.frame.relative.x,
		y: c.y + path.frame.relative.y,
		z: c.z + path.frame.relative.z
	};
}

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
	return segments.map((s) => mapPathOf(s, nodes, String(v.soi)));
}

/** One stretch sampled into a polyline relative to its body, for a vessel now around `anchor`. */
function mapPathOf(
	s: PatchedSegment,
	bodies: readonly PatchedBody[],
	anchor: string,
	planned = false
): MapPath {
	const node = bodies.find((n) => n.id === s.body)!;
	const points: Vec3[] = [];
	const times: number[] = [];
	let t1 = s.t1;
	for (const t of sampleTimes(s.t0, Math.max(s.t0, s.t1))) {
		try {
			points.push(propagateUniversal(s.entry.r, s.entry.v, node.mu, t - s.t0).r);
			times.push(t);
		} catch (e) {
			// A state the solver cannot reach ends the drawn stretch at the last good sample (plan 293).
			if (!(e instanceof KeplerError)) throw e;
			t1 = times.at(-1) ?? s.t0;
			break;
		}
	}
	const out: MapPath = {
		body: s.body,
		offset: s.bodyOffset,
		frame: frameFor(bodies, anchor, s.body, s.t0, s.bodyOffset),
		points,
		times,
		t0: s.t0,
		t1,
		end: t1 < s.t1 ? 'horizon' : s.end
	};
	if (planned) out.planned = true;
	conics.set(out, {
		entry: { r: s.entry.r, v: s.entry.v },
		...(s.elements ? { elements: { a: s.elements.a, e: s.elements.e } } : {})
	});
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
	/** The node relative to its body, m, and where that is drawn (as `MapPath.frame`, plan 293). */
	local: Vec3;
	frame: MapPath['frame'];
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
	const paths = result.segments.map((s, i) => mapPathOf(s, bodies, start.body, i > firstNode));
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
				local: n.pre.r,
				frame: path?.frame ?? frameFor(bodies, start.body, n.body, n.time, n.bodyOffset),
				axes: orbitalAxes(n.pre.r, n.pre.v),
				speed: Math.hypot(n.pre.v.x, n.pre.v.y, n.pre.v.z),
				path: n.segment
			}
		];
	});
	return { paths, nodes, unreachable: result.unreachable };
}

/** Where a node is drawn, given where the bodies are now (see `pathOrigin`). */
export function nodeWorld(node: NodePlacement, centre: (body: string) => Vec3 | undefined): Vec3 {
	const c = centre(node.frame.body);
	if (!c) return node.world;
	return {
		x: c.x + node.frame.relative.x + node.local.x,
		y: c.y + node.frame.relative.y + node.local.y,
		z: c.z + node.frame.relative.z + node.local.z
	};
}

/** A look-ahead long enough to cross a sphere: 1.5 periods of a bound orbit, a day of sim time for an escape. */
export function predictionHorizon(orbit: Snapshot['vessels'][number]['orbit'], mu: number): number {
	if (!orbit || orbit.e >= 1 || orbit.a <= 0) return 3 * 86_400;
	const period = 2 * Math.PI * Math.sqrt((orbit.a * orbit.a * orbit.a) / mu);
	return Math.min(Math.max(1.5 * period, 6_000), 4 * 86_400);
}
