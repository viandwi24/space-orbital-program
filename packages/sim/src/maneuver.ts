/**
 * Maneuver nodes in the sim (plan 045, ADR 0056). A node is plain data on the vessel; this file
 * resolves it with `kepler.predictWithManeuvers` (the same function the map view draws with),
 * applies the commands, and removes a node once it has been burned off. Everything here is a
 * function of sim state, so a resumed run resolves exactly as the original would.
 */
import {
	MAX_NODES,
	type CommandResult,
	type EntityId,
	type ManeuverNodeSnapshot,
	bodyId
} from '@orbital/core';
import {
	normalize,
	type ManeuverInput,
	type ManeuverNodeResult,
	type PatchedBody
} from '@orbital/kepler';
import type { BodyRuntime } from './bodies.ts';
import { vesselIds, vesselOf, type SimCore } from './core.ts';
import { motionOf } from './orbit.ts';
import type { ManeuverNodeState, VesselState } from './state.ts';

/** Furthest ahead a node may be placed, s (ten days). */
export const MAX_NODE_AHEAD = 10 * 86_400;
/** A passed node with less burn than this left counts as burned off, m/s. */
export const NODE_DONE_DV = 0.5;
/** Burns shorter than this have no direction worth pointing at, m/s. */
export const MIN_BURN = 0.01;

/** The bodies of a sim as `kepler` wants them; the trajectory provider is built on this list. */
export function patchedBodiesOf(bodies: ReadonlyMap<string, BodyRuntime>): PatchedBody[] {
	return [...bodies.values()].map((b) => ({
		id: b.def.id,
		mu: b.mu,
		soi: b.soi,
		radius: b.def.radius,
		...(b.parent && b.elements ? { parent: b.parent.def.id, orbit: b.elements } : {})
	}));
}

/** The bodies of the sim as `kepler` wants them (the provider's list, built once per sim). */
export const patchedBodies = (core: SimCore): readonly PatchedBody[] => core.trajectory.bodies;

const asInputs = (nodes: readonly ManeuverNodeState[]): ManeuverInput[] =>
	nodes.map((n) => ({
		id: n.id,
		time: n.time,
		prograde: n.prograde,
		normal: n.normal,
		radial: n.radial,
		...(n.target ? { target: n.target } : {})
	}));

export interface ResolvedNodes {
	nodes: ManeuverNodeResult[];
	unreachable: number[];
}

/** Whether the vessel moves on a path nodes can lie on (not fixed to the ground). */
export const hasPath = (v: VesselState): boolean => v.rails === null || v.rails.kind !== 'surface';

/** The nodes of `vessel` resolved against its path from now. */
export function resolveNodes(
	core: SimCore,
	vessel: VesselState,
	nodes: readonly ManeuverNodeState[] = vessel.nodes
): ResolvedNodes {
	if (nodes.length === 0 || !hasPath(vessel)) {
		return { nodes: [], unreachable: nodes.map((n) => n.id) };
	}
	const { r, v } = motionOf(core, vessel);
	const last = Math.max(...nodes.map((n) => n.time));
	const out = core.trajectory.predictWithManeuvers(
		{ body: vessel.soi, r, v, t: core.t },
		asInputs(nodes),
		Math.max(0, last - core.t),
		{ maxStep: 3_600 }
	);
	return { nodes: out.nodes, unreachable: out.unreachable };
}

/** The nodes of a vessel for its snapshot, in time order. */
export function nodeSnapshots(core: SimCore, vessel: VesselState): ManeuverNodeSnapshot[] {
	if (vessel.nodes.length === 0) return [];
	const resolved = resolveNodes(core, vessel);
	const byId = new Map(resolved.nodes.map((n) => [n.id, n]));
	return vessel.nodes.map((n) => {
		const r = byId.get(n.id);
		if (!r) {
			const dv = Math.hypot(n.prograde, n.normal, n.radial);
			return {
				id: n.id,
				time: n.time,
				prograde: n.prograde,
				normal: n.normal,
				radial: n.radial,
				dv
			};
		}
		return {
			id: n.id,
			time: n.time,
			prograde: r.dv.prograde,
			normal: r.dv.normal,
			radial: r.dv.radial,
			dv: r.magnitude,
			body: bodyId(r.body),
			vector: { ...r.burn }
		};
	});
}

/** Unit direction of the earliest node's remaining burn, or undefined (no node, no path, no burn). */
export function burnDirection(
	core: SimCore,
	vessel: VesselState
): ReturnType<typeof normalize> | undefined {
	const first = vessel.nodes[0];
	if (!first) return undefined;
	const r = resolveNodes(core, vessel).nodes.find((n) => n.id === first.id);
	if (!r || r.magnitude < MIN_BURN) return undefined;
	return normalize(r.burn);
}

