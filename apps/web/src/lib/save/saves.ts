/**
 * The save manager (plan 043): quicksave, rotating autosaves, named saves, rename, delete, file
 * export and import, over a `SaveStore`. Pure logic with an injected clock and id source, so it is
 * tested with the in-memory store. A failed write leaves every earlier save as it was (the store
 * writes a record atomically), and is reported as a `SaveWriteError` the page shows.
 */
import { SaveError, type SimSave, type VesselDesign } from '@orbital/core';
import {
	buildGameSave,
	exportFileName,
	parseGameSave,
	parseGameSaveText,
	parseMeta,
	type GameSave,
	type SaveKind,
	type SaveMeta
} from './game-save';
import { classifyWriteError, SaveWriteError, type SaveStore } from './store';

export const QUICK_ID = 'quick';
export const AUTO_PREFIX = 'auto-';
/** How many autosaves are kept; the oldest is overwritten. */
export const AUTOSAVE_SLOTS = 3;
export const MAX_NAME_LENGTH = 48;

export interface SaveEnv {
	now(): number;
	newId(): string;
}

export const browserSaveEnv = (): SaveEnv => ({
	now: () => Date.now(),
	newId: () => crypto.randomUUID()
});

/** What the page hands over when it saves: the sim's data and the client-side extras. */
export interface SaveRequest {
	sim: SimSave;
	focus: number | null;
	design: VesselDesign;
	thumbnail: string | null;
	/** Radius of the body being simulated, m (for the altitude in the summary). */
	bodyRadius: number;
}

export type SaveListEntry = { ok: true; meta: SaveMeta } | { ok: false; id: string; error: string };

export interface SaveManager {
	list(): Promise<SaveListEntry[]>;
	quicksave(request: SaveRequest): Promise<SaveMeta>;
	autosave(request: SaveRequest): Promise<SaveMeta>;
	saveAs(name: string, request: SaveRequest): Promise<SaveMeta>;
	/** Read and fully validate one save; throws `SaveError` with a readable message. */
	load(id: string): Promise<GameSave>;
	rename(id: string, name: string): Promise<SaveMeta>;
	remove(id: string): Promise<void>;
	exportText(id: string): Promise<{ fileName: string; text: string }>;
	/** Validate the text of a save file and keep it as a new named save. */
	importText(text: string): Promise<SaveMeta>;
}

/** `base`, or `base (2)`, `base (3)` ... the first name not in `taken`. */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
	if (!taken.has(base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base} (${n})`;
		if (!taken.has(candidate)) return candidate;
	}
}

export function cleanName(name: string): string {
	return name.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
}

export function createSaveManager(store: SaveStore, env: SaveEnv): SaveManager {
	async function write(save: GameSave): Promise<SaveMeta> {
		const { sim: _sim, focus: _focus, ...meta } = save;
		try {
			await store.put({ meta, data: save });
		} catch (e) {
			throw e instanceof SaveWriteError ? e : classifyWriteError(e);
		}
		return meta;
	}

	async function entries(): Promise<SaveListEntry[]> {
		const out: SaveListEntry[] = [];
		for (const raw of await store.listMeta()) {
			try {
				out.push({ ok: true, meta: parseMeta(raw) });
			} catch (e) {
				const id = typeof raw === 'object' && raw !== null && 'id' in raw ? String(raw.id) : '?';
				out.push({ ok: false, id, error: e instanceof Error ? e.message : String(e) });
			}
		}
		return out.sort((a, b) => time(b) - time(a));
	}
	const time = (e: SaveListEntry): number => (e.ok ? e.meta.createdAt : 0);

	const build = (id: string, name: string, kind: SaveKind, request: SaveRequest): GameSave =>
		buildGameSave({
			id,
			name,
			kind,
			createdAt: env.now(),
			sim: request.sim,
			focus: request.focus,
			design: request.design,
			thumbnail: request.thumbnail,
			bodyRadius: request.bodyRadius
		});

	const namesTaken = async (except?: string): Promise<Set<string>> =>
		new Set((await entries()).flatMap((e) => (e.ok && e.meta.id !== except ? [e.meta.name] : [])));

	async function readSave(id: string): Promise<GameSave> {
		const stored = await store.get(id);
		if (!stored) throw new SaveError('not-a-save', 'That save no longer exists.');
		return parseGameSave(stored.data);
	}

	return {
		list: entries,

		quicksave: (request) => write(build(QUICK_ID, 'Quicksave', 'quick', request)),

		async autosave(request) {
			const autos = (await entries()).flatMap((e) =>
				e.ok && e.meta.id.startsWith(AUTO_PREFIX) ? [e.meta] : []
			);
			const used = new Set(autos.map((m) => m.id));
			let slot: string | undefined;
			for (let n = 1; n <= AUTOSAVE_SLOTS && !slot; n++) {
				if (!used.has(`${AUTO_PREFIX}${n}`)) slot = `${AUTO_PREFIX}${n}`;
			}
			// All slots taken: the oldest one is overwritten, so the newest AUTOSAVE_SLOTS stay.
			slot ??= [...autos].sort((a, b) => a.createdAt - b.createdAt)[0]!.id;
			return write(build(slot, 'Autosave', 'auto', request));
		},

		async saveAs(name, request) {
			const base = cleanName(name) || 'Saved flight';
			const unique = uniqueName(base, await namesTaken());
			return write(build(env.newId(), unique, 'manual', request));
		},

		load: readSave,

		async rename(id, name) {
			const save = await readSave(id);
			const base = cleanName(name);
			if (base === '') throw new SaveError('damaged', 'A save needs a name.');
			const renamed: GameSave = { ...save, name: uniqueName(base, await namesTaken(id)) };
			return write(renamed);
		},

		async remove(id) {
			try {
				await store.delete(id);
			} catch (e) {
				throw classifyWriteError(e);
			}
		},

		async exportText(id) {
			const save = await readSave(id);
			return { fileName: exportFileName(save.name), text: JSON.stringify(save) };
		},

		async importText(text) {
			const save = parseGameSaveText(text);
			const name = uniqueName(cleanName(save.name) || 'Imported flight', await namesTaken());
			return write({ ...save, id: env.newId(), name, kind: 'manual', createdAt: env.now() });
		}
	};
}
