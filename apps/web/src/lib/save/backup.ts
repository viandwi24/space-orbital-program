/**
 * Save safety (plan 230, ADR 0230): every world and save in one backup file and back, and when to
 * remind the player to make one. Pure over the stores and an injected clock, so the tests run the
 * same code as the page.
 */
import { parseWorldRecord, type WorldRecord } from './world-record';
import type { SaveStore, StoredSave } from './store';
import type { WorldStore } from './world-store';

/** A world record, or null for one that does not parse. */
function recordOf(raw: unknown): WorldRecord | null {
	try {
		return parseWorldRecord(raw);
	} catch {
		return null;
	}
}

export const BACKUP_FORMAT = 'orbital-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
	format: typeof BACKUP_FORMAT;
	version: number;
	/** Wall clock of the export, ms. */
	exportedAt: number;
	worlds: WorldRecord[];
	saves: StoredSave[];
}

/** Every listed world and every save, lesson worlds left out. */
export async function exportBackup(
	store: SaveStore,
	worlds: WorldStore,
	now: number
): Promise<Backup> {
	const records = (await worlds.list())
		.map(recordOf)
		.flatMap((r) => (r && r.lesson === undefined ? [r] : []));
	const keep = new Set(records.map((r) => r.id));
	const saves: StoredSave[] = [];
	for (const raw of await store.listMeta()) {
		const id = (raw as { id?: unknown }).id;
		const world = (raw as { worldId?: unknown }).worldId;
		if (typeof id !== 'string') continue;
		if (typeof world === 'string' && !keep.has(world)) continue;
		const save = await store.get(id);
		if (save) saves.push(save);
	}
	return {
		format: BACKUP_FORMAT,
		version: BACKUP_VERSION,
		exportedAt: now,
		worlds: records,
		saves
	};
}

/** The backup's file name: `orbital-backup-2026-10-20.json`. */
export const backupFileName = (now: number): string =>
	`orbital-backup-${new Date(now).toISOString().slice(0, 10)}.json`;

/**
 * Put a backup's worlds and saves into the stores. A world or save that already exists (same id)
 * is kept as it is, so importing twice changes nothing. Throws with a message for a file that is
 * not a backup.
 */
export async function importBackup(
	text: string,
	store: SaveStore,
	worlds: WorldStore
): Promise<{ worlds: number; saves: number }> {
	let data: unknown;
	try {
		data = JSON.parse(text);
	} catch {
		throw new Error('This file is not a backup: it is not JSON.');
	}
	const b = data as Partial<Backup>;
	if (b?.format !== BACKUP_FORMAT || !Array.isArray(b.worlds) || !Array.isArray(b.saves))
		throw new Error('This file is not a Space Orbital Program backup.');
	if ((b.version ?? 0) > BACKUP_VERSION)
		throw new Error('This backup comes from a newer version of the game.');
	const haveWorlds = new Set(
		(await worlds.list())
			.map((r) => (r as { id?: unknown }).id)
			.filter((id) => typeof id === 'string')
	);
	const haveSaves = new Set(
		(await store.listMeta())
			.map((m) => (m as { id?: unknown }).id)
			.filter((id) => typeof id === 'string')
	);
	let w = 0;
	let s = 0;
	for (const raw of b.worlds) {
		const record = recordOf(raw);
		if (!record || haveWorlds.has(record.id)) continue;
		await worlds.put(record);
		w++;
	}
	for (const save of b.saves) {
		const id = (save?.meta as { id?: unknown } | undefined)?.id;
		if (typeof id !== 'string' || haveSaves.has(id) || save.data === undefined) continue;
		await store.put(save);
		s++;
	}
	return { worlds: w, saves: s };
}

/** The reminder's state, kept in this browser. */
export interface BackupReminder {
	/** Play time in worlds so far, ms. */
	playedMs: number;
	lastExportAt: number | null;
	snoozeUntil: number | null;
}

export const FIRST_PROMPT_AFTER_MS = 60 * 60 * 1000;
export const PROMPT_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** The export prompt is due: after the first hour of play, then every 7 days; "later" waits a day. */
export function exportPromptDue(r: BackupReminder, now: number): boolean {
	if (r.playedMs < FIRST_PROMPT_AFTER_MS) return false;
	if (r.snoozeUntil !== null && now < r.snoozeUntil) return false;
	return r.lastExportAt === null || now - r.lastExportAt >= PROMPT_EVERY_MS;
}

export const remindLater = (r: BackupReminder, now: number): BackupReminder => ({
	...r,
	snoozeUntil: now + SNOOZE_MS
});
export const exported = (r: BackupReminder, now: number): BackupReminder => ({
	...r,
	lastExportAt: now,
	snoozeUntil: null
});
