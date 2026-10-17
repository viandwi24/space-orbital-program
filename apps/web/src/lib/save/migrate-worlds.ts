/**
 * One-time client migration (plan 077, ADRs 0094 point 6 and 0110 point 5): every stored save
 * without a world is attached to the Legacy world, which is created the first time. The world is
 * written before any save names it, and a save already attached is left alone, so the migration can
 * stop at any point and run again: a second run changes nothing.
 */
import { LEGACY_WORLD_ID, type SaveMod } from '@orbital/core';
import { parseMeta, type SaveMeta } from './game-save';
import type { SaveStore } from './store';
import { legacyWorldRecord } from './world-record';
import type { WorldStore } from './world-store';

export interface WorldMigration {
	/** Saves attached to the Legacy world by this run. */
	attached: number;
	/** Whether this run created the Legacy world record. */
	created: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === 'object' && v !== null && !Array.isArray(v);

export async function migrateLegacySaves(
	saves: SaveStore,
	worlds: WorldStore,
	now: () => number
): Promise<WorldMigration> {
	const unassigned: SaveMeta[] = [];
	for (const raw of await saves.listMeta()) {
		try {
			const meta = parseMeta(raw);
			if (meta.worldId === null) unassigned.push(meta);
		} catch {
			// An unreadable save stays where it is; the load dialog lists it with its error.
		}
	}
	if (unassigned.length === 0) return { attached: 0, created: false };

	let created = false;
	if ((await worlds.get(LEGACY_WORLD_ID)) === undefined) {
		const newest = [...unassigned].sort((a, b) => b.createdAt - a.createdAt)[0]!;
		const mods = new Map<string, SaveMod>();
		for (const meta of unassigned)
			for (const m of meta.mods) if (!mods.has(m.id)) mods.set(m.id, m);
		await worlds.put(
			legacyWorldRecord(
				now(),
				[...mods.values()].sort((a, b) => a.id.localeCompare(b.id)),
				{ saves: unassigned.length, vessel: newest.summary.vessel, simTime: newest.summary.simTime }
			)
		);
		created = true;
	}

	let attached = 0;
	for (const { id } of unassigned) {
		const stored = await saves.get(id);
		if (!stored) continue;
		const data = isRecord(stored.data) ? { ...stored.data, worldId: LEGACY_WORLD_ID } : stored.data;
		await saves.put({ meta: { ...stored.meta, worldId: LEGACY_WORLD_ID }, data });
		attached++;
	}
	return { attached, created };
}
