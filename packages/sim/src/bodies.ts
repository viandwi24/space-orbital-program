/**
 * The body tree of the sim (ADR 0051). Every body has a runtime record built once from its
 * registered `BodyDefinition`; a child moves on its analytic orbit around its parent (the parent's
 * gravity only), the root rests at the origin of the system frame. A vessel's state is relative to
 * the body of its sphere of influence (`VesselState.soi`).
 */
import {
	GRAVITATIONAL_CONSTANT,
	sitesOf,
	terrainSeedOf,
	zonesOf,
	type BodyDefinition,
	type TerrainField,
	type Vec3,
	type WorldInfo,
	type WorldTerrain
} from '@orbital/core';

/**
 * The terrain of a body in a world (ADR 0142 point 6): called once per body with the world's
 * terrain seed and the flat zones of the sites on that body. One-argument factories still work.
 */
export type TerrainFactory = (
	body: BodyDefinition,
	world: WorldTerrain
) => TerrainField | undefined;
import { add, propagate, soiRadius, type OrbitalElements, type StateVector } from '@orbital/kepler';
import type { SimCore } from './core.ts';
import type { VesselState } from './state.ts';

export interface BodyRuntime {
	def: BodyDefinition;
	/** Gravitational parameter G * mass, m³/s². */
	mu: number;
	/** Rotation rate about +Y, rad/s. */
	omega: number;
	parent: BodyRuntime | undefined;
	/** Ascending by id. */
	children: BodyRuntime[];
	/** Radius of the sphere of influence around the parent, m (Infinity for the root). */
	soi: number;
	/** Orbit around the parent. */
	elements: OrbitalElements | undefined;
	/** Heights of the ground above the reference sphere (ADR 0043). */
	terrain: TerrainField | undefined;
}

const ORIGIN: StateVector = { r: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 } };

/** Build the runtime records of every registered body; throws on a dangling parent or a cycle. */
export function buildBodies(
	defs: readonly BodyDefinition[],
	rootId: string,
	terrain: TerrainField | TerrainFactory | undefined,
	world: Pick<WorldInfo, 'id' | 'seed' | 'sites'>
): Map<string, BodyRuntime> {
	const forBody = (def: BodyDefinition): TerrainField | undefined =>
		typeof terrain === 'function'
			? terrain(def, { seed: terrainSeedOf(world), zones: zonesOf(sitesOf(world), def.id) })
			: undefined;
	const sorted = [...defs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const out = new Map<string, BodyRuntime>();
	for (const def of sorted) {
		out.set(def.id, {
			def,
			mu: GRAVITATIONAL_CONSTANT * def.mass,
			omega: (2 * Math.PI) / def.rotationPeriod,
			parent: undefined,
			children: [],
			soi: Infinity,
			elements: undefined,
			terrain: undefined
		});
	}
	for (const body of out.values()) {
		const parentId = body.def.parent;
		if (parentId === undefined) {
			// Only the simulated root receives a plain terrain field; a function is asked for every body.
			body.terrain =
				typeof terrain === 'function'
					? forBody(body.def)
					: body.def.id === rootId
						? terrain
						: undefined;
			continue;
		}
		const parent = out.get(parentId);
		if (!parent) {
			throw new Error(`body "${body.def.id}": parent "${parentId}" is not registered`);
		}
		if (!body.def.orbit) {
			throw new Error(`body "${body.def.id}" has a parent but no orbit`);
		}
		body.parent = parent;
		parent.children.push(body);
		body.elements = body.def.orbit;
		body.soi = soiRadius(body.def.orbit.a, body.def.mass, parent.def.mass);
		body.terrain = forBody(body.def);
	}
	for (const body of out.values()) {
		const seen = new Set<string>();
		for (let b: BodyRuntime | undefined = body; b; b = b.parent) {
			if (seen.has(b.def.id)) throw new Error(`body "${body.def.id}": the parent chain loops`);
			seen.add(b.def.id);
		}
	}
	// Tree order (root first, children ascending by id): the order snapshots list bodies in.
	const ordered = new Map<string, BodyRuntime>();
	const visit = (b: BodyRuntime): void => {
		ordered.set(b.def.id, b);
		for (const child of b.children) visit(child);
	};
	for (const body of out.values()) if (!body.parent) visit(body);
	return ordered;
}

/** The record of a body by id; throws for an unregistered one. */
export function bodyById(core: SimCore, id: string): BodyRuntime {
	const body = core.bodies.get(id);
	if (!body) throw new Error(`sim: body "${id}" is not registered`);
	return body;
}

/** The body whose sphere of influence the vessel is in. */
export const bodyOfVessel = (core: SimCore, vessel: VesselState): BodyRuntime =>
	bodyById(core, vessel.soi);

/** State of `body` relative to its parent at time `t` (zero for the root). */
export function stateInParent(body: BodyRuntime, t: number): StateVector {
	if (!body.parent || !body.elements) return ORIGIN;
	return propagate(body.elements, body.parent.mu, t);
}

/** Position of the body's centre in the system frame (the root's centre) at time `t`. */
export function systemPosition(body: BodyRuntime, t: number): Vec3 {
	let r: Vec3 = { x: 0, y: 0, z: 0 };
	for (let b: BodyRuntime | undefined = body; b?.parent; b = b.parent) {
		r = add(r, stateInParent(b, t).r);
	}
	return r;
}
