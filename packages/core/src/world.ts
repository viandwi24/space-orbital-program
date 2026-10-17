/**
 * Entity/component world. Data-oriented and deliberately simple: entities are numeric ids,
 * components are plain objects keyed by a typed `ComponentType`. Internals (Maps) are never
 * exposed, so the storage can become archetypal later without an API change.
 */
import * as z from 'zod';
import type { EventBus, EventMap } from './events.ts';
import { entityId, type EntityId } from './ids.ts';
import { worldDataSchema } from './schemas.ts';

/** Typed component key. `T` is phantom: it only flows into `get`/`add`. Create with `defineComponent`. */
export type ComponentType<T> = { readonly name: string; readonly __type?: T };

export const defineComponent = <T>(name: string): ComponentType<T> => ({ name });

/** JSON-compatible snapshot of a world (typed arrays inside components are preserved as-is). */
export type WorldData = {
	formatVersion: 1;
	nextEntity: number;
	entities: number[];
	components: Record<string, Record<string, unknown>>;
};

/** How a world computes gravity (ADR 0095). Only patched conics exist so far. */
export type GravityModel = 'patched';

/**
 * The world a run belongs to (plan 077, ADRs 0094 and 0110): its identity fields and the
 * placeholders later plans fill (`rules` 078, `epoch` maths 081, `sites` 084). Held by the sim
 * beside the entity world and saved as `SimSave.worldInfo`.
 */
export interface WorldInfo {
	/** Random UUID from the host; `"legacy"` for the world old saves migrate into. */
	id: string;
	seed: number;
	/** Plugin whose bodies the world uses, and its version at creation. */
	systemId: string;
	systemVersion: string;
	/** Scale variant of the system (ADR 0103); `"default"` for the stock system. */
	variant: string;
	gravityModel: GravityModel;
	/** The instant of `t = 0`: whole days and a fraction on the system's time scale (ADR 0103). */
	epoch: { day: number; fraction: number };
	/** Rule id to value; empty until plan 078. */
	rules: Record<string, boolean | number | string>;
	/** Sites of the world; empty until plan 084. */
	sites: Array<{ id: string; [key: string]: unknown }>;
}

/** Id of the world that saves from before worlds existed migrate into (ADR 0094 point 6). */
export const LEGACY_WORLD_ID = 'legacy';

/** The Legacy world (ADR 0110 point 3): stock system, patched conics, fictional day 0. */
export function legacyWorldInfo(seed: number, stockVersion = '0.0.0'): WorldInfo {
	return {
		id: LEGACY_WORLD_ID,
		seed,
		systemId: 'stock',
		systemVersion: stockVersion,
		variant: 'default',
		gravityModel: 'patched',
		epoch: { day: 0, fraction: 0 },
		rules: {},
		sites: []
	};
}

export interface World {
	createEntity(): EntityId;
	/** Removes the entity and all its components. Returns false if it did not exist. */
	destroyEntity(id: EntityId): boolean;
	hasEntity(id: EntityId): boolean;
	/** All live entities in ascending id order. */
	entities(): EntityId[];
	/** Attach (or replace) a component. Throws if the entity does not exist. */
	add<T>(id: EntityId, type: ComponentType<T>, value: T): void;
	get<T>(id: EntityId, type: ComponentType<T>): T | undefined;
	has(id: EntityId, type: ComponentType<unknown>): boolean;
	/** Returns false if the component was not present. */
	remove(id: EntityId, type: ComponentType<unknown>): boolean;
	/** Entities having every listed component, ascending id order (deterministic). */
	query(types: readonly ComponentType<unknown>[]): EntityId[];
	/** Deep-copied plain data; `deserializeWorld(serialize())` is deep-equal to the original. */
	serialize(): WorldData;
}

export type WorldOptions = {
	/** When given, the world emits `world:entity-added` / `world:entity-removed`. */
	events?: EventBus<EventMap>;
};

/** Deep-clones plain data (primitives, arrays, typed arrays, plain objects); the clone has the same shape, hence `as T`. */
export function cloneData<T>(value: T): T {
	return cloneUnknown(value) as T;
}

type TypedArray =
	| Int8Array
	| Uint8Array
	| Uint8ClampedArray
	| Int16Array
	| Uint16Array
	| Int32Array
	| Uint32Array
	| Float32Array
	| Float64Array;

