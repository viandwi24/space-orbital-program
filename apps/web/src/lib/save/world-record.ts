/**
 * The web client's world record (plan 077, ADRs 0094 and 0110): what the Worlds list shows without
 * opening a save. The sim's own world fields travel in `SimSave.worldInfo`; this record holds the
 * metadata and owns the saves whose envelope names its `id`. Read from storage, so untrusted.
 */
import {
	LEGACY_WORLD_ID,
	SaveError,
	worldInfoSchema,
	type RuleChange,
	type SaveMod,
	type WorldInfo
} from '@orbital/core';

export type { RuleChange };

export const WORLD_FORMAT = 'orbital-world';
export const WORLD_VERSION = 1;

/** What a world card shows. */
export interface WorldSummary {
	/** Saves the world owns. */
	saves: number;
	/** Vessel of the newest save, or null. */
	vessel: string | null;
	/** Simulation time of the newest save, s. */
	simTime: number;
}

export interface WorldRecord {
	format: typeof WORLD_FORMAT;
	formatVersion: number;
	/** Equals `worldInfo.id` of the world's saves. */
	id: string;
	name: string;
	createdAt: number;
	lastPlayedAt: number;
	/** Label of the preset the world was created with (`sandbox`, `science`, `career`, ...). */
	preset: string;
	/** Plugins at creation; the card warns when one is no longer installed. */
	mods: SaveMod[];
	changelog: RuleChange[];
	summary: WorldSummary;
	/**
	 * The world's info as created (plan 087, ADR 0143): what a flight in a world without saves starts
	 * the sim with. Absent for the Legacy world, whose info the sim makes.
	 */
	world?: WorldInfo;
}

export const LEGACY_WORLD_NAME = 'Legacy world';

/** The world that saves from before worlds existed are attached to (ADR 0094 point 6). */
export function legacyWorldRecord(
	now: number,
	mods: readonly SaveMod[],
	summary: WorldSummary
): WorldRecord {
	return {
		format: WORLD_FORMAT,
		formatVersion: WORLD_VERSION,
		id: LEGACY_WORLD_ID,
		name: LEGACY_WORLD_NAME,
		createdAt: now,
		lastPlayedAt: now,
		preset: 'sandbox',
		mods: mods.map((m) => ({ id: m.id, version: m.version })),
		changelog: [],
		summary
	};
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const ruleValue = (v: unknown): boolean =>
	typeof v === 'boolean' || typeof v === 'string' || finite(v);

const damaged = (what: string): SaveError =>
	new SaveError('damaged', `This world is damaged: ${what}.`);

/** Validate a world record read from storage. */
export function parseWorldRecord(raw: unknown): WorldRecord {
	if (!isRecord(raw) || raw.format !== WORLD_FORMAT) {
		throw new SaveError('not-a-save', 'This is not a Space Orbital Program world.');
	}
	if (typeof raw.formatVersion !== 'number' || !Number.isInteger(raw.formatVersion)) {
		throw new SaveError('not-a-save', 'This world has no valid format version.');
	}
	if (raw.formatVersion > WORLD_VERSION) {
		throw new SaveError(
			'too-new',
			`This world was made by a newer version of Space Orbital Program (world format ${raw.formatVersion}). Update the game to open it.`
		);
	}
	if (typeof raw.id !== 'string' || raw.id === '') throw damaged('it has no id');
	if (typeof raw.name !== 'string') throw damaged('it has no name');
	if (!finite(raw.createdAt) || !finite(raw.lastPlayedAt)) throw damaged('it has no dates');
	if (typeof raw.preset !== 'string') throw damaged('its preset is unreadable');
	if (
		!Array.isArray(raw.mods) ||
		!raw.mods.every((m) => isRecord(m) && typeof m.id === 'string' && typeof m.version === 'string')
	) {
		throw damaged('its mod list is unreadable');
	}
	if (
		!Array.isArray(raw.changelog) ||
		!raw.changelog.every(
			(c) =>
				isRecord(c) &&
				finite(c.time) &&
				typeof c.rule === 'string' &&
				ruleValue(c.from) &&
				ruleValue(c.to)
		)
	) {
		throw damaged('its rule changelog is unreadable');
	}
	const s = raw.summary;
	if (
		!isRecord(s) ||
		!finite(s.saves) ||
		!(s.vessel === null || typeof s.vessel === 'string') ||
		!finite(s.simTime)
	) {
		throw damaged('its summary is unreadable');
	}
	let world: WorldInfo | undefined;
	if (raw.world !== undefined) {
		const parsed = worldInfoSchema.safeParse(raw.world);
		if (!parsed.success || parsed.data.id !== raw.id)
			throw damaged('its world settings are unreadable');
		world = parsed.data;
	}
	return {
		format: WORLD_FORMAT,
		formatVersion: raw.formatVersion,
		id: raw.id,
		name: raw.name,
		createdAt: raw.createdAt,
		lastPlayedAt: raw.lastPlayedAt,
		preset: raw.preset,
		mods: raw.mods as SaveMod[],
		changelog: raw.changelog as RuleChange[],
		summary: { saves: s.saves, vessel: s.vessel, simTime: s.simTime },
		...(world ? { world } : {})
	};
}
