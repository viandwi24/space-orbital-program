/** Plan 043 / ADR 0050: save list, quick/auto/named slots, autosave rotation, quota errors, files. */
import { SaveError, type SimSave } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { createRapierBackend } from '@orbital/physics';
import { createSim } from '@orbital/sim';
import { beforeAll, describe, expect, it } from 'vitest';
import { referenceTwoStage } from '../design';
import { compareMods, exportFileName, parseGameSaveText, resumeInfo } from './game-save';
import {
	AUTOSAVE_SLOTS,
	cleanName,
	createSaveManager,
	uniqueName,
	type SaveEnv,
	type SaveRequest
} from './saves';
import { classifyWriteError, memoryStore, SaveWriteError, type SaveStore } from './store';

let sim: SimSave;
let moved: SimSave;
let vesselId: number;
beforeAll(async () => {
	const s = await createSim({
		plugins: [Stock],
		backendFactory: () => createRapierBackend({ solverIterations: 16 }),
		maxFlightFrames: 1
	});
	const loaded = s.dispatch({ type: 'load-vessel', design: referenceTwoStage() });
	vesselId = Number(loaded.ok ? loaded.vessel : -1);
	for (let i = 0; i < 25; i++) s.step(0.02);
	sim = s.save();
	for (let i = 0; i < 25; i++) s.step(0.02);
	moved = s.save();
	s.dispose();
});

const request = (save: SimSave = sim): SaveRequest => ({
	sim: save,
	focus: vesselId,
	design: referenceTwoStage(),
	thumbnail: 'data:image/jpeg;base64,AAAA',
	bodyRadius: 600_000
});

let envs = 0;
function env(): SaveEnv & { tick(): void } {
	let t = 1000;
	let n = 0;
	const prefix = `e${++envs}`;
	return { now: () => t, newId: () => `${prefix}-id${++n}`, tick: () => void (t += 1000) };
}

function setup(store: SaveStore = memoryStore()) {
	const e = env();
	return { store, e, manager: createSaveManager(store, e) };
}

describe('names', () => {
	it('uniqueName numbers duplicates and cleanName trims and bounds', () => {
		expect(uniqueName('Flight', new Set())).toBe('Flight');
		expect(uniqueName('Flight', new Set(['Flight']))).toBe('Flight (2)');
		expect(uniqueName('Flight', new Set(['Flight', 'Flight (2)']))).toBe('Flight (3)');
		expect(cleanName('  a   b\n c ')).toBe('a b c');
		expect(cleanName('x'.repeat(100))).toHaveLength(48);
	});
	it('export file names are slugs', () => {
		expect(exportFileName('Quicksave')).toBe('quicksave.orbital-save.json');
		expect(exportFileName('Mün lander #2!')).toBe('m-n-lander-2.orbital-save.json');
		expect(exportFileName('???')).toBe('orbital-save.orbital-save.json');
	});
});

describe('quicksave and named saves', () => {
	it('quicksave keeps one slot and replaces it', async () => {
		const { manager, e } = setup();
		await manager.quicksave(request());
		e.tick();
		await manager.quicksave(request(moved));
		const list = await manager.list();
		expect(list).toHaveLength(1);
		const loaded = await manager.load('quick');
		expect(loaded.kind).toBe('quick');
		expect(loaded.sim.time).toBe(moved.time);
		expect(loaded.summary.vessel).toBe('Two-stage');
		expect(loaded.summary.mode).toBe('flight');
		expect(loaded.thumbnail).toMatch(/^data:image\/jpeg/);
	});

	it('named saves get unique names and list newest first', async () => {
		const { manager, e } = setup();
		await manager.saveAs('  Pad   test ', request());
		e.tick();
		const second = await manager.saveAs('Pad test', request(moved));
		expect(second.name).toBe('Pad test (2)');
		e.tick();
		await manager.quicksave(request());
		const names = (await manager.list()).flatMap((x) => (x.ok ? [x.meta.name] : []));
		expect(names).toEqual(['Quicksave', 'Pad test (2)', 'Pad test']);
	});

	it('rename and remove', async () => {
		const { manager } = setup();
		const a = await manager.saveAs('One', request());
		await manager.saveAs('Two', request());
		const renamed = await manager.rename(a.id, 'Two');
		expect(renamed.name).toBe('Two (2)');
		expect((await manager.load(a.id)).name).toBe('Two (2)');
		await expect(manager.rename(a.id, '   ')).rejects.toThrow(/needs a name/);
		await manager.remove(a.id);
		expect(await manager.list()).toHaveLength(1);
		await expect(manager.load(a.id)).rejects.toThrow(/no longer exists/);
	});
});

