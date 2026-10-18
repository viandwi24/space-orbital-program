/**
 * The sim's internal context (`SimCore`) and small accessors over the world. Not exported from the
 * package; `sim.ts` builds one and the other files take it as their first argument.
 */
import type {
	EntityId,
	EventBus,
	EventMap,
	ModuleDefinition,
	PartDefinition,
	ReadonlyRegistries,
	Rng,
	SystemDefinition,
	Vec3,
	SaveEconomy,
	SaveMilestones,
	SaveTech,
	World,
	WorldInfo
} from '@orbital/core';
import type { BodyRuntime } from './bodies.ts';
import type { TickState } from './tick.ts';
import type { ObjectivesState } from './objectives.ts';
import type {
	SaveAgencies,
	SaveComms,
	SaveContracts,
	SaveCrew,
	SaveDiscovery,
	SaveStrategies
} from '@orbital/core';
import type { ScienceRuntime } from './science.ts';
import type { CommsRuntime } from './comms.ts';
import type { LifeRuntime } from './life.ts';
import type { RangeRuntime } from './range.ts';
import type { ReliabilityRuntime } from './reliability.ts';
import type { TrajectoryProvider } from '@orbital/kepler';
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
	/** Every body, by id (ADR 0051); a body's `terrain` is the height function of ADR 0043. */
	readonly bodies: ReadonlyMap<string, BodyRuntime>;
	/**
	 * The home body the sim runs on (ADR 0119 point 1): terrain, the launch site, recovery, crew and
	 * milestones. Not the root of the tree once a Sun sits there.
	 */
	readonly root: BodyRuntime;
	readonly pre: SystemDefinition[];
	readonly post: SystemDefinition[];
	/** Detach requests queued by hooks, applied after the hook returns. */
	pending: PendingDetach[];
	/** Vessels on which a hook applied a non-zero force or torque during the current step. */
	readonly active: Set<EntityId>;
	t: number;
	warp: number;
	/** Sim time a `warp-to` is heading for (ADR 0056), or null. */
	warpTarget: number | null;
	accumulator: number;
	/** Set by an SOI change of a controlled vessel; `step` then drops the rest of the accumulator (ADR 0051). */
	warpStopped: boolean;
	/** The clock is paused (plan 205, ADR 0201 point 4); not saved: a loaded world runs. */
	paused: boolean;
	/**
	 * The world this run belongs to (plan 077, ADR 0110). Only `set-rule` changes it (its `rules`
	 * and `changelog`, ADR 0111), and then resets `rulesView`.
	 */
	readonly info: WorldInfo;
	/** Cached snapshot view of the registered rules' values; null after a change. */
	rulesView: Readonly<Record<string, boolean | number | string>> | null;
	/** World tick state (plan 082, ADR 0171). */
	readonly ticks: TickState;
	/** Started contracts and missions (plan 098, ADR 0175). */
	readonly objectives: ObjectivesState;
	/** Contract offers and accepted generated contracts (plan 099, ADR 0186); saved once touched. */
	readonly contracts: SaveContracts;
	/** Active strategies and cooldowns (plan 101, ADR 0187); saved once anything happened. */
	strategies: SaveStrategies;
	/** Discovery datasets, claims and the `discovery` stream (plan 129, ADR 0192); saved once touched. */
	discovery: SaveDiscovery;
	/** The crew roster (plan 106, ADR 0176); saved as `SimSave.crew` once anyone is hired. */
	readonly crew: SaveCrew;
	/** Science subjects and the situation cache (plan 103, ADR 0178); saved as `SimSave.science`. */
	readonly science: ScienceRuntime;
	/** The comms network (plan 114, ADR 0179): derived links, never saved. */
	readonly comms: CommsRuntime;
	/** Rival agencies, rentals and news (plan 126, ADR 0190); saved once any ran. */
	agencies: SaveAgencies;
	/** Route modes and the signal-delay queue (plan 117, ADR 0188 point 7); saved. */
	commsState: SaveComms;
	/** Crew simulation run-time state (plan 107): last velocities for g-load; not saved. */
	readonly life: LifeRuntime;
	/** Orbit prediction for this world's gravity model (plan 080, ADR 0173). */
	readonly trajectory: TrajectoryProvider;
	/** Ledger and balances (plan 095, ADR 0113); saved as `SimSave.economy`. */
	readonly economy: SaveEconomy;
	/** Firsts and per-vessel visits (plan 102, ADR 0147); saved as `SimSave.milestones`. */
	readonly milestones: SaveMilestones;
	/** Researched tech nodes (plan 105, ADR 0154); saved as `SimSave.tech`. */
	readonly tech: SaveTech;
	/** Range safety (plan 127, ADR 0155): ascents to judge (saved as `SimSave.range`) and fans. */
	readonly range: RangeRuntime;
	/** Part reliability (plan 130, ADR 0156); saved as `SimSave.reliability`. */
	reliability: ReliabilityRuntime;
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

/** Amount of `resource` in every store of the vessel (a `vessel`-flow resource such as EC). */
export function vesselAmount(core: SimCore, vessel: VesselState, resource: string): number {
	let sum = 0;
	for (const id of vessel.parts) {
		for (const m of partOf(core, id).modules) {
			const store = moduleDefOf(core, m.id).store;
			if (!store) continue;
			const state = moduleState(core, id, m.id);
			if (store.resources(m.config, state).includes(resource))
				sum += store.amount(m.config, state, resource);
		}
	}
	return sum;
}

/**
 * Why the vessel takes no control commands (ADR 0109; plan 208, ADR 0213), or undefined when it
 * does: `no-source` without any control source, `no-power` when every source part has a module
 * that needs a resource (`ModuleDefinition.needs`) the vessel has run out of.
 */
export function controlProblem(
	core: SimCore,
	vessel: VesselState
): 'no-source' | 'no-power' | undefined {
	let sources = 0;
	const short = new Map<string, boolean>();
	for (const id of vessel.parts) {
		const modules = partOf(core, id).modules;
		if (!modules.some((m) => moduleDefOf(core, m.id).controlSource === true)) continue;
		sources += 1;
		let powered = true;
		for (const m of modules) {
			const need = moduleDefOf(core, m.id).needs?.(m.config);
			if (need === undefined) continue;
			let out = short.get(need);
			if (out === undefined) short.set(need, (out = vesselAmount(core, vessel, need) <= 0));
			if (out) powered = false;
		}
		if (powered) return undefined;
	}
	return sources === 0 ? 'no-source' : 'no-power';
}

export function isControlled(core: SimCore, vessel: VesselState): boolean {
	return controlProblem(core, vessel) === undefined;
}

/** A vessel with a `keep` module (a planted flag, ADR 0120 point 5): never reaped as debris. */
export function isKept(core: SimCore, vessel: VesselState): boolean {
	return vessel.parts.some((id) =>
		partOf(core, id).modules.some((m) => moduleDefOf(core, m.id).keep === true)
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
