/**
 * Save format of a running simulation (plan 043, ADR 0050). Plain JSON data produced by
 * `Sim.save()` and consumed by `createSim({ resume })`; the sim owns what goes in, core owns the
 * envelope: the version, the structural schema, the corruption check and the migration chain
 * (docs/conventions/versioning.md: "migrations live in core").
 *
 * What is NOT here by design: Rapier state (rebuilt from plain pose data), scripts, renderer state,
 * thumbnails and names (the web client's envelope, `apps/web/src/lib/save`).
 */
import { dataItemSchema, type DataItem } from './data.ts';
import { saveTechSchema, type SaveTech } from './tech-tree.ts';
import * as z from 'zod';
import { worldDataSchema, worldInfoSchema } from './schemas.ts';
import { saveEconomySchema, type SaveEconomy } from './economy.ts';
import { saveCrewSchema, type SaveCrew } from './crew.ts';
import { saveScienceSchema, type SaveScience } from './science.ts';
import { saveMilestonesSchema, type SaveMilestones } from './milestones.ts';
import { saveRangeSchema, type SaveRange } from './range-safety.ts';
import { saveReliabilitySchema, type SaveReliability } from './reliability.ts';
import { saveContractsSchema, type SaveContracts } from './contracts.ts';
import { saveStrategiesSchema, type SaveStrategies } from './strategies.ts';
import { saveAgenciesSchema, type SaveAgencies } from './agencies.ts';
import { saveDiscoverySchema, type SaveDiscovery } from './discovery.ts';
import { legacyWorldInfo, type WorldData, type WorldInfo } from './world.ts';
import { routeModeSchema, type RouteMode } from './comms.ts';
import type { Quat, Vec3 } from './math.ts';
import type { AlarmSnapshot } from './protocol.ts';

/** Marker that tells a sim save from any other JSON the player might feed the loader. */
export const SIM_SAVE_FORMAT = 'orbital-sim-save';
/** Version this build writes. Bump with a migration step in `SIM_SAVE_MIGRATIONS` and an ADR. */
export const SIM_SAVE_VERSION = 10;

/** A plugin that was booted when the save was made. */
export interface SaveMod {
	id: string;
	version: string;
}

/** The exact rigid-body state of one flight vessel (what Rapier would otherwise hold privately). */
export interface SaveBody {
	vessel: number;
	/** Pose of the body origin (the root part's origin) in the frame's local axes. Float32-exact. */
	origin: Vec3;
	rotation: Quat;
	/** Velocity of the centre of mass, local axes. */
	linear: Vec3;
	angular: Vec3;
	/** Mass properties last pushed to the backend; the next step pushes any change itself. */
	mass: number;
	com: Vec3;
	inertia: Vec3;
	inertiaFrame: Quat;
	/** Mass per part last pushed, as `[part entity, kg]` pairs. */
	masses: Array<[number, number]>;
}

/** One physics frame: its local origin and velocity, and the bodies in creation order. */
export interface SaveFrame {
	id: number;
	inUse: boolean;
	origin: Vec3;
	velocity: Vec3;
	/** Id of the body whose body-centred frame the frame's origin and velocity are in (format 2). */
	soi: string;
	vessels: number[];
	bodies: SaveBody[];
}

/** One started contract or mission (plan 098). */
export interface SaveActiveObjective {
	id: string;
	source: { kind: 'contract' | 'mission'; id: string };
	vessel?: number;
	/** Only vessels with a higher entity id count: launched after the start (plan 099, ADR 0186 point 3). */
	since?: number;
	startedAt: number;
	deadline?: number;
	status: 'active' | 'done' | 'failed';
	progress: number;
	/** Leaf results by tree path. */
	leaves: Record<
		string,
		{
			status: 'active' | 'done' | 'failed';
			progress: number;
			data?: Record<string, boolean | number | string>;
		}
	>;
	finishedAt?: number;
}

export interface SaveObjectives {
	/** Counter for instance ids (`o1`, `o2`, ...). */
	next: number;
	active: SaveActiveObjective[];
	finished: SaveActiveObjective[];
}