describe('autosave rotation', () => {
	it('fills the slots, then overwrites the oldest, so the newest three stay', async () => {
		const { manager, e } = setup();
		const times: number[] = [];
		for (let i = 0; i < AUTOSAVE_SLOTS + 2; i++) {
			e.tick();
			times.push((await manager.autosave(request(i % 2 ? moved : sim))).createdAt);
		}
		const list = await manager.list();
		expect(list).toHaveLength(AUTOSAVE_SLOTS);
		const kept = list.flatMap((x) => (x.ok ? [x.meta.createdAt] : [])).sort();
		expect(kept).toEqual(times.slice(-AUTOSAVE_SLOTS).sort());
		expect(list.every((x) => x.ok && x.meta.kind === 'auto')).toBe(true);
	});

	it('does not touch the quicksave or named saves', async () => {
		const { manager, e } = setup();
		await manager.quicksave(request());
		await manager.saveAs('Mine', request());
		for (let i = 0; i < 6; i++) {
			e.tick();
			await manager.autosave(request());
		}
		const kinds = (await manager.list()).flatMap((x) => (x.ok ? [x.meta.kind] : [])).sort();
		expect(kinds).toEqual(['auto', 'auto', 'auto', 'manual', 'quick']);
	});
});

/** A store whose writes fail like a full disk, once or always. */
function failingStore(inner: SaveStore, name: string, failures = Infinity) {
	let left = failures;
	return {
		...inner,
		put: async (save) => {
			if (left-- > 0) throw Object.assign(new Error('boom'), { name });
			return inner.put(save);
		}
	} satisfies SaveStore;
}

describe('write failures', () => {
	it('a full disk is reported as "quota" and the previous quicksave survives', async () => {
		const inner = memoryStore();
		const good = createSaveManager(inner, env());
		await good.quicksave(request());
		const full = createSaveManager(failingStore(inner, 'QuotaExceededError'), env());
		const error = await full.quicksave(request(moved)).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(SaveWriteError);
		expect((error as SaveWriteError).reason).toBe('quota');
		expect((error as SaveWriteError).message).toMatch(/no room left/);
		expect((await good.load('quick')).sim.time).toBe(sim.time); // the old one, intact
	});

	it('any other storage failure is "unavailable" and says to export', async () => {
		const m = createSaveManager(failingStore(memoryStore(), 'SecurityError'), env());
		await expect(m.saveAs('x', request())).rejects.toMatchObject({ reason: 'unavailable' });
		expect(classifyWriteError(new Error('?')).message).toMatch(/Export it to a file/);
	});

	it('a failing autosave does not consume a slot or break later ones', async () => {
		const inner = memoryStore();
		const flaky = createSaveManager(failingStore(inner, 'QuotaExceededError', 1), env());
		await expect(flaky.autosave(request())).rejects.toBeInstanceOf(SaveWriteError);
		await flaky.autosave(request());
		expect(await flaky.list()).toHaveLength(1);
	});
});

describe('damaged and foreign saves', () => {
	it('a record with broken meta is listed as damaged, not hidden or thrown', async () => {
		const store = memoryStore();
		const { manager } = setup(store);
		await manager.quicksave(request());
		await store.put({ meta: { id: 'junk', format: 'orbital-game-save' } as never, data: {} });
		const list = await manager.list();
		expect(list.filter((x) => !x.ok)).toHaveLength(1);
		const bad = list.find((x) => !x.ok)!;
		expect(bad.ok === false && bad.id).toBe('junk');
		expect(list.filter((x) => x.ok)).toHaveLength(1);
	});

	it('a record whose payload was cut is refused on load with a clear message', async () => {
		const store = memoryStore();
		const { manager } = setup(store);
		const meta = await manager.quicksave(request());
		const stored = (await store.get('quick'))!;
		const data = stored.data as { sim: { time: number } };
		data.sim.time = 99; // edited: the checksum no longer matches
		await store.put({ meta, data });
		await expect(manager.load('quick')).rejects.toThrow(/checksum/);
		await expect(manager.load('quick')).rejects.toBeInstanceOf(SaveError);
	});
});