/**
 * Replace the targets of `nodes` (plan components, in time order) by the burns they now mean from
 * the vessel's path. Returns the nodes, or the reason a node cannot be placed.
 */
function withTargets(
	core: SimCore,
	vessel: VesselState,
	plan: ManeuverNodeState[]
): ManeuverNodeState[] | string {
	const bare = plan.map((n) => ({ ...n, target: null }));
	const resolved = resolveNodes(core, vessel, bare);
	if (resolved.unreachable.length > 0) {
		return 'the path never reaches that time (it ends in an impact or is cut short first)';
	}
	const byId = new Map(resolved.nodes.map((n) => [n.id, n]));
	return bare.map((n) => {
		const r = byId.get(n.id);
		// A node in the past keeps its remaining burn as a target too.
		return r ? { ...n, target: { body: r.body, v: { ...r.post.v } } } : n;
	});
}

const sortNodes = (nodes: ManeuverNodeState[]): ManeuverNodeState[] =>
	[...nodes].sort((a, b) => a.time - b.time || a.id - b.id);

/** Current remaining burns as plan components (what an edit starts from). */
function remainingPlan(core: SimCore, vessel: VesselState): ManeuverNodeState[] {
	const resolved = new Map(resolveNodes(core, vessel).nodes.map((n) => [n.id, n]));
	return vessel.nodes.map((n) => {
		const r = resolved.get(n.id);
		return r
			? { ...n, prograde: r.dv.prograde, normal: r.dv.normal, radial: r.dv.radial, target: null }
			: { ...n, target: null };
	});
}

const refuse = (reason: string): CommandResult => ({ ok: false, reason });

export function setNode(
	core: SimCore,
	vessel: VesselState,
	command: { id?: number; time: number; prograde: number; normal: number; radial: number }
): CommandResult {
	if (!hasPath(vessel))
		return refuse('a vessel fixed to the ground has no orbit to plan a burn on');
	if (command.time > core.t + MAX_NODE_AHEAD) {
		return refuse(`a node can be at most ${MAX_NODE_AHEAD / 86_400} days ahead`);
	}
	const plan = remainingPlan(core, vessel);
	let id = command.id;
	if (id === undefined) {
		if (command.time < core.t) return refuse('a new node needs a time that has not passed');
		if (plan.length >= MAX_NODES)
			return refuse(`a vessel keeps at most ${MAX_NODES} maneuver nodes`);
		id = vessel.nodes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
		plan.push({
			id,
			time: command.time,
			prograde: command.prograde,
			normal: command.normal,
			radial: command.radial,
			target: null
		});
	} else {
		const at = plan.findIndex((n) => n.id === id);
		if (at < 0) return refuse(`vessel has no maneuver node ${id}`);
		if (command.time < core.t && command.time !== plan[at]!.time) {
			return refuse('a node cannot be moved into the past');
		}
		plan[at] = {
			id,
			time: command.time,
			prograde: command.prograde,
			normal: command.normal,
			radial: command.radial,
			target: null
		};
	}
	const next = withTargets(core, vessel, sortNodes(plan));
	if (typeof next === 'string') return refuse(next);
	vessel.nodes = next;
	return { ok: true, node: id };
}

export function removeNode(
	core: SimCore,
	vessel: VesselState,
	id: number | undefined
): CommandResult {
	if (id === undefined) {
		vessel.nodes = [];
		return { ok: true };
	}
	if (!vessel.nodes.some((n) => n.id === id)) return refuse(`vessel has no maneuver node ${id}`);
	const plan = remainingPlan(core, vessel).filter((n) => n.id !== id);
	const next = withTargets(core, vessel, plan);
	// Removing can only make a later node unreachable if the removed burn was what avoided an impact;
	// then the plan values stand without targets rather than refusing to delete.
	vessel.nodes = typeof next === 'string' ? plan : next;
	return { ok: true };
}

/** After a step: nodes whose time has passed and whose burn is done go away (event per node). */
export function completeNodes(core: SimCore): void {
	for (const id of vesselIds(core)) {
		const vessel = vesselOf(core, id);
		const first = vessel.nodes[0];
		if (!first || first.time >= core.t) continue;
		const resolved = resolveNodes(core, vessel).nodes;
		const done = vessel.nodes.filter((n) => {
			if (n.time >= core.t) return false;
			const r = resolved.find((x) => x.id === n.id);
			return r !== undefined && r.magnitude < NODE_DONE_DV;
		});
		if (done.length === 0) continue;
		const gone = new Set(done.map((n) => n.id));
		vessel.nodes = vessel.nodes.filter((n) => !gone.has(n.id));
		for (const n of done) {
			core.events.emit('vessel:maneuver-complete', { vessel: id as EntityId, node: n.id });
		}
	}
}
