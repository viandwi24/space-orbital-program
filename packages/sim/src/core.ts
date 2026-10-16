/**
 * The sim's internal context (`SimCore`) and small accessors over the world. Not exported from the
 * package; `sim.ts` builds one and the other files take it as their first argument.
 */
import type {
	BodyDefinition,
	EntityId,
	EventBus,
	EventMap,
	ModuleDefinition,
	PartDefinition,
	ReadonlyRegistries,
	Rng,
	SystemDefinition,
	Vec3,
	World
} from '@orbital/core';
import {
	moduleStateToken,
	PART,
	VESSEL,
	type FlightFrame,
	type PartState,
	type VesselState
} from './state.ts';

export interface PendingDetach {
	part: EntityId;
	node: string;
	impulse: number;
}

export interface SimCore {
	readonly world: World;
	readonly events: EventBus<EventMap>;
	readonly registries: ReadonlyRegistries;
	readonly dt: number;
	readonly rng: Rng;
	readonly frames: FlightFrame[];
	/** The root body: gravity source, atmosphere, rotation. */
	readonly body: { def: BodyDefinition; mu: number; omega: number };
	readonly pre: SystemDefinition[];
	readonly post: SystemDefinition[];
	/** Detach requests queued by hooks, applied after the hook returns. */
	pending: PendingDetach[];
	/** Vessels on which a hook applied a non-zero force or torque during the current step. */
	readonly active: Set<EntityId>;
	t: number;
	warp: number;
	accumulator: number;
}

export function vesselOf(core: SimCore, id: EntityId): VesselState {
	const v = core.world.get(id, VESSEL);
	if (!v) throw new Error(`sim: entity ${id} is not a vessel`);
	return v;
}

export function partOf(core: SimCore, id: EntityId): PartState {
	const p = core.world.get(id, PART);
	if (!p) throw new Error(`sim: entity ${id} is not a part`);
	return p;
}

export function partDefOf(core: SimCore, part: PartState): PartDefinition {
	const def = core.registries.parts.get(part.definition);
	if (!def) throw new Error(`sim: part definition "${part.definition}" is not registered`);
	return def;
}

export function moduleDefOf(core: SimCore, id: string): ModuleDefinition {
	const def = core.registries.modules.get(id);
	if (!def) throw new Error(`sim: module "${id}" is not registered`);
	return def;
}

/** All vessel entities, ascending. */
export const vesselIds = (core: SimCore): EntityId[] => core.world.query([VESSEL]);

export const hasFlightVessels = (core: SimCore): boolean =>
	core.frames.some((f) => f.inUse && f.vessels.length > 0);

export const frameOfPart = (core: SimCore, part: EntityId): FlightFrame | undefined =>
	frameOfVessel(core, partOf(core, part).vessel);

export const frameOfVessel = (core: SimCore, vessel: EntityId): FlightFrame | undefined =>
	core.frames.find((f) => f.inUse && f.vessels.includes(vessel));

export function moduleState(core: SimCore, part: EntityId, moduleId: string): unknown {
	return core.world.get(part, moduleStateToken(moduleId));
}

export function isControlled(core: SimCore, vessel: VesselState): boolean {
	return vessel.parts.some((id) =>
		partOf(core, id).modules.some((m) => moduleDefOf(core, m.id).controlSource === true)
	);
}

/** Mass of the resources in the part's stores, kg. */
export function contentsMass(core: SimCore, part: EntityId): number {
	const p = partOf(core, part);
	let mass = 0;
	for (const m of p.modules) {
		const store = moduleDefOf(core, m.id).store;
		if (!store) continue;
		const state = moduleState(core, part, m.id);
		for (const resource of store.resources(m.config, state)) {
			const density = core.registries.resources.get(resource)?.density ?? 0;
			mass += store.amount(m.config, state, resource) * density;
		}
	}
	return mass;
}

/** Current mass of a part: dry mass plus contents, kg. */
export const partMass = (core: SimCore, part: EntityId): number =>
	partDefOf(core, partOf(core, part)).mass + contentsMass(core, part);

/** Design-frame centre of mass of a set of parts, m. */
export function designCom(core: SimCore, parts: readonly EntityId[]): Vec3 {
	let m = 0;
	let x = 0;
	let y = 0;
	let z = 0;
	for (const id of parts) {
		const mass = partMass(core, id);
		const p = partOf(core, id).designPos;
		m += mass;
		x += mass * p.x;
		y += mass * p.y;
		z += mass * p.z;
	}
	return m > 0 ? { x: x / m, y: y / m, z: z / m } : { x: 0, y: 0, z: 0 };
}

export const totalMass = (core: SimCore, parts: readonly EntityId[]): number =>
	parts.reduce((sum, id) => sum + partMass(core, id), 0);
