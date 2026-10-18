/**
 * The sim's link rule on conics (plan 118, ADR 0163 point 2), for the planning Worker: positions of
 * bodies, stations and vessels in the system frame at any time, and whether two nodes link.
 * Pure and environment-neutral; no `@orbital/sim` (the planning work stays off the sim Worker).
 */
import {
	GRAVITATIONAL_CONSTANT,
	linkRange,
	type AntennaDefinition,
	type BodyDefinition,
	type PartDefinition,
	type Snapshot,
	type VesselSnapshot
} from '@orbital/core';
import {
	add,
	bodyStateAt,
	dot,
	length,
	propagateUniversal,
	scale,
	sub,
	type PatchedBody,
	type Vec3
} from '@orbital/kepler';

/** Sample spacing, s: the sim's `NETWORK_SAMPLE`. */
export const PLAN_SAMPLE = 10;
/** Bisection stops at this bracket, s: the sim's `LINK_TIME_TOLERANCE`. */
export const PLAN_TOLERANCE = 0.01;

export interface PlanBody {
	id: string;
	radius: number;
	mu: number;
	/** Spin, rad/s (`2π / rotationPeriod`, as the sim turns its stations). */
	omega: number;
}

/** A station: fixed on its body, turning with it. */
export interface PlanStation {
	kind: 'station';
	id: string;
	label: string;
	body: string;
	/** Body-fixed direction (unit) and distance from the body's centre, m. */
	dir: Vec3;
	radius: number;
	range: number;
}

/** A vessel on its conic in its current sphere of influence. */
export interface PlanVessel {
	kind: 'vessel';
	id: string;
	label: string;
	body: string;
	/** State relative to `body` at `t0`. */
	r: Vec3;
	v: Vec3;
	t0: number;
	/** Range rating of its strongest enabled antenna, m (0: none). */
	range: number;
}

export type PlanNode = PlanStation | PlanVessel;

export interface PlanWorld {
	bodies: PlanBody[];
	/** For `bodyStateAt`. */
	nodes: PatchedBody[];
	/** The world's comms scale (`stock.comms-scale`). */
	scale: number;
}

/** A rotation by `angle` about +Y, right-handed (the sim's `qAboutY`). */
export const rotateY = (v: Vec3, angle: number): Vec3 => {
	const c = Math.cos(angle);
	const s = Math.sin(angle);
	return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
};

export function planWorld(bodies: readonly BodyDefinition[], commsScale = 1): PlanWorld {
	const byId = new Map(bodies.map((b) => [b.id, b]));
	return {
		bodies: bodies.map((b) => ({
			id: b.id,
			radius: b.radius,
			mu: GRAVITATIONAL_CONSTANT * b.mass,
			omega: (2 * Math.PI) / b.rotationPeriod
		})),
		nodes: bodies.map((b) => {
			const parent = b.parent === undefined ? undefined : byId.get(b.parent);
			return {
				id: b.id,
				mu: GRAVITATIONAL_CONSTANT * b.mass,
				soi: Number.POSITIVE_INFINITY,
				radius: b.radius,
				...(parent && b.orbit ? { parent: parent.id, orbit: b.orbit } : {})
			};
		}),
		scale: commsScale
	};
}

export const bodyCentre = (world: PlanWorld, body: string, t: number): Vec3 =>
	bodyStateAt(world.nodes, body, t, 'system').r;

const bodyOf = (world: PlanWorld, id: string): PlanBody => {
	const b = world.bodies.find((x) => x.id === id);
	if (!b) throw new RangeError(`unknown body "${id}"`);
	return b;
};

/** A node's position in the system frame at `t`. */
export function positionOf(world: PlanWorld, node: PlanNode, t: number): Vec3 {
	const centre = bodyCentre(world, node.body, t);
	if (node.kind === 'station') {
		const omega = bodyOf(world, node.body).omega;
		return add(centre, rotateY(scale(node.dir, node.radius), omega * t));
	}
	const mu = bodyOf(world, node.body).mu;
	return add(centre, propagateUniversal(node.r, node.v, mu, t - node.t0).r);
}

/** True when a body sphere lies across the segment a→b (within 1 m, as the sim). */
export function occluded(world: PlanWorld, a: Vec3, b: Vec3, t: number): boolean {
	const ab = sub(b, a);
	const len2 = dot(ab, ab);
	for (const body of world.bodies) {
		const centre = bodyCentre(world, body.id, t);
		const s = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(centre, a), ab) / len2)) : 0;
		if (length(sub(add(a, scale(ab, s)), centre)) < body.radius - 1) return true;
	}
	return false;
}

/** Whether nodes `a` and `b` link at `t`: in range and in sight. */
export function linkedAt(world: PlanWorld, a: PlanNode, b: PlanNode, t: number): boolean {
	if (a.range <= 0 || b.range <= 0) return false;
	const pa = positionOf(world, a, t);
	const pb = positionOf(world, b, t);
	if (length(sub(pb, pa)) > linkRange(a.range, b.range, world.scale)) return false;
	return !occluded(world, pa, pb, t);
}

/**
 * A vessel's range rating from its parts (ADR 0163 point 3): the strongest antenna named by a
 * module config `{ antenna }` whose module snapshot does not say `enabled: false`.
 */
export function vesselRange(
	vessel: VesselSnapshot,
	parts: ReadonlyMap<string, PartDefinition>,
	antennas: ReadonlyMap<string, Pick<AntennaDefinition, 'range'>>
): number {
	let best = 0;
	for (const part of vessel.parts) {
		const def = parts.get(String(part.definition));
		for (const [moduleId, config] of def?.modules ?? []) {
			const id = (config as { antenna?: unknown } | undefined)?.antenna;
			const antenna = typeof id === 'string' ? antennas.get(id) : undefined;
			if (!antenna) continue;
			const state = part.modules[moduleId] as { enabled?: unknown } | undefined;
			if (state?.enabled === false) continue;
			best = Math.max(best, antenna.range);
		}
	}
	return best;
}

/** The planning nodes of a snapshot: its stations, then its vessels in flight. */
export function planNodes(
	world: PlanWorld,
	snapshot: Snapshot,
	parts: ReadonlyMap<string, PartDefinition>,
	antennas: ReadonlyMap<string, Pick<AntennaDefinition, 'range'>>
): PlanNode[] {
	const out: PlanNode[] = [];
	for (const s of snapshot.network?.stations ?? []) {
		const centre = bodyCentre(world, s.body, snapshot.t);
		const rel = sub(s.position, centre);
		const radius = length(rel);
		const omega = bodyOf(world, s.body).omega;
		out.push({
			kind: 'station',
			id: s.id,
			label: s.label,
			body: s.body,
			dir: scale(rotateY(rel, -omega * snapshot.t), 1 / radius),
			radius,
			range: s.range
		});
	}
	for (const v of snapshot.vessels) {
		if (v.surface) continue;
		out.push({
			kind: 'vessel',
			id: `vessel:${v.id}`,
			label: v.name ?? `Vessel ${v.id}`,
			body: String(v.soi),
			r: v.position,
			v: v.velocity,
			t0: snapshot.t,
			range: vesselRange(v, parts, antennas)
		});
	}
	return out;
}
