/**
 * The web client's save record (ADR 0050 point 9): a `SimSave` plus what only the client knows -
 * a name, the kind of slot, a thumbnail and the vessel the player was flying. Version 2 (plan 077,
 * ADR 0110) adds the world that owns the save. Everything read from storage or a file is untrusted
 * and goes through `parseGameSave`.
 */
import {
	readSimSave,
	SaveError,
	simSaveChecksum,
	vesselDesignSchema,
	type SaveMod,
	type SimSave,
	type VesselDesign
} from '@orbital/core';

export const GAME_SAVE_FORMAT = 'orbital-game-save';
/**
 * Version 3 (plan 221, ADR 0208 point 1): the sim keeps a design per vessel. A version 2 save
 * gives its focus vessel the envelope's design on load; other vessels get one rebuilt from their
 * parts by the sim.
 */
export const GAME_SAVE_VERSION = 3;

/** `quick`: the one F5 slot. `auto`: the rotating autosaves. `manual`: named by the player. */
export type SaveKind = 'quick' | 'auto' | 'manual';

/** What the list shows without opening the save. */
export interface SaveSummary {
	/** Name of the vessel the player was flying. */
	vessel: string;
	mode: 'flight' | 'on-rails';
	/** Metres above the reference sphere, or null when unknown. */
	altitude: number | null;
	/** Simulation time, s. */
	simTime: number;
	/** Vessels in the save (including debris). */
	vessels: number;
	warp: number;
}

/** Everything but the (large) simulation payload: what the list holds in memory. */
export interface SaveMeta {
	format: typeof GAME_SAVE_FORMAT;
	formatVersion: number;
	id: string;
	name: string;
	kind: SaveKind;
	/** The world record that owns the save (`sim.worldInfo.id`); null for a version 1 save not yet attached. */
	worldId: string | null;
	createdAt: number;
	summary: SaveSummary;
	/** Small JPEG data URL of the flight view, or null. */
	thumbnail: string | null;
	mods: SaveMod[];
}

export interface GameSave extends SaveMeta {
	/** Entity id of the vessel the player was flying, or null. */
	focus: number | null;
	/**
	 * The design the flight was launched with. The HUD's stage read-outs and part names work from
	 * it (part entities map back to its indices through the sim's `PartState.index`).
	 */
	design: VesselDesign;
	sim: SimSave;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

type Components = Record<string, Record<string, unknown>>;

interface VesselLike {
	name: string;
	mode: 'flight' | 'on-rails';
	com: { x: number; y: number; z: number };
}

const vesselsOf = (sim: SimSave): Array<[number, VesselLike]> => {
	const table = (sim.world.components as Components)['sim.vessel'] ?? {};
	return Object.entries(table).map(([id, v]) => [Number(id), v as VesselLike]);
};

/** The list entry text of a save: the focused vessel (or the first), its mode and altitude. */
export function summarise(sim: SimSave, focus: number | null, bodyRadius: number): SaveSummary {
	const vessels = vesselsOf(sim);
	const chosen = vessels.find(([id]) => id === focus) ?? vessels[0];
	const v = chosen?.[1];
	// `com` is the cached centre of mass in the inertial frame; on rails it is stale, so the altitude
	// of a rails vessel is left out rather than guessed (the list shows "on rails").
	const altitude =
		v && v.mode === 'flight' ? Math.hypot(v.com.x, v.com.y, v.com.z) - bodyRadius : null;
	return {
		vessel: v?.name ?? 'Empty space',
		mode: v?.mode ?? 'on-rails',
		altitude,
		simTime: sim.time,
		vessels: vessels.length,
		warp: sim.warp
	};
}

export interface BuildInput {
	id: string;
	name: string;
	kind: SaveKind;
	createdAt: number;
	sim: SimSave;
	focus: number | null;
	design: VesselDesign;
	thumbnail: string | null;
	bodyRadius: number;
}

export function buildGameSave(input: BuildInput): GameSave {
	return {
		format: GAME_SAVE_FORMAT,
		formatVersion: GAME_SAVE_VERSION,
		id: input.id,
		name: input.name,
		kind: input.kind,
		worldId: input.sim.worldInfo.id,
		createdAt: input.createdAt,
		summary: summarise(input.sim, input.focus, input.bodyRadius),
		thumbnail: input.thumbnail,
		mods: input.sim.mods.map((m) => ({ ...m })),
		focus: input.focus,
		design: input.design,
		sim: input.sim
	};
}

const damaged = (what: string): SaveError =>
	new SaveError('damaged', `This save is damaged: ${what}.`);

const summaryOk = (s: unknown): s is SaveSummary =>
	isRecord(s) &&
	typeof s.vessel === 'string' &&
	(s.mode === 'flight' || s.mode === 'on-rails') &&
	(s.altitude === null || (typeof s.altitude === 'number' && Number.isFinite(s.altitude))) &&
	typeof s.simTime === 'number' &&
	typeof s.vessels === 'number' &&
	typeof s.warp === 'number';

/** Check the envelope fields shared by the list and the loader; returns the meta. */
export function parseMeta(raw: unknown): SaveMeta {
	if (!isRecord(raw) || raw.format !== GAME_SAVE_FORMAT) {
		throw new SaveError('not-a-save', 'This is not a Space Orbital Program save file.');
	}
	if (typeof raw.formatVersion !== 'number' || !Number.isInteger(raw.formatVersion)) {
		throw new SaveError('not-a-save', 'This save has no valid format version.');
	}
	if (raw.formatVersion > GAME_SAVE_VERSION) {
		throw new SaveError(
			'too-new',
			`This save was made by a newer version of Space Orbital Program (file format ${raw.formatVersion}). Update the game to open it.`
		);
	}
	if (typeof raw.id !== 'string' || raw.id === '') throw damaged('it has no id');
	if (typeof raw.name !== 'string') throw damaged('it has no name');
	if (raw.kind !== 'quick' && raw.kind !== 'auto' && raw.kind !== 'manual') {
		throw damaged('its slot kind is unknown');
	}
	// Version 1 had no world: such a save is unassigned until the client migration attaches it.
	const worldId = raw.worldId ?? null;
	if (worldId !== null && (typeof worldId !== 'string' || worldId === '')) {
		throw damaged('the world it belongs to is unreadable');
	}
	if (typeof raw.createdAt !== 'number' || !Number.isFinite(raw.createdAt)) {
		throw damaged('it has no date');
	}
	if (!summaryOk(raw.summary)) throw damaged('its summary is unreadable');
	if (raw.thumbnail !== null && typeof raw.thumbnail !== 'string')
		throw damaged('its picture is unreadable');
	if (
		!Array.isArray(raw.mods) ||
		!raw.mods.every((m) => isRecord(m) && typeof m.id === 'string' && typeof m.version === 'string')
	) {
		throw damaged('its mod list is unreadable');
	}
	return {
		format: GAME_SAVE_FORMAT,
		formatVersion: raw.formatVersion,
		id: raw.id,
		name: raw.name,
		kind: raw.kind,
		worldId,
		createdAt: raw.createdAt,
		summary: raw.summary,
		thumbnail: raw.thumbnail,
		mods: raw.mods as SaveMod[]
	};
}

/** Validate an envelope read from storage or a file, including the simulation payload. */
export function parseGameSave(raw: unknown): GameSave {
	const meta = parseMeta(raw);
	const record = raw as Record<string, unknown>;
	const focus = record.focus;
	if (focus !== null && !(typeof focus === 'number' && Number.isInteger(focus) && focus >= 0)) {
		throw damaged('the vessel it was flying is unreadable');
	}
	const design = vesselDesignSchema.safeParse(record.design);
	if (!design.success) throw damaged('the design it was launched with is unreadable');
	const sim = readSimSave(record.sim);
	if (meta.formatVersion < 3 && focus !== null) seedFocusDesign(sim, focus, design.data);
	return {
		...meta,
		// A version 1 envelope: its payload migrated into the Legacy world (ADR 0110), so it is that world's.
		worldId: meta.worldId ?? sim.worldInfo.id,
		focus,
		design: design.data,
		sim
	};
}

/** Give the focus vessel of a version 2 save the design it was launched with (plan 221). */
function seedFocusDesign(sim: SimSave, focus: number, design: VesselDesign): void {
	const vessels = sim.world.components['sim.vessel'];
	const vessel = vessels?.[String(focus)];
	if (!isRecord(vessel) || vessel.design !== undefined) return;
	vessel.design = structuredClone(design);
	const { checksum: _old, ...rest } = sim;
	sim.checksum = simSaveChecksum(rest);
}

/** Parse the text of a save file. */
export function parseGameSaveText(text: string): GameSave {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new SaveError(
			'not-json',
			'This file is not valid JSON, so it is not a Space Orbital Program save.'
		);
	}
	return parseGameSave(raw);
}

