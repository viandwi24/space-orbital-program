/**
 * Save format of a running simulation (plan 043, ADR 0050). Plain JSON data produced by
 * `Sim.save()` and consumed by `createSim({ resume })`; the sim owns what goes in, core owns the
 * envelope: the version, the structural schema, the corruption check and the migration chain
 * (docs/conventions/versioning.md: "migrations live in core").
 *
 * What is NOT here by design: Rapier state (rebuilt from plain pose data), scripts, renderer state,
 * thumbnails and names (the web client's envelope, `apps/web/src/lib/save`).
 */
import * as z from 'zod';
import { worldDataSchema, worldInfoSchema } from './schemas.ts';
import { legacyWorldInfo, type WorldData, type WorldInfo } from './world.ts';
import type { Quat, Vec3 } from './math.ts';

/** Marker that tells a sim save from any other JSON the player might feed the loader. */
export const SIM_SAVE_FORMAT = 'orbital-sim-save';
/** Version this build writes. Bump with a migration step in `SIM_SAVE_MIGRATIONS` and an ADR. */
export const SIM_SAVE_VERSION = 5;

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

export interface SaveWorldTick {
	lastDay: number;
	/** System id to 32-bit stream state. */
	streams: Record<string, number>;
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
 * world's `worldInfo`, with its own seed and the stock plugin version it lists.
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
	}
};

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
 * player can read: foreign files are "not an Orbital save", newer versions say to update the game,
 * edited or cut files fail the checksum. Run on the migrated data, so the checksum is only checked
 * for the version it was written in.
 */
export function readSimSave(
	raw: unknown,
	migrations: Readonly<Record<number, SaveMigration>> = SIM_SAVE_MIGRATIONS,
	current: number = SIM_SAVE_VERSION
): SimSave {
	if (!isRecord(raw) || raw.format !== SIM_SAVE_FORMAT) {
		throw new SaveError('not-a-save', 'This is not an Orbital save file.');
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
	if (isRecord(data.worldInfo) && data.worldInfo.gravityModel === 'n-body') {
		throw new SaveError(
			'incompatible',
			'This save uses n-body gravity; n-body worlds are not available yet.'
		);
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
		throw new SaveError('not-json', 'This file is not valid JSON, so it is not an Orbital save.');
	}
	return readSimSave(raw);
}
