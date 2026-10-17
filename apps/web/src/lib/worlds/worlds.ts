/**
 * The worlds a player has (plan 087, ADR 0143): records in the `WorldStore`, the saves they own in
 * the `SaveStore`, and the one active world the VAB and the flight use. Storage is untrusted: every
 * record is parsed, and one that does not parse is listed with its error instead of hiding the rest.
 */
import { LEGACY_WORLD_ID, legacyWorldInfo, type SaveMod, type WorldInfo } from '@orbital/core';
import { parseGameSave, parseMeta, type SaveMeta } from '../save/game-save';
import type { SaveStore } from '../save/store';
import {
	WORLD_FORMAT,
	WORLD_VERSION,
	legacyWorldRecord,
	parseWorldRecord,
	type WorldRecord,
	type WorldSummary
} from '../save/world-record';
import type { WorldStore } from '../save/world-store';
import { duplicateWorldInfo } from './world-model';

/** `localStorage` key of the active world's id (absent: the Legacy world). */
export const ACTIVE_WORLD_KEY = 'orbital.world';
export const MAX_WORLD_NAME = 48;

export function activeWorldId(): string {
	try {
		return localStorage.getItem(ACTIVE_WORLD_KEY) || LEGACY_WORLD_ID;
	} catch {
		return LEGACY_WORLD_ID;
	}
}

export function setActiveWorld(id: string): void {
	try {
		if (id === LEGACY_WORLD_ID) localStorage.removeItem(ACTIVE_WORLD_KEY);
		else localStorage.setItem(ACTIVE_WORLD_KEY, id);
	} catch {
		// private mode: the choice lasts for this page only
	}
}

export type WorldEntry =
	{ ok: true; record: WorldRecord } | { ok: false; id: string; error: string };

export interface WorldsEnv {
	now(): number;
	newId(): string;
	/** A fresh seed for Duplicate's "new seed" (any 32-bit integer). */
	newSeed(): number;
}

export const browserWorldsEnv = (): WorldsEnv => ({
	now: () => Date.now(),
	newId: () => crypto.randomUUID(),
	newSeed: () => crypto.getRandomValues(new Uint32Array(1))[0]!
});

const cleanName = (name: string): string =>
	name.replace(/\s+/g, ' ').trim().slice(0, MAX_WORLD_NAME);

const emptySummary = (): WorldSummary => ({ saves: 0, vessel: null, simTime: 0 });

export interface Worlds {
	/** Every world, the one played last first. */
	list(): Promise<WorldEntry[]>;
	get(id: string): Promise<WorldRecord | undefined>;
	/** A record for a world made in Create World (its info travels in the record until the first save). */
	create(world: WorldInfo, name: string, mods: readonly SaveMod[]): Promise<WorldRecord>;
	rename(id: string, name: string): Promise<WorldRecord>;
	/** A new world with the same rules and start; optionally a new name and seed. No saves are copied. */
	duplicate(id: string, options?: { name?: string; newSeed?: boolean }): Promise<WorldRecord>;
	/** Deletes the world and every save that names it. */
	remove(id: string): Promise<void>;
	/** The world was played: `lastPlayedAt` now, and the summary from its saves (creates the Legacy record when missing). */
	touch(id: string): Promise<void>;
	/** The info a flight without a save starts with: the record's, or none (the sim makes the Legacy world). */
	startInfo(id: string): Promise<WorldInfo | undefined>;
	/** The world's saves, newest first. */
	saves(id: string): Promise<SaveMeta[]>;
	/**
	 * The Space Center changed the buildings (plan 091, ADR 0117 point 5): the record's world takes
	 * these sites, and new flights start with them. The Legacy world gets a world info here.
	 */
	setSites(id: string, sites: WorldInfo['sites']): Promise<void>;
}