describe('files', () => {
	it('export then import gives a new named save with the same simulation', async () => {
		const a = setup();
		const meta = await a.manager.saveAs('Orbit 1', request(moved));
		const { fileName, text } = await a.manager.exportText(meta.id);
		expect(fileName).toBe('orbit-1.orbital-save.json');
		const b = setup();
		const imported = await b.manager.importText(text);
		expect(imported.name).toBe('Orbit 1');
		expect(imported.kind).toBe('manual');
		expect(imported.id).not.toBe(meta.id);
		const again = await b.manager.importText(text);
		expect(again.name).toBe('Orbit 1 (2)');
		expect(JSON.stringify((await b.manager.load(imported.id)).sim)).toBe(JSON.stringify(moved));
	});

	it('an imported quick or auto save becomes a named one', async () => {
		const a = setup();
		await a.manager.quicksave(request());
		const { text } = await a.manager.exportText('quick');
		const b = setup();
		const imported = await b.manager.importText(text);
		expect(imported.kind).toBe('manual');
		expect(imported.id).not.toBe('quick');
	});

	it.each([
		['not JSON', '{"format": "orbital-game-s', 'not valid JSON'],
		[
			'another JSON file',
			JSON.stringify({ name: 'Two-stage', parts: [] }),
			'not a Space Orbital Program save'
		],
		['an empty file', '', 'not valid JSON'],
		[
			'a newer envelope',
			JSON.stringify({ format: 'orbital-game-save', formatVersion: 9 }),
			'newer version'
		]
	])(
		'importing %s is refused with a readable message and stores nothing',
		async (_n, text, message) => {
			const { manager } = setup();
			await expect(manager.importText(text)).rejects.toThrow(message);
			expect(await manager.list()).toHaveLength(0);
		}
	);

	it('a design file (a vessel, not a flight) is not mistaken for a save', () => {
		expect(() => parseGameSaveText(JSON.stringify(referenceTwoStage()))).toThrow(
			/not a Space Orbital Program save/
		);
	});
});

describe('resume info', () => {
	it('gives the HUD the design, the part-to-index map, stages fired and throttle', async () => {
		const { manager } = setup();
		const meta = await manager.quicksave(request());
		const info = resumeInfo(await manager.load(meta.id));
		expect(info.design.name).toBe('Two-stage');
		expect(info.focus).toBe(vesselId);
		expect(info.entityIndex.size).toBe(referenceTwoStage().parts.length);
		expect([...info.entityIndex.values()].sort((a, b) => a - b)).toEqual(
			referenceTwoStage().parts.map((p) => p.index)
		);
		expect(info.stagesFired).toBe(0);
		expect(info.throttle).toBe(0);
	});

	it('a save without a design is damaged', async () => {
		const store = memoryStore();
		const { manager } = setup(store);
		const meta = await manager.quicksave(request());
		const stored = (await store.get('quick'))!;
		const { design: _design, ...rest } = stored.data as Record<string, unknown>;
		await store.put({ meta, data: rest });
		await expect(manager.load('quick')).rejects.toThrow(/design/);
	});
});

describe('mods', () => {
	it('reports missing and changed plugins', () => {
		const report = compareMods(
			[
				{ id: 'stock', version: '0.1.0' },
				{ id: 'ghost', version: '1.0.0' },
				{ id: 'tweaks', version: '2.0.0' }
			],
			new Map([
				['stock', '0.1.0'],
				['tweaks', '2.1.0']
			])
		);
		expect(report.missing).toEqual([{ id: 'ghost', version: '1.0.0' }]);
		expect(report.changed).toEqual([{ id: 'tweaks', saved: '2.0.0', loaded: '2.1.0' }]);
	});

	it('a retired built-in (trajectories, plan 372) is not missing', () => {
		const report = compareMods(
			[
				{ id: 'stock', version: '0.1.0' },
				{ id: 'trajectories', version: '1.1.0' }
			],
			new Map([['stock', '0.1.0']])
		);
		expect(report.missing).toEqual([]);
	});
});

describe('slots per world (plan 087, ADR 0143)', () => {
	it('a world has its own quick and autosave slots; the Legacy world keeps the plain ids', async () => {
		const { manager, e } = setup();
		const other: SimSave = { ...sim, worldInfo: { ...sim.worldInfo, id: 'w-9' } };
		const legacy = await manager.quicksave(request());
		const mine = await manager.quicksave(request(other));
		expect([legacy.id, mine.id]).toEqual(['quick', 'w-9:quick']);
		const auto = await manager.autosave(request(other));
		e.tick();
		const auto2 = await manager.autosave(request(other));
		const legacyAuto = await manager.autosave(request());
		expect([auto.id, auto2.id, legacyAuto.id]).toEqual(['w-9:auto-1', 'w-9:auto-2', 'auto-1']);
		expect(mine.worldId).toBe('w-9');
	});
});