const objectiveStatus = z.enum(['active', 'done', 'failed']);
const saveActiveObjectiveSchema = z.object({
	id: z.string().min(1),
	source: z.object({ kind: z.enum(['contract', 'mission']), id: z.string().min(1) }),
	vessel: z.int().optional(),
	since: z.int().optional(),
	startedAt: z.number(),
	deadline: z.number().optional(),
	status: objectiveStatus,
	progress: z.number().min(0).max(1),
	leaves: z.record(
		z.string(),
		z.object({
			status: objectiveStatus,
			progress: z.number().min(0).max(1),
			data: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).optional()
		})
	),
	finishedAt: z.number().optional()
});
export const saveObjectivesSchema = z.object({
	next: z.int().min(1),
	active: z.array(saveActiveObjectiveSchema),
	finished: z.array(saveActiveObjectiveSchema)
});

export interface SaveWorldTick {
	lastDay: number;
	/** System id to 32-bit stream state. */
	streams: Record<string, number>;
}

/** The saved part of comms (format 7, ADR 0188 point 7). */
export interface SaveComms {
	/** Counter of queued commands, for their order. */
	seq: number;
	/** Vessels whose route is not Auto. */
	routes: Array<{ vessel: number; mode: RouteMode }>;
	/** Commands waiting for their light time under `enforced` or `flight-computer`. */
	/** `source`: a program's command keeps who sent it (plan 320, ADR 0276 point 2); absent is the player. */
	queue: Array<{
		at: number;
		seq: number;
		command: Record<string, unknown>;
		source?: 'script' | 'autopilot';
	}>;
	/** Data items being sent (format 8, plan 119, ADR 0189 point 2), in order of `seq`. */
	transmissions: SaveTransmission[];
	/** Licensed channels beyond channel 0 (plan 120, ADR 0191 point 2); optional. */
	licences?: Array<{ band: string; channel: number }>;
	/** Milestones broadcast live (plan 121, ADR 0193 point 5); optional. */
	broadcasts?: string[];
}

/** One data item in a radio's queue (ADR 0189 point 2). */
export interface SaveTransmission {
	seq: number;
	/** The vessel that has it now (a relay after a custody hand-over). */
	holder: number;
	/** The vessel that sent it first. */
	origin: number;
	item: DataItem;
	/** Bits already gone from the holder. */
	sent: number;
	/** Custody hand-overs so far. */
	hops: number;
}

/** User alarms (plan 224): the next id number and the alarms in time order. */
export interface SaveAlarms {
	next: number;
	list: AlarmSnapshot[];
}

export interface SimSave {
	format: typeof SIM_SAVE_FORMAT;
	formatVersion: number;
	/** `API_VERSION` of the build that wrote the save (informational; mods are matched by id). */
	apiVersion: string;
	/** Booted plugins in boot order. Resume refuses a save whose plugin is not loaded. */
	mods: SaveMod[];
	/** Ids of every body of the sim, root first (format 2; format 1 had the root only, `body`). */
	bodies: string[];
	/**
	 * The home body the sim ran on (format 6, plan 122, ADR 0119): the tree's root is no longer
	 * home once a Sun sits there. Earlier saves were rooted at home, so the migration takes `bodies[0]`.
	 */
	home: string;
	/**
	 * Pinned route modes and the signal-delay queue (format 7, plan 117, ADR 0188 point 7). The
	 * migration from 6 adds an empty one.
	 */
	comms: SaveComms;
	/** Fixed step the run used; a different step would break determinism. */
	dt: number;
	/** Seed the sim started with (informational; `rng` is the live state). */
	seed: number;
	/** Simulation time, s. */
	time: number;
	warp: number;
	/** Simulation time a `warp-to` is heading for, or null (format 3, plan 045). */
	warpTarget: number | null;
	/** Wall time carried over between `step` calls, simulated s. */
	accumulator: number;
	/** 32-bit PRNG state (`Rng.state()`). */
	rng: number;
	/** The world this run belongs to (format 5, plan 077, ADR 0110). */
	worldInfo: WorldInfo;
	/**
	 * World tick state (plan 082, ADR 0171): the last day entered and each world-tick system's
	 * stream. Optional in format 5: without it the day is derived from `time` and streams start fresh.
	 */
	worldTick?: SaveWorldTick;
	/** Ledger and balances (plan 095, ADR 0113); optional in format 5, absent = a fresh ledger. */
	economy?: SaveEconomy;
	/** Started objectives (plan 098, ADR 0175 point 8); optional in format 5, absent = none. */
	objectives?: SaveObjectives;
	/** Contract offers and accepted generated contracts (plan 099, ADR 0186); optional, absent = none yet. */
	contracts?: SaveContracts;
	/** Active strategies and cooldowns (plan 101, ADR 0187); optional, absent = none ever. */
	strategies?: SaveStrategies;
	/** Rival agencies, rentals and news (plan 126, ADR 0190); optional, absent = none ran yet. */
	agencies?: SaveAgencies;
	/** Discovery datasets and claims (plan 129, ADR 0192 point 7); optional, absent = none yet. */
	discovery?: SaveDiscovery;
	/** The crew roster (plan 106, ADR 0176 point 1); optional in format 5, absent = nobody hired. */
	crew?: SaveCrew;
	/** Science subjects (plan 103, ADR 0178 point 8); optional in format 5, absent = none yet. */
	science?: SaveScience;
	/** Firsts and per-vessel visits (plan 102, ADR 0147 point 3); optional in format 5, absent = none. */
	milestones?: SaveMilestones;
	/** Researched tech nodes (plan 105, ADR 0154 point 3); optional in format 5, absent = none. */
	tech?: SaveTech;
	/** Ascents whose azimuth is still to be judged (plan 127, ADR 0155 point 4); optional in format 5. */
	range?: SaveRange;
	/** Part reliability (plan 130, ADR 0156); optional in format 5, absent = rule never on. */
	reliability?: SaveReliability;
	/** User alarms (plan 224, ADR 0223); optional, absent = none set yet. */
	alarms?: SaveAlarms;
	/** Mod stores by id (plan 343, ADR 0292 point 4); optional, absent = none written. */
	stores?: Record<string, unknown>;
	world: WorldData;
	frames: SaveFrame[];
	/** Hash of everything above; detects truncated or edited files (not tamper-proof). */
	checksum: string;
}

