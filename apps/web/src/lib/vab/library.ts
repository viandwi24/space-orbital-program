/**
 * The vessel library (ADR 0041): named designs and sub-assemblies as records in a `LibraryStore`.
 * Everything here is pure logic over the store interface, so it is tested with an in-memory
 * store; `library-idb.ts` is the browser adapter. Records come back from storage untrusted: each
 * one is validated with the design pipeline (schema, format-1 upgrade, resolve) on load.
 */
import type { PartLookup, VesselDesign } from '@orbital/core';
import { serialiseDesign, validateDesign } from '../design';

export type LibraryKind = 'vessel' | 'assembly';

/** What is stored. `design` is plain JSON (format 2 once saved by this code, any version when imported). */
export interface StoredRecord {
	id: string;
	kind: LibraryKind;
	name: string;
	design: unknown;
	/** PNG data URL of the 3D view, or null. */
	thumbnail: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface LibraryStore {
	list(): Promise<StoredRecord[]>;
	put(record: StoredRecord): Promise<void>;
	delete(id: string): Promise<void>;
}

export type LibraryEntry =
	| { ok: true; record: StoredRecord; design: VesselDesign }
	| { ok: false; record: StoredRecord; errors: string[] };

export interface LibraryEnv {
	now(): number;
	newId(): string;
}

export const browserEnv = (): LibraryEnv => ({
	now: () => Date.now(),
	newId: () => crypto.randomUUID()
});

/** A store in memory: the test double and the fallback when IndexedDB is unavailable. */
export function memoryStore(initial: readonly StoredRecord[] = []): LibraryStore {
	const records = new Map(initial.map((r) => [r.id, structuredClone(r)]));
	return {
		list: async () => [...records.values()].map((r) => structuredClone(r)),
		put: async (r) => void records.set(r.id, structuredClone(r)),
		delete: async (id) => void records.delete(id)
	};
}

/**
 * `primary` with a fallback: when it throws once, every call goes to `fallback` and `degraded`
 * turns true (the UI then says the library is not kept on this device).
 */
export function withFallback(
	primary: LibraryStore,
	fallback: LibraryStore = memoryStore()
): LibraryStore & { readonly degraded: boolean } {
	let degraded = false;
	const run = async <T>(op: (s: LibraryStore) => Promise<T>): Promise<T> => {
		if (!degraded) {
			try {
				return await op(primary);
			} catch {
				degraded = true;
			}
		}
		return op(fallback);
	};
	return {
		get degraded() {
			return degraded;
		},
		list: () => run((s) => s.list()),
		put: (r) => run((s) => s.put(r)),
		delete: (id) => run((s) => s.delete(id))
	};
}

/** `base`, or `base (2)`, `base (3)` ... when the name is taken (case-insensitive). */
export function uniqueName(taken: Iterable<string>, base: string): string {
	const names = new Set([...taken].map((n) => n.toLowerCase()));
	if (!names.has(base.toLowerCase())) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base} (${n})`;
		if (!names.has(candidate.toLowerCase())) return candidate;
	}
}

/** Entries of one kind, newest first; damaged records are listed with their errors. */
export async function listEntries(
	store: LibraryStore,
	parts: PartLookup,
	kind?: LibraryKind
): Promise<LibraryEntry[]> {
	const records = await store.list();
	return records
		.filter((r) => kind === undefined || r.kind === kind)
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.map((record): LibraryEntry => {
			const parsed = validateDesign(record.design, parts);
			return parsed.ok
				? { ok: true, record, design: parsed.design }
				: { ok: false, record, errors: parsed.errors };
		});
}

/** Creates or updates the record `id` (a new one without it). The record keeps its creation time and thumbnail unless a new one is given. */
export async function saveEntry(
	store: LibraryStore,
	env: LibraryEnv,
	input: {
		id?: string | null;
		kind: LibraryKind;
		design: VesselDesign;
		thumbnail?: string | null;
	}
): Promise<StoredRecord> {
	const existing = input.id ? (await store.list()).find((r) => r.id === input.id) : undefined;
	const now = env.now();
	const record: StoredRecord = {
		id: existing?.id ?? env.newId(),
		kind: input.kind,
		name: input.design.name,
		design: JSON.parse(serialiseDesign(input.design)) as unknown,
		thumbnail: input.thumbnail === undefined ? (existing?.thumbnail ?? null) : input.thumbnail,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};
	await store.put(record);
	return record;
}

/** Renames a record (the design's own name changes with it). Blank names are refused. */
export async function renameEntry(
	store: LibraryStore,
	env: LibraryEnv,
	id: string,
	name: string
): Promise<StoredRecord> {
	const record = (await store.list()).find((r) => r.id === id);
	const trimmed = name.trim();
	if (!record) throw new Error(`no library entry ${id}`);
	if (trimmed === '') throw new Error('a name cannot be empty');
	const design =
		typeof record.design === 'object' && record.design !== null
			? { ...(record.design as Record<string, unknown>), name: trimmed }
			: record.design;
	const next = { ...record, name: trimmed, design, updatedAt: env.now() };
	await store.put(next);
	return next;
}

/** A copy of a record under a free name ("X copy"). */
export async function duplicateEntry(
	store: LibraryStore,
	env: LibraryEnv,
	id: string
): Promise<StoredRecord> {
	const all = await store.list();
	const record = all.find((r) => r.id === id);
	if (!record) throw new Error(`no library entry ${id}`);
	const name = uniqueName(
		all.filter((r) => r.kind === record.kind).map((r) => r.name),
		`${record.name} copy`
	);
	const now = env.now();
	const design =
		typeof record.design === 'object' && record.design !== null
			? { ...(structuredClone(record.design) as Record<string, unknown>), name }
			: record.design;
	const copy: StoredRecord = {
		...record,
		id: env.newId(),
		name,
		design,
		createdAt: now,
		updatedAt: now
	};
	await store.put(copy);
	return copy;
}

export async function deleteEntry(store: LibraryStore, id: string): Promise<void> {
	await store.delete(id);
}

export type ImportResult =
	{ ok: true; record: StoredRecord; design: VesselDesign } | { ok: false; errors: string[] };

/** Validates the text of an exported design and stores it under a free name. Nothing is stored on failure. */
export async function importText(
	store: LibraryStore,
	env: LibraryEnv,
	text: string,
	parts: PartLookup,
	kind: LibraryKind = 'vessel'
): Promise<ImportResult> {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch (error) {
		return { ok: false, errors: [`not valid JSON: ${(error as Error).message}`] };
	}
	const parsed = validateDesign(raw, parts);
	if (!parsed.ok) return parsed;
	const taken = (await store.list()).filter((r) => r.kind === kind).map((r) => r.name);
	const design = { ...parsed.design, name: uniqueName(taken, parsed.design.name) };
	const record = await saveEntry(store, env, { kind, design });
	return { ok: true, record, design };
}

/** The file text and a file name for a record. */
export function exportEntry(record: Pick<StoredRecord, 'name' | 'design'>): {
	text: string;
	fileName: string;
} {
	return {
		text: JSON.stringify(record.design, null, 2),
		fileName: `${record.name.replace(/[^\w-]+/g, '_') || 'vessel'}.json`
	};
}
