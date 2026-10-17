/** Plan 077 / ADR 0110: old saves in IndexedDB are attached to one Legacy world, once. */
import 'fake-indexeddb/auto';
import { LEGACY_WORLD_ID, readSimSave } from '@orbital/core';
import { afterEach, describe, expect, it } from 'vitest';
import fixtureV4 from '../../../../../packages/sim/test/fixtures/save-v4.json';
import { referenceTwoStage } from '../design';
import { buildGameSave, type GameSave } from './game-save';
import { migrateLegacySaves } from './migrate-worlds';
import { openSaveStore } from './open-store';
import { createSaveManager } from './saves';
import { closeSaveDb, SAVE_DB } from './store-idb';
import { LEGACY_WORLD_NAME, parseWorldRecord } from './world-record';

/** A save as a build before plan 077 stored it: envelope version 1, no world, a format-4 sim. */
function oldSave(id: string, name: string, createdAt: number): Record<string, unknown> {
	const current = buildGameSave({
		id,
		name,
		kind: 'manual',
		createdAt,
		sim: readSimSave(fixtureV4),
		focus: null,
		design: referenceTwoStage(),
		thumbnail: null,
		bodyRadius: 600_000
	});
	const { worldId: _w, sim: _s, ...rest } = current as GameSave & Record<string, unknown>;
	return { ...rest, formatVersion: 1, sim: fixtureV4 };
}

const request = <T>(r: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		r.onsuccess = () => resolve(r.result);
		r.onerror = () => reject(r.error);
	});

/** Write records into a version 1 database, exactly as the old `store-idb.ts` laid it out. */
async function seedVersion1(saves: Record<string, unknown>[]): Promise<void> {
	const open = indexedDB.open(SAVE_DB, 1);
	open.onupgradeneeded = () => {
		open.result.createObjectStore('meta', { keyPath: 'id' });
		open.result.createObjectStore('data');
	};
	const db = await request(open);
	const tx = db.transaction(['meta', 'data'], 'readwrite');
	for (const save of saves) {
		const { sim: _sim, focus: _focus, design: _design, ...meta } = save;
		tx.objectStore('meta').put(meta);
		tx.objectStore('data').put(save, save.id as string);
	}
	await new Promise<void>((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
	db.close();
}

afterEach(async () => {
	await closeSaveDb();
	await request(indexedDB.deleteDatabase(SAVE_DB));
});

describe('migrateLegacySaves on IndexedDB', () => {
	it('creates exactly one Legacy world owning both old saves, and a second run changes nothing', async () => {
		await seedVersion1([oldSave('a', 'First flight', 1_000), oldSave('b', 'Second flight', 2_000)]);

		// Opening upgrades the database to version 2 and runs the migration.
		const { store, worlds, volatile } = await openSaveStore();
		expect(volatile).toBe(false);
		const records = (await worlds.list()).map(parseWorldRecord);
		expect(records).toHaveLength(1);
		const legacy = records[0]!;
		expect(legacy.id).toBe(LEGACY_WORLD_ID);
		expect(legacy.name).toBe(LEGACY_WORLD_NAME);
		expect(legacy.preset).toBe('sandbox');
		expect(legacy.changelog).toEqual([]);
		expect(legacy.summary.saves).toBe(2);
		expect(legacy.mods.map((m) => m.id)).toEqual(['stock']);

		const metas = (await store.listMeta()) as Array<{ id: string; worldId: unknown }>;
		expect(metas.map((m) => [m.id, m.worldId]).sort()).toEqual([
			['a', LEGACY_WORLD_ID],
			['b', LEGACY_WORLD_ID]
		]);
		// The full save loads, owned by the world its migrated sim names.
		const manager = createSaveManager(store, { now: () => 3_000, newId: () => 'n1' });
		const loaded = await manager.load('a');
		expect(loaded.worldId).toBe(LEGACY_WORLD_ID);
		expect(loaded.sim.formatVersion).toBe(5);
		expect(loaded.sim.worldInfo.id).toBe(loaded.worldId);

		const before = { worlds: await worlds.list(), saves: await store.listMeta() };
		expect(await migrateLegacySaves(store, worlds, () => 9_999)).toEqual({
			attached: 0,
			created: false
		});
		await closeSaveDb();
		const again = await openSaveStore(); // a reload runs it once more
		expect(await again.worlds.list()).toEqual(before.worlds);
		expect(await again.store.listMeta()).toEqual(before.saves);
	});

	it('finishes an interrupted run without a second world', async () => {
		await seedVersion1([oldSave('a', 'First flight', 1_000), oldSave('b', 'Second flight', 2_000)]);
		const { store, worlds } = await openSaveStore();
		// Pretend the first run stopped after the world and one save: detach the other again.
		const b = (await store.get('b'))!;
		const { worldId: _m, ...meta } = b.meta;
		await store.put({ meta: meta as never, data: { ...(b.data as object), worldId: undefined } });
		expect(await migrateLegacySaves(store, worlds, () => 5_000)).toEqual({
			attached: 1,
			created: false
		});
		expect(await worlds.list()).toHaveLength(1);
	});

	it('an empty store creates no world', async () => {
		const { worlds } = await openSaveStore();
		expect(await worlds.list()).toEqual([]);
	});
});