const finite = z.number().refine(Number.isFinite, 'expected a finite number');
const vec3 = z.object({ x: finite, y: finite, z: finite });
const quat = z.object({ x: finite, y: finite, z: finite, w: finite });
const entity = z.int().nonnegative();

const saveBodySchema = z.object({
	vessel: entity,
	origin: vec3,
	rotation: quat,
	linear: vec3,
	angular: vec3,
	mass: finite.refine((m) => m > 0, 'mass must be positive'),
	com: vec3,
	inertia: vec3,
	inertiaFrame: quat,
	masses: z.array(z.tuple([entity, finite]))
});

const saveFrameSchema = z.object({
	id: z.int().nonnegative(),
	inUse: z.boolean(),
	origin: vec3,
	velocity: vec3,
	soi: z.string().min(1),
	vessels: z.array(entity),
	bodies: z.array(saveBodySchema)
});

export const simSaveSchema = z.object({
	format: z.literal(SIM_SAVE_FORMAT),
	formatVersion: z.int().positive(),
	apiVersion: z.string(),
	mods: z.array(z.object({ id: z.string().min(1), version: z.string() })),
	bodies: z.array(z.string().min(1)).min(1),
	home: z.string().min(1),
	comms: z.object({
		seq: z.int().min(0),
		routes: z.array(z.object({ vessel: z.int(), mode: routeModeSchema })),
		queue: z.array(
			z.object({
				at: z.number(),
				seq: z.int().min(0),
				command: z.record(z.string(), z.unknown()),
				source: z.enum(['script', 'autopilot']).optional()
			})
		),
		transmissions: z.array(
			z.object({
				seq: z.int().min(0),
				holder: z.int(),
				origin: z.int(),
				item: dataItemSchema,
				sent: z.number().min(0),
				hops: z.int().min(0)
			})
		),
		licences: z.array(z.object({ band: z.string().min(1), channel: z.int().min(0) })).optional(),
		broadcasts: z.array(z.string().min(1)).optional()
	}),
	dt: finite.refine((d) => d > 0, 'dt must be positive'),
	seed: finite,
	time: finite.refine((t) => t >= 0, 'time must not be negative'),
	warp: finite.refine((w) => w >= 1, 'warp must be at least 1'),
	warpTarget: finite.nullable(),
	accumulator: finite.refine((a) => a >= 0, 'accumulator must not be negative'),
	rng: z.int().min(0).max(0xffffffff),
	worldInfo: worldInfoSchema,
	worldTick: z
		.object({
			lastDay: z.int(),
			streams: z.record(z.string().min(1), z.int().min(0).max(0xffffffff))
		})
		.optional(),
	economy: saveEconomySchema.optional(),
	objectives: saveObjectivesSchema.optional(),
	contracts: saveContractsSchema.optional(),
	strategies: saveStrategiesSchema.optional(),
	agencies: saveAgenciesSchema.optional(),
	discovery: saveDiscoverySchema.optional(),
	crew: saveCrewSchema.optional(),
	science: saveScienceSchema.optional(),
	milestones: saveMilestonesSchema.optional(),
	tech: saveTechSchema.optional(),
	range: saveRangeSchema.optional(),
	reliability: saveReliabilitySchema.optional(),
	alarms: z
		.object({
			next: z.int().min(1),
			list: z.array(
				z.object({
					id: z.string().min(1),
					name: z.string(),
					time: finite,
					kind: z.enum(['time', 'apoapsis', 'periapsis', 'soi', 'node', 'transfer']),
					vessel: entity.optional(),
					body: z.string().min(1).optional(),
					lead: z.number().min(0).max(86_400).optional()
				})
			)
		})
		.optional(),
	stores: z.record(z.string().min(1), z.unknown()).optional(),
	world: worldDataSchema,
	frames: z.array(saveFrameSchema),
	checksum: z.string().min(1)
});