export function createWorlds(worlds: WorldStore, saves: SaveStore, env: WorldsEnv): Worlds {
	async function metas(): Promise<SaveMeta[]> {
		const out: SaveMeta[] = [];
		for (const raw of await saves.listMeta()) {
			try {
				out.push(parseMeta(raw));
			} catch {
				// a damaged save is the Load dialog's to report
			}
		}
		return out.sort((a, b) => b.createdAt - a.createdAt);
	}
	const savesOf = async (id: string): Promise<SaveMeta[]> =>
		(await metas()).filter((m) => (m.worldId ?? LEGACY_WORLD_ID) === id);

	async function get(id: string): Promise<WorldRecord | undefined> {
		const raw = await worlds.get(id);
		return raw === undefined ? undefined : parseWorldRecord(raw);
	}
	async function need(id: string): Promise<WorldRecord> {
		const record = await get(id);
		if (!record) throw new Error('That world no longer exists.');
		return record;
	}
	async function namesTaken(except?: string): Promise<Set<string>> {
		const out = new Set<string>();
		for (const e of await list()) if (e.ok && e.record.id !== except) out.add(e.record.name);
		return out;
	}
	async function uniqueName(base: string, except?: string): Promise<string> {
		const taken = await namesTaken(except);
		if (!taken.has(base)) return base;
		for (let n = 2; ; n++) {
			const candidate = `${base} (${n})`;
			if (!taken.has(candidate)) return candidate;
		}
	}
	async function list(): Promise<WorldEntry[]> {
		const out: WorldEntry[] = [];
		for (const raw of await worlds.list()) {
			try {
				out.push({ ok: true, record: parseWorldRecord(raw) });
			} catch (e) {
				const id = typeof raw === 'object' && raw !== null && 'id' in raw ? String(raw.id) : '?';
				out.push({ ok: false, id, error: e instanceof Error ? e.message : String(e) });
			}
		}
		const at = (e: WorldEntry): number => (e.ok ? e.record.lastPlayedAt : 0);
		return out.sort((a, b) => at(b) - at(a));
	}
	async function summaryOf(id: string): Promise<WorldSummary> {
		const own = await savesOf(id);
		const newest = own[0];
		return newest
			? { saves: own.length, vessel: newest.summary.vessel, simTime: newest.summary.simTime }
			: emptySummary();
	}

	return {
		list,
		get,
		async create(world, name, mods) {
			const now = env.now();
			const record: WorldRecord = {
				format: WORLD_FORMAT,
				formatVersion: WORLD_VERSION,
				id: world.id,
				name: await uniqueName(cleanName(name) || 'New world'),
				createdAt: now,
				lastPlayedAt: now,
				preset: world.preset,
				mods: mods.map((m) => ({ id: m.id, version: m.version })),
				changelog: [],
				summary: emptySummary(),
				world
			};
			await worlds.put(record);
			return record;
		},
		async rename(id, name) {
			const record = await need(id);
			const base = cleanName(name);
			if (base === '') throw new Error('A world needs a name.');
			const renamed = { ...record, name: await uniqueName(base, id) };
			await worlds.put(renamed);
			return renamed;
		},
		async duplicate(id, options = {}) {
			const record = await need(id);
			let info = record.world;
			if (!info) {
				// the Legacy world (or a world whose info lives only in its saves): take the newest save's
				const newest = (await savesOf(id))[0];
				const stored = newest ? await saves.get(newest.id) : undefined;
				info = stored ? parseGameSave(stored.data).sim.worldInfo : legacyWorldInfo(env.newSeed());
			}
			const copyId = env.newId();
			const world = duplicateWorldInfo(info, copyId, options.newSeed ? env.newSeed() : info.seed);
			const now = env.now();
			const copy: WorldRecord = {
				...record,
				id: copyId,
				name: await uniqueName(cleanName(options.name ?? '') || `${record.name} (copy)`),
				createdAt: now,
				lastPlayedAt: now,
				preset: world.preset,
				changelog: [],
				summary: emptySummary(),
				world
			};
			await worlds.put(copy);
			return copy;
		},
		async remove(id) {
			for (const meta of await savesOf(id)) await saves.delete(meta.id);
			await worlds.delete(id);
		},
		async touch(id) {
			let record = await get(id);
			if (!record) {
				if (id !== LEGACY_WORLD_ID) return;
				record = legacyWorldRecord(env.now(), [], emptySummary());
			}
			await worlds.put({ ...record, lastPlayedAt: env.now(), summary: await summaryOf(id) });
		},
		async startInfo(id) {
			// the Legacy world starts as the sim's default until the Space Center gave it buildings
			return (await get(id))?.world;
		},
		async setSites(id, sites) {
			let record = await get(id);
			if (!record) {
				if (id !== LEGACY_WORLD_ID) throw new Error(`no world ${id}`);
				record = legacyWorldRecord(env.now(), [], emptySummary());
			}
			const world = record.world ?? legacyWorldInfo(0);
			await worlds.put({ ...record, world: { ...world, sites: structuredClone(sites) } });
		},
		saves: savesOf
	};
}
