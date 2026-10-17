/** Worlds storage (plan 087, ADR 0143): create, rename, duplicate, delete with its saves, touch. */
import { LEGACY_WORLD_ID, loadPlugins, readSimSave, type WorldInfo } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import fixtureV4 from '../../../../../packages/sim/test/fixtures/save-v4.json';
import { referenceTwoStage } from '../design';
import { buildGameSave } from '../save/game-save';
import { memoryStore, type SaveStore } from '../save/store';
import { memoryWorldStore } from '../save/world-store';
import { createWorldInfo } from './world-model';
import { createWorlds, type WorldsEnv } from './worlds';

const { registries } = loadPlugins([Stock]);
const catalog = { rules: registries.rules.list(), presets: registries.presets.list() };

function env(): WorldsEnv {
	let t = 1_000;
	let id = 0;
	return { now: () => (t += 1000), newId: () => `w-${++id}`, newSeed: () => 77 };
}

function career(id: string): WorldInfo {
	const r = createWorldInfo(
		{
			id,
			seed: 5,
			preset: 'stock.career',
			rules: {},
			start: { kind: 'day-one' },
			gravityModel: 'patched',
			systemId: 'stock',
			systemVersion: '1.0.0',
			variant: 'default'
		},
		catalog,
		{ kind: 'fictional', home: 'stock.home', dayLength: 21_600, yearLength: null },
		0
	);
	if (!r.ok) throw new Error(r.reason);
	return r.world;
}

/** A save of `worldId` written as the save manager writes it. */
async function putSave(store: SaveStore, id: string, worldId: string, createdAt: number) {
	const sim = readSimSave(fixtureV4);
	const save = buildGameSave({
		id,
		name: id,
		kind: 'manual',
		createdAt,
		sim: { ...sim, worldInfo: { ...sim.worldInfo, id: worldId } },
		focus: null,
		design: referenceTwoStage(),
		thumbnail: null,
		bodyRadius: 600_000
	});
	const { sim: _s, focus: _f, ...meta } = save;
	await store.put({ meta, data: save });
}

describe('worlds', () => {
	it('create lists the new world first, with its info; names stay unique', async () => {
		const w = createWorlds(memoryWorldStore(), memoryStore(), env());
		await w.create(career('a'), 'Moon program', []);
		const b = await w.create(career('b'), 'Moon program', []);
		expect(b.name).toBe('Moon program (2)');
		const list = await w.list();
		expect(list.map((e) => (e.ok ? e.record.id : '?'))).toEqual(['b', 'a']);
		expect(await w.startInfo('a')).toEqual(career('a'));
		expect(await w.startInfo(LEGACY_WORLD_ID)).toBeUndefined();
	});

	it('rename keeps the id; an empty name is refused', async () => {
		const w = createWorlds(memoryWorldStore(), memoryStore(), env());
		await w.create(career('a'), 'One', []);
		expect((await w.rename('a', '  Two  ')).name).toBe('Two');
		await expect(w.rename('a', '   ')).rejects.toThrow('A world needs a name.');
	});

	it('duplicate: new id, same rules and start, optionally a new seed, no saves', async () => {
		const saves = memoryStore();
		const w = createWorlds(memoryWorldStore(), saves, env());
		await w.create(career('a'), 'Base', []);
		await putSave(saves, 's1', 'a', 5);
		const copy = await w.duplicate('a', { newSeed: true });
		expect(copy.id).toBe('w-1');
		expect(copy.name).toBe('Base (copy)');
		expect(copy.world!.rules).toEqual(career('a').rules);
		expect(copy.world!.seed).toBe(77);
		expect(copy.world!.id).toBe('w-1');
		expect(await w.saves('w-1')).toEqual([]);
		expect((await w.duplicate('a', { name: 'Twin' })).world!.seed).toBe(5);
	});

	it('delete removes the world and only its saves', async () => {
		const saves = memoryStore();
		const w = createWorlds(memoryWorldStore(), saves, env());
		await w.create(career('a'), 'A', []);
		await w.create(career('b'), 'B', []);
		await putSave(saves, 's1', 'a', 1);
		await putSave(saves, 's2', 'a', 2);
		await putSave(saves, 's3', 'b', 3);
		await w.remove('a');
		expect(await w.get('a')).toBeUndefined();
		expect((await saves.listMeta()).map((m) => (m as { id: string }).id)).toEqual(['s3']);
	});

	it('touch moves a world to the top and counts its saves; it creates the Legacy record on first use', async () => {
		const saves = memoryStore();
		const w = createWorlds(memoryWorldStore(), saves, env());
		await w.create(career('a'), 'A', []);
		await w.create(career('b'), 'B', []);
		await putSave(saves, 's1', 'a', 9);
		await w.touch('a');
		const [first] = await w.list();
		expect(first!.ok && first!.record.id).toBe('a');
		expect(first!.ok && first!.record.summary.saves).toBe(1);
		await w.touch(LEGACY_WORLD_ID);
		expect((await w.get(LEGACY_WORLD_ID))?.name).toBe('Legacy world');
	});
});