// DataView and BigInt arrays are not valid component data (not needed by any planned module).
const isTypedArray = (v: object): v is TypedArray =>
	ArrayBuffer.isView(v) &&
	!(v instanceof DataView) &&
	!(v instanceof BigInt64Array) &&
	!(v instanceof BigUint64Array);

function cloneUnknown(value: unknown): unknown {
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(cloneUnknown);
	if (isTypedArray(value)) return value.slice();
	if (ArrayBuffer.isView(value)) {
		throw new TypeError(
			'cloneData: DataView and BigInt arrays are not supported in component data'
		);
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value)) out[k] = cloneUnknown(v);
	return out;
}

function build(data: WorldData | undefined, options: WorldOptions): World {
	const events = options.events;
	const live = new Set<EntityId>();
	// Component name -> (entity -> value). Values are `unknown`: the typed `ComponentType` token
	// is the contract that ties a name to its value type.
	const store = new Map<string, Map<EntityId, unknown>>();
	let next = 0;

	if (data) {
		next = data.nextEntity;
		for (const e of data.entities) {
			if (e >= next) throw new Error(`deserializeWorld: entity ${e} >= nextEntity ${next}`);
			live.add(entityId(e));
		}
		for (const [name, byEntity] of Object.entries(data.components)) {
			const m = new Map<EntityId, unknown>();
			for (const [key, value] of Object.entries(byEntity)) {
				const id = entityId(Number(key));
				if (!live.has(id)) {
					throw new Error(`deserializeWorld: component "${name}" refers to unknown entity ${key}`);
				}
				m.set(id, cloneData(value));
			}
			store.set(name, m);
		}
	}

	const requireEntity = (id: EntityId, op: string): void => {
		if (!live.has(id)) throw new Error(`world.${op}: entity ${id} does not exist`);
	};

	return {
		createEntity() {
			const id = entityId(next++);
			live.add(id);
			events?.emit('world:entity-added', { id });
			return id;
		},
		destroyEntity(id) {
			if (!live.delete(id)) return false;
			for (const m of store.values()) m.delete(id);
			events?.emit('world:entity-removed', { id });
			return true;
		},
		hasEntity: (id) => live.has(id),
		entities: () => [...live].sort((a, b) => a - b),
		add(id, type, value) {
			requireEntity(id, 'add');
			let m = store.get(type.name);
			if (!m) store.set(type.name, (m = new Map()));
			m.set(id, value);
		},
		get<T>(id: EntityId, type: ComponentType<T>): T | undefined {
			// The cast is the typed-token contract: only `add<T>` with this token ever wrote here
			// (deserialized data is the caller's responsibility to validate, see deserializeWorld).
			return store.get(type.name)?.get(id) as T | undefined;
		},
		has: (id, type) => store.get(type.name)?.has(id) ?? false,
		remove(id, type) {
			return store.get(type.name)?.delete(id) ?? false;
		},
		query(types) {
			const maps: Map<EntityId, unknown>[] = [];
			for (const t of types) {
				const m = store.get(t.name);
				if (!m) return [];
				maps.push(m);
			}
			const result = [...live].filter((id) => maps.every((m) => m.has(id)));
			return result.sort((a, b) => a - b);
		},
		serialize() {
			const components: WorldData['components'] = {};
			for (const name of [...store.keys()].sort()) {
				const m = store.get(name);
				if (!m || m.size === 0) continue;
				const byEntity: Record<string, unknown> = {};
				for (const id of [...m.keys()].sort((a, b) => a - b))
					byEntity[String(id)] = cloneData(m.get(id));
				components[name] = byEntity;
			}
			return {
				formatVersion: 1,
				nextEntity: next,
				entities: [...live].sort((a, b) => a - b),
				components
			};
		}
	};
}

export const createWorld = (options: WorldOptions = {}): World => build(undefined, options);

/**
 * Rebuild a world from `serialize()` output. The structure is validated here (`worldDataSchema`);
 * component *values* are opaque to core, so the module owning a component validates it itself.
 */
export function deserializeWorld(data: unknown, options: WorldOptions = {}): World {
	const parsed = worldDataSchema.safeParse(data);
	if (!parsed.success) {
		throw new Error(`deserializeWorld: invalid world data: ${z.prettifyError(parsed.error)}`);
	}
	return build(parsed.data, options);
}
