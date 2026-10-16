/**
 * Where saves live (ADR 0050 point 9, ADR 0041's pattern): a small interface the logic uses, an
 * in-memory store for tests and as the fallback, and `store-idb.ts` for the browser. The meta of a
 * save (name, summary, thumbnail) and its payload are separate records, so listing does not read
 * megabytes of simulation state.
 */
import type { SaveMeta } from './game-save';

/** A stored save: `meta` as written, `data` the whole `GameSave` as plain JSON (untrusted on read). */
export interface StoredSave {
	meta: SaveMeta;
	data: unknown;
}

export interface SaveStore {
	listMeta(): Promise<unknown[]>;
	get(id: string): Promise<StoredSave | undefined>;
	/** Writes meta and data together or neither; replaces a record with the same id. */
	put(save: StoredSave): Promise<void>;
	delete(id: string): Promise<void>;
}

export function memoryStore(initial: readonly StoredSave[] = []): SaveStore {
	const records = new Map(initial.map((r) => [r.meta.id, structuredClone(r)]));
	return {
		listMeta: async () => [...records.values()].map((r) => structuredClone(r.meta)),
		get: async (id) => {
			const r = records.get(id);
			return r ? structuredClone(r) : undefined;
		},
		put: async (save) => void records.set(save.meta.id, structuredClone(save)),
		delete: async (id) => void records.delete(id)
	};
}

/** Why a write did not happen, for the message shown to the player. */
export type WriteFailure = 'quota' | 'unavailable';

export class SaveWriteError extends Error {
	override readonly name = 'SaveWriteError';
	constructor(
		readonly reason: WriteFailure,
		message: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
	}
}

/** Classify what a storage backend threw. `QuotaExceededError` is a `DOMException` name. */
export function classifyWriteError(e: unknown): SaveWriteError {
	const name = typeof e === 'object' && e !== null && 'name' in e ? String(e.name) : '';
	if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
		return new SaveWriteError(
			'quota',
			'The browser has no room left for this save. Delete old saves or export them to files, then try again.',
			{ cause: e }
		);
	}
	return new SaveWriteError(
		'unavailable',
		'The browser would not store this save (private browsing, blocked storage or a full disk). Export it to a file to keep it.',
		{ cause: e }
	);
}
