/**
 * Rendezvous aids of the page (plan 057, ADR 0084): the closest approach of the vessel's path to
 * its target across spheres of influence, and the nodes that plan a meeting. Pure and DOM-free; the
 * flight loop sends the commands, the Target card draws the aids. Everything is a function of the
 * snapshot, so a test can compare it with the sim's own numbers.
 */
import {
	entityId,
	type Command,
	type Snapshot,
	type Vec3,
	type VesselSnapshot
} from '@orbital/core';
import {
	hohmannToTarget,
	matchVelocityBurn,
	relativeNodes,
	trajectoryFor,
	type PatchedBody,
	type StateVector
} from '@orbital/kepler';
import { maneuverReach, predictionHorizon, type NodeInput } from './map-path';

/** Planes closer than this (rad, about 0.06 degrees) count as one: no plane-change node. */
const ALIGNED = 1e-3;

/** A node needs this much lead (the sim refuses nearer ones, `MIN_AHEAD` of the planner), s. */
export const MIN_NODE_LEAD = 10;

/** The target's motion in the system frame, and the body it orbits when that is a single conic. */
export interface TargetMotion {
	at: (t: number) => StateVector;
	/** Body whose sphere the target is in (a body: its parent); null for the root body. */
	primary: string | null;
}

/** Null without a target, for a target that is gone or fixed to the ground. */
export function targetMotion(
	snapshot: Snapshot,
	v: VesselSnapshot,
	bodies: readonly PatchedBody[]
): TargetMotion | null {
	const ref = v.target;
	if (!ref) return null;
	if (ref.kind === 'body') {
		const id = String(ref.id);
		const body = bodies.find((b) => b.id === id);
		if (!body) return null;
		return { at: trajectoryFor(bodies).bodyTrack(id), primary: body.parent ?? null };
	}
	const other = snapshot.vessels.find((x) => x.id === ref.id);
	if (!other || other.surface) return null;
	return {
		at: trajectoryFor(bodies).conicTrack(
			String(other.soi),
			other.position,
			other.velocity,
			snapshot.t
		),
		primary: String(other.soi)
	};
}

/** The closest approach as the page shows it (system frame positions for the map). */
export interface ApproachInfo {
	/** Sim time, s. */
	time: number;
	distance: number;
	relativeSpeed: number;
	/** Sphere the vessel is in then. */
	body: string;
	/** Positions of the vessel and the target then, system frame, m. */
	vessel: Vec3;
	target: Vec3;
	/** States then, for the match-velocity node: the vessel relative to its sphere's body. */
	relative: StateVector;
	/** The target's velocity minus the vessel's, then, m/s (inertial axes). */
	relativeVelocity: Vec3;
	/** The path includes the vessel's maneuver nodes. */
	withNodes: boolean;
}

const futureNodes = (v: VesselSnapshot, t: number): NodeInput[] =>
	(v.nodes ?? [])
		.filter((n) => n.time > t)
		.map((n) => ({
			id: n.id,
			time: n.time,
			prograde: n.prograde,
			normal: n.normal,
			radial: n.radial
		}));

/**
 * Closest approach of `v`'s predicted path (nodes applied) to its target, over the look-ahead of the
 * map (`predictionHorizon`, or `options.window` seconds), across spheres of influence. Null without a target or a path (on the
 * ground, or no orbit).
 */
export function patchedApproach(
	snapshot: Snapshot,
	v: VesselSnapshot,
	bodies: readonly PatchedBody[],
	options: { samples?: number; window?: number } = {}
): ApproachInfo | null {
	if (v.surface) return null;
	const motion = targetMotion(snapshot, v, bodies);
	if (!motion) return null;
	const soi = bodies.find((b) => b.id === String(v.soi));
	if (!soi) return null;
	const start = { body: String(v.soi), r: v.position, v: v.velocity, t: snapshot.t };
	const horizon = options.window ?? predictionHorizon(v.orbit, soi.mu);
	const nodes = futureNodes(v, snapshot.t);
	const trajectory = trajectoryFor(bodies);
	let segments;
	if (nodes.length === 0) {
		segments = trajectory.predict(start, horizon);
	} else {
		segments = trajectory.predictWithManeuvers(
			start,
			nodes,
			maneuverReach(start, bodies, nodes, horizon)
		).segments;
	}
	if (segments.length === 0) return null;
	const found = trajectory.closestApproachOnTrack(
		trajectory.trackOfSegments(segments, snapshot.t),
		motion.at,
		options.samples ?? 480
	);
	return {
		time: found.t,
		distance: found.distance,
		relativeSpeed: found.relativeSpeed,
		body: found.body,
		vessel: found.vessel.r,
		target: found.target.r,
		relative: found.relative,
		relativeVelocity: {
			x: found.target.v.x - found.vessel.v.x,
			y: found.target.v.y - found.vessel.v.y,
			z: found.target.v.z - found.vessel.v.z
		},
		withNodes: nodes.length > 0
	};
}

export type AidId = 'approach' | 'match' | 'hohmann' | 'node-ascending' | 'node-descending';

/** A node the Target card can place. */
export interface Aid {
	id: AidId;
	label: string;
	/** What the node does, with numbers; or why it is not available. */
	detail: string;
	/** The node to place, absent when the aid is not available. */
	node?: { time: number; prograde: number; normal: number; radial: number };
}

