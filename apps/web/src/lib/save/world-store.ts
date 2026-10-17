/**
 * Where world records live (plan 077, ADR 0110): the interface the logic uses and an in-memory
 * store for tests and as the fallback; `store-idb.ts` keeps them in the `worlds` object store.
 */
import type { WorldRecord } from './world-record';

export interface WorldStore {
	/** Every record as stored (untrusted; `parseWorldRecord` before use). */
	list(): Promise<unknown[]>;
	get(id: string): Promise<unknown>;
	/** Replaces a record with the same id. */
	put(record: WorldRecord): Promise<void>;
	delete(id: string): Promise<void>;
}

export function memoryWorldStore(initial: readonly WorldRecord[] = []): WorldStore {
	const records = new Map(initial.map((r) => [r.id, structuredClone(r)]));
	return {
		list: async () => [...records.values()].map((r) => structuredClone(r)),
		get: async (id) => structuredClone(records.get(id)),
		put: async (record) => void records.set(record.id, structuredClone(record)),
		delete: async (id) => void records.delete(id)
	};
}
