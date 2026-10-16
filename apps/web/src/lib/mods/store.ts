/**
 * Where installed mods live (plan 046, ADR 0057): one record per mod id, in IndexedDB database
 * `orbital-mods` (its own database, like the saves'), behind a small interface so tests and a
 * browser without IndexedDB use memory.
 */
import type { ModManifest } from '@orbital/core';

/** Where a package came from, shown in the trust prompt and the list. */
export type ModSource = { kind: 'file'; name: string } | { kind: 'url'; url: string };

export interface ModRecord {
	/** The plugin id (one record per id; installing again replaces it). */
	id: string;
	manifest: ModManifest;
	code: string;
	/** Hex SHA-256 of `code`, computed at install. */
	sha256: string;
	/** The fingerprint the player trusted. Differs from `sha256` only if the record was tampered with. */
	trusted: string;
	source: ModSource;
	installedAt: number;
	enabled: boolean;
	/** Install order, 0 first: the order mods boot in. */
	order: number;
}

export interface ModStore {
	list(): Promise<ModRecord[]>;
	put(record: ModRecord): Promise<void>;
	delete(id: string): Promise<void>;
}

export class ModStoreError extends Error {
	constructor(
		message: string,
		readonly code: 'quota' | 'unavailable'
	) {
		super(message);
		this.name = 'ModStoreError';
	}
}

export function memoryModStore(): ModStore {
	const records = new Map<string, ModRecord>();
	return {
		list: async () => [...records.values()].sort((a, b) => a.order - b.order),
		put: async (record) => void records.set(record.id, structuredClone(record)),
		delete: async (id) => void records.delete(id)
	};
}