const LABELS: Record<AidId, string> = {
	approach: 'Node at closest approach',
	match: 'Match velocity at closest approach',
	hohmann: 'Hohmann transfer to the target orbit',
	'node-ascending': 'Plane change at the ascending node',
	'node-descending': 'Plane change at the descending node'
};

const unavailable = (id: AidId, why: string): Aid => ({ id, label: LABELS[id], detail: why });

const speed = (m: number): string => `${m.toFixed(m < 10 ? 2 : 1)} m/s`;

/**
 * The aids for `v`'s target, all five always (so the card keeps its shape); an aid that cannot be
 * made says why. `approach` is `patchedApproach`'s result for the same snapshot.
 */
export function rendezvousAids(
	snapshot: Snapshot,
	v: VesselSnapshot,
	bodies: readonly PatchedBody[],
	approach: ApproachInfo | null
): Aid[] {
	const none = (why: string): Aid[] =>
		(Object.keys(LABELS) as AidId[]).map((id) => unavailable(id, why));
	const t = v.target;
	if (!t) return none('Choose a target first.');
	if (v.surface) return none('The vessel is on the ground.');
	const motion = targetMotion(snapshot, v, bodies);
	if (!motion) return none('The target has no orbit to meet.');
	const out: Aid[] = [];

	if (!approach) {
		out.push(unavailable('approach', 'No closest approach on this path.'));
		out.push(unavailable('match', 'No closest approach on this path.'));
	} else if (approach.time - snapshot.t < MIN_NODE_LEAD) {
		out.push(unavailable('approach', 'The closest approach is too close in time for a node.'));
		out.push(unavailable('match', 'The closest approach is too close in time for a node.'));
	} else {
		out.push({
			id: 'approach',
			label: LABELS.approach,
			detail: `${(approach.distance / 1000).toFixed(1)} km apart, ${speed(approach.relativeSpeed)} relative`,
			node: { time: approach.time, prograde: 0, normal: 0, radial: 0 }
		});
		// Target state seen from the body of the vessel's sphere: the vessel's relative state plus the gap.
		const rel = approach.relative;
		const targetThere: StateVector = {
			r: {
				x: rel.r.x + (approach.target.x - approach.vessel.x),
				y: rel.r.y + (approach.target.y - approach.vessel.y),
				z: rel.r.z + (approach.target.z - approach.vessel.z)
			},
			v: {
				x: rel.v.x + approach.relativeVelocity.x,
				y: rel.v.y + approach.relativeVelocity.y,
				z: rel.v.z + approach.relativeVelocity.z
			}
		};
		const burn = matchVelocityBurn(rel, targetThere);
		out.push({
			id: 'match',
			label: LABELS.match,
			detail: `${speed(burn.magnitude)} to stop relative to the target there`,
			node: { time: approach.time, ...burn.dv }
		});
	}

	// The orbit-plane aids work in the frame of one body: the target must orbit the vessel's sphere body.
	const sphere = String(v.soi);
	const mu = bodies.find((b) => b.id === sphere)?.mu;
	if (motion.primary !== sphere || mu === undefined) {
		const why = `The target orbits ${motion.primary ?? 'the system centre'}, not ${sphere}.`;
		out.push(unavailable('hohmann', why));
		out.push(unavailable('node-ascending', why));
		out.push(unavailable('node-descending', why));
		return out;
	}
	const own: StateVector = { r: v.position, v: v.velocity };
	const them: StateVector = {
		r: {
			x: v.position.x + t.position.x,
			y: v.position.y + t.position.y,
			z: v.position.z + t.position.z
		},
		v: {
			x: v.velocity.x + t.velocity.x,
			y: v.velocity.y + t.velocity.y,
			z: v.velocity.z + t.velocity.z
		}
	};
	const lead = MIN_NODE_LEAD;
	const hohmann = hohmannToTarget(own, them, mu, snapshot.t, lead);
	out.push(
		hohmann
			? {
					id: 'hohmann',
					label: LABELS.hohmann,
					detail: `${speed(Math.abs(hohmann.dv1))} now, then ${speed(Math.abs(hohmann.dv2))} on arrival after ${Math.round(hohmann.transferTime / 60)} min (circular, coplanar orbits assumed)`,
					node: { time: hohmann.time, prograde: hohmann.dv1, normal: 0, radial: 0 }
				}
			: unavailable(
					'hohmann',
					'No transfer window: the target goes the other way round or at the same rate.'
				)
	);
	let nodes: ReturnType<typeof relativeNodes> = [];
	try {
		nodes = relativeNodes(own, them, mu, snapshot.t, lead);
	} catch {
		nodes = [];
	}
	for (const kind of ['ascending', 'descending'] as const) {
		const id = kind === 'ascending' ? 'node-ascending' : 'node-descending';
		const n = nodes.find((x) => x.kind === kind && x.angle > ALIGNED);
		out.push(
			n
				? {
						id,
						label: LABELS[id],
						detail: `${speed(n.magnitude)} to line up with the target's plane (${((n.angle * 180) / Math.PI).toFixed(1)} degrees apart)`,
						node: { time: n.time, ...n.dv }
					}
				: unavailable(id, 'The orbit planes are already aligned, or the orbit is not closed.')
		);
	}
	return out;
}

/** The `node-set` command for an aid, or null when it has no node. */
export function aidCommand(vessel: number, aid: Aid | undefined): Command | null {
	if (!aid?.node) return null;
	return { type: 'node-set', vessel: entityId(vessel), ...aid.node };
}