/**
 * 53-bit string hash (cyrb53, public domain) as 14 hex digits. A corruption check for files that
 * travel through editors and mail, not a security measure.
 */
export function hashText(text: string): string {
	let h1 = 0xdeadbeef;
	let h2 = 0x41c6ce57;
	for (let i = 0; i < text.length; i++) {
		const ch = text.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

/** The checksum a save should carry: the hash of its JSON without the `checksum` field. */
export function simSaveChecksum(save: Omit<SimSave, 'checksum'>): string {
	return hashText(JSON.stringify(save));
}

/** Move a save of version N to N + 1. Keyed by the version it upgrades FROM. */
export type SaveMigration = (data: Record<string, unknown>) => Record<string, unknown>;

/**
 * The migration chain (versioning.md), keyed by the version a step upgrades from. 1 to 2 (plan 044,
 * ADR 0051): the single root `body` becomes the list `bodies`, and every frame says which body it
 * is centred on (`soi`, the root: a version 1 sim had no other). The version 1 fixture is
 * `packages/sim/test/fixtures/save-v1.json`. 4 to 5 (plan 077, ADR 0110): the save gets the Legacy
 * world's `worldInfo`, with its own seed and the stock plugin version it lists. 5 to 6 (plan 122,
 * ADR 0119): the save names its `home`, which was `bodies[0]` (the root) in every earlier save.
 */
export const SIM_SAVE_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
	1: (data) => {
		const { body, frames, ...rest } = data;
		if (typeof body !== 'string' || !Array.isArray(frames)) {
			throw new SaveError('damaged', 'This save is damaged: it has no root body or frames.');
		}
		return {
			...rest,
			formatVersion: 2,
			bodies: [body],
			frames: frames.map((f) => (isRecord(f) ? { ...f, soi: body } : f))
		};
	},
	2: (data) => {
		const world = data.world;
		if (!isRecord(world) || !isRecord(world.components)) {
			throw new SaveError('damaged', 'This save is damaged: it has no world.');
		}
		const vessels = world.components['sim.vessel'];
		const upgraded: Record<string, unknown> = {};
		if (isRecord(vessels)) {
			for (const [id, vessel] of Object.entries(vessels)) {
				upgraded[id] = isRecord(vessel) ? { ...vessel, nodes: [] } : vessel;
			}
		}
		const components = isRecord(vessels)
			? { ...world.components, 'sim.vessel': upgraded }
			: world.components;
		return {
			...data,
			formatVersion: 3,
			warpTarget: null,
			world: { ...world, components }
		};
	},
	3: (data) => {
		const world = data.world;
		if (!isRecord(world) || !isRecord(world.components)) {
			throw new SaveError('damaged', 'This save is damaged: it has no world.');
		}
		const vessels = world.components['sim.vessel'];
		const upgraded: Record<string, unknown> = {};
		if (isRecord(vessels)) {
			for (const [id, vessel] of Object.entries(vessels)) {
				upgraded[id] = isRecord(vessel) ? { ...vessel, target: null } : vessel;
			}
		}
		const components = isRecord(vessels)
			? { ...world.components, 'sim.vessel': upgraded }
			: world.components;
		return { ...data, formatVersion: 4, world: { ...world, components } };
	},
	4: (data) => {
		const seed = typeof data.seed === 'number' ? data.seed : 0;
		const mods = Array.isArray(data.mods) ? data.mods : [];
		const stock = mods.find((m) => isRecord(m) && m.id === 'stock');
		const version =
			isRecord(stock) && typeof stock.version === 'string' ? stock.version : undefined;
		return { ...data, formatVersion: 5, worldInfo: legacyWorldInfo(seed, version) };
	},
	5: (data) => {
		const bodies = data.bodies;
		if (!Array.isArray(bodies) || typeof bodies[0] !== 'string') {
			throw new SaveError('damaged', 'This save is damaged: it lists no bodies.');
		}
		return { ...data, formatVersion: 6, home: bodies[0] };
	},
	// format 7 (plan 117, ADR 0188 point 7): routes and the delay queue start empty
	6: (data) => ({ ...data, formatVersion: 7, comms: { seq: 0, routes: [], queue: [] } }),
	// format 8 (plan 119, ADR 0189 point 7): the radios' queues start empty
	7: (data) => {
		const comms = isRecord(data.comms) ? data.comms : { seq: 0, routes: [], queue: [] };
		return { ...data, formatVersion: 8, comms: { ...comms, transmissions: [] } };
	},
	// format 9 (plan 208, ADR 0203 point 2): EVA propellant is renamed cold gas, same amounts
	8: (data) => ({
		...renameId(data, 'stock.eva-propellant', 'stock.cold-gas'),
		formatVersion: 9
	}),
	// format 10 (plan 210, ADR 0203): the BST-1 is a solid motor; a flying one keeps its fill
	9: (data) => ({ ...solidBst1(data), formatVersion: 10 })
};

/** The BST-1 since plan 210 (`mods/stock/src/parts/engines.ts`): the configs a migrated part takes. */
export const BST1_SOLID = {
	engine: {
		thrust: 150_000,
		ispVacuum: 200,
		ispSeaLevel: 175,
		propellants: [{ resource: 'stock.solid-fuel', ratio: 1 }],
		gimbal: { range: 0, rate: 20 },
		solid: true
	},
	fuel: 330,
	/** The liquid BST-1's 225 u fuel + 275 u oxidizer. */
	liquid: 500
} as const;

/**
 * Format 9 → 10: every `stock.booster` part takes the solid engine and container configs, and its
 * liquid fuel and oxidizer become solid fuel at the same fraction full. Designs only name parts, so
 * nothing else changes.
 */
function solidBst1(data: Record<string, unknown>): Record<string, unknown> {
	const world = data.world;
	if (!isRecord(world) || !isRecord(world.components)) return data;
	const parts = world.components['sim.part'];
	if (!isRecord(parts)) return data;
	const boosters = Object.entries(parts).filter(
		([, p]) => isRecord(p) && p.definition === 'stock.booster'
	);
	if (boosters.length === 0) return data;
	const components: Record<string, unknown> = { ...world.components };
	const newParts: Record<string, unknown> = { ...parts };
	const stateKey = Object.keys(components).find((k) => k.endsWith(':stock.resource-container'));
	const states = stateKey && isRecord(components[stateKey]) ? { ...components[stateKey] } : null;
	for (const [id, part] of boosters) {
		const p = part as Record<string, unknown>;
		const modules = Array.isArray(p.modules) ? p.modules : [];
		newParts[id] = {
			...p,
			modules: modules.map((m) => {
				if (!isRecord(m)) return m;
				if (m.id === 'stock.engine') return { ...m, config: structuredClone(BST1_SOLID.engine) };
				if (m.id === 'stock.resource-container') {
					return {
						...m,
						config: { contents: { 'stock.solid-fuel': { capacity: BST1_SOLID.fuel } } }
					};
				}
				return m;
			})
		};
		if (states && isRecord(states[id])) {
			const state = states[id] as Record<string, unknown>;
			const amounts = isRecord(state.amounts) ? state.amounts : {};
			const liquid = Object.values(amounts).reduce<number>(
				(sum, v) => sum + (typeof v === 'number' ? v : 0),
				0
			);
			const fraction = Math.min(1, Math.max(0, liquid / BST1_SOLID.liquid));
			states[id] = { ...state, amounts: { 'stock.solid-fuel': BST1_SOLID.fuel * fraction } };
		}
	}
	components['sim.part'] = newParts;
	if (stateKey && states) components[stateKey] = states;
	return { ...data, world: { ...world, components } };
}

/**
 * `value` with every object key and every string equal to `from` replaced by `to`: a definition
 * id renamed in a save (the containers' amounts, engine propellants, snapshots of modules).
 */
export function renameId<T>(value: T, from: string, to: string): T {
	if (typeof value === 'string') return (value === from ? to : value) as T;
	if (Array.isArray(value)) return value.map((v) => renameId(v, from, to)) as T;
	if (isRecord(value)) {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k === from ? to : k] = renameId(v, from, to);
		return out as T;
	}
	return value;
}