export interface ModReport {
	/** Plugins the save needs that are not loaded. */
	missing: SaveMod[];
	/** Plugins loaded in another version than the save was made with. */
	changed: Array<{ id: string; saved: string; loaded: string }>;
}

/** Compare the save's mods with the plugins the game booted (`loaded`: id to version). */
export function compareMods(
	saved: readonly SaveMod[],
	loaded: ReadonlyMap<string, string>
): ModReport {
	const report: ModReport = { missing: [], changed: [] };
	for (const mod of saved) {
		const version = loaded.get(mod.id);
		if (version === undefined) report.missing.push(mod);
		else if (version !== mod.version)
			report.changed.push({ id: mod.id, saved: mod.version, loaded: version });
	}
	return report;
}

/** File name for an exported save: lower-case words from the name. */
export function exportFileName(name: string): string {
	const slug = name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
	return `${slug === '' ? 'orbital-save' : slug}.orbital-save.json`;
}

/** What the flight screen needs to carry on a loaded flight (the HUD and the input state). */
export interface ResumeInfo {
	design: VesselDesign;
	/** The vessel to fly: the saved focus, else the first vessel with a control source is left to the page. */
	focus: number | null;
	/** Part entity to design index, for the vessel in focus. */
	entityIndex: Map<number, number>;
	/** Stages the focus vessel has fired. */
	stagesFired: number;
	/** The throttle it was left at. */
	throttle: number;
}

interface PartLike {
	vessel: number;
	index: number;
}
interface FlyingLike {
	nextStage: number;
	control: { throttle: number };
}

export function resumeInfo(save: GameSave): ResumeInfo {
	const components = save.sim.world.components as Components;
	const entityIndex = new Map<number, number>();
	if (save.focus !== null) {
		for (const [id, part] of Object.entries(components['sim.part'] ?? {})) {
			const p = part as PartLike;
			if (p.vessel === save.focus) entityIndex.set(Number(id), p.index);
		}
	}
	const vessel = save.focus === null ? undefined : components['sim.vessel']?.[String(save.focus)];
	const flying = vessel as FlyingLike | undefined;
	return {
		design: save.design,
		focus: save.focus,
		entityIndex,
		stagesFired: flying?.nextStage ?? 0,
		throttle: flying?.control.throttle ?? 0
	};
}