export class SaveError extends Error {
	override readonly name = 'SaveError';
	constructor(
		/** Machine-readable cause, for the UI to pick a message and a recovery. */
		readonly code:
			'not-json' | 'not-a-save' | 'too-new' | 'damaged' | 'missing-mod' | 'incompatible',
		message: string
	) {
		super(message);
	}
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Validate and upgrade unknown data to the current `SimSave`. Throws `SaveError` with a message a
 * player can read: foreign files are "not a Space Orbital Program save", newer versions say to update the game,
 * edited or cut files fail the checksum. Run on the migrated data, so the checksum is only checked
 * for the version it was written in.
 */
export function readSimSave(
	raw: unknown,
	migrations: Readonly<Record<number, SaveMigration>> = SIM_SAVE_MIGRATIONS,
	current: number = SIM_SAVE_VERSION
): SimSave {
	if (!isRecord(raw) || raw.format !== SIM_SAVE_FORMAT) {
		throw new SaveError('not-a-save', 'This is not a Space Orbital Program save file.');
	}
	const declared = raw.formatVersion;
	if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 1) {
		throw new SaveError('not-a-save', 'This save has no valid format version.');
	}
	let version: number = declared;
	if (version > current) {
		throw new SaveError(
			'too-new',
			`This save was made by a newer version of Orbital (save format ${version}; this game reads up to ${current}). Update the game to open it.`
		);
	}
	// The checksum guards the bytes the file was written with, so it is checked before any upgrade.
	if (typeof raw.checksum !== 'string' || raw.checksum === '') {
		throw new SaveError('damaged', 'This save is damaged: the checksum is missing.');
	}
	// `checksum: undefined` drops the key and keeps the order of the others, as when it was written.
	if (hashText(JSON.stringify({ ...raw, checksum: undefined })) !== raw.checksum) {
		throw new SaveError(
			'damaged',
			'This save is damaged: its contents do not match its checksum (cut off or edited?).'
		);
	}
	let data: Record<string, unknown> = raw;
	while (version < current) {
		const step = migrations[version];
		if (!step) {
			throw new SaveError('incompatible', `No migration from save format ${version} is available.`);
		}
		data = step(data);
		version = data.formatVersion as number;
	}
	const parsed = simSaveSchema.safeParse(data);
	if (!parsed.success) {
		throw new SaveError(
			'damaged',
			`This save is damaged: ${z.prettifyError(parsed.error).split('\n').slice(0, 3).join('; ')}`
		);
	}
	// Re-sign the result over the parsed data: migrations and schema defaults (ADR 0111) change it,
	// and zod gives the schema's key order, so a second read (createSim reads what the storage
	// layer already read) checks its own bytes. The raw bytes were verified above.
	const { checksum: _old, ...body } = parsed.data;
	return { ...body, checksum: hashText(JSON.stringify(body)) } as SimSave;
}

/** Parse a JSON string, then `readSimSave`. */
export function parseSimSave(text: string): SimSave {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new SaveError(
			'not-json',
			'This file is not valid JSON, so it is not a Space Orbital Program save.'
		);
	}
	return readSimSave(raw);
}
