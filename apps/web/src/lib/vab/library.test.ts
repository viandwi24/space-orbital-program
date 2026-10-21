/** Plan 029 / ADR 0041: the vessel library over an in-memory store. */
import { loadPlugins, partId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyDesign, referenceTwoStage } from '../design';
import {
	deleteEntry,
	duplicateEntry,
	exportEntry,
	importText,
	listEntries,
	memoryStore,
	renameEntry,
	saveEntry,
	uniqueName,
	withFallback,
	type LibraryEnv,
	type LibraryStore
} from './library';

const { registries } = loadPlugins([Stock]);
const parts = registries.parts;

function env(): LibraryEnv {
	let t = 1000;
	let n = 0;
	return { now: () => (t += 10), newId: () => `id${++n}` };
}

describe('library', () => {
	it('saves, lists newest first, and updates a record in place', async () => {
		const store = memoryStore();
		const e = env();
		const a = await saveEntry(store, e, { kind: 'vessel', design: referenceTwoStage() });
		const b = await saveEntry(store, e, {
			kind: 'vessel',
			design: { ...referenceTwoStage(), name: 'B' },
			thumbnail: 'data:image/png;base64,AAAA'
		});
		expect((await listEntries(store, parts)).map((x) => x.record.id)).toEqual([b.id, a.id]);
		const again = await saveEntry(store, e, {
			id: a.id,
			kind: 'vessel',
			design: { ...referenceTwoStage(), name: 'A2' }
		});
		expect(again.id).toBe(a.id);
		expect(again.createdAt).toBe(a.createdAt);
		expect(again.updatedAt).toBeGreaterThan(b.updatedAt);
		expect((await store.list()).length).toBe(2);
		// The thumbnail survives an update without one.
		const kept = await saveEntry(store, e, {
			id: b.id,
			kind: 'vessel',
			design: referenceTwoStage()
		});
		expect(kept.thumbnail).toBe('data:image/png;base64,AAAA');
	});

	it('renames (design name too) and refuses blank or unknown', async () => {
		const store = memoryStore();
		const e = env();
		const a = await saveEntry(store, e, { kind: 'vessel', design: referenceTwoStage() });
		const r = await renameEntry(store, e, a.id, '  Lander  ');
		expect(r.name).toBe('Lander');
		const [entry] = await listEntries(store, parts);
		expect(entry!.ok && entry!.design.name).toBe('Lander');
		await expect(renameEntry(store, e, a.id, '   ')).rejects.toThrow(/empty/);
		await expect(renameEntry(store, e, 'nope', 'x')).rejects.toThrow(/no library entry/);
	});

	it('duplicates under a free name and deletes', async () => {
		const store = memoryStore();
		const e = env();
		const a = await saveEntry(store, e, { kind: 'vessel', design: referenceTwoStage() });
		const c1 = await duplicateEntry(store, e, a.id);
		const c2 = await duplicateEntry(store, e, a.id);
		expect([c1.name, c2.name]).toEqual(['Two-stage copy', 'Two-stage copy (2)']);
		expect(c1.id).not.toBe(a.id);
		expect((c1.design as { name: string }).name).toBe('Two-stage copy');
		await deleteEntry(store, c1.id);
		expect((await store.list()).map((r) => r.id).sort()).toEqual([a.id, c2.id].sort());
	});

	it('import: valid text is stored under a unique name; bad JSON, bad schema and unresolvable parts are refused and nothing is stored', async () => {
		const store = memoryStore();
		const e = env();
		const text = JSON.stringify(referenceTwoStage());
		const one = await importText(store, e, text, parts);
		const two = await importText(store, e, text, parts);
		expect(one.ok && two.ok && two.record.name).toBe('Two-stage (2)');
		expect((await importText(store, e, '{nope', parts)).ok).toBe(false);
		const schema = await importText(store, e, '{"formatVersion":2}', parts);
		expect(schema.ok).toBe(false);
		const missing = {
			...referenceTwoStage(),
			parts: [{ index: 0, part: partId('nobody.part'), parent: null }],
			stages: []
		};
		const bad = await importText(store, e, JSON.stringify(missing), parts);
		expect(bad.ok).toBe(false);
		expect((await store.list()).length).toBe(2);
	});

	it('imports a format-1 file upgraded to format 4', async () => {
		const store = memoryStore();
		const v1 = { ...referenceTwoStage(), formatVersion: 1 };
		const r = await importText(store, env(), JSON.stringify(v1), parts);
		expect(r.ok).toBe(true);
		if (r.ok) expect(r.design.formatVersion).toBe(4);
		const [entry] = await listEntries(store, parts);
		expect(entry!.ok && entry!.design.formatVersion).toBe(4);
	});

	it('exports a record to the text that imports back to the same design', async () => {
		const store = memoryStore();
		const e = env();
		const rec = await saveEntry(store, e, { kind: 'vessel', design: referenceTwoStage() });
		const { text, fileName } = exportEntry(rec);
		expect(fileName).toBe('Two-stage.json');
		const back = await importText(memoryStore(), e, text, parts);
		expect(back.ok && back.design).toEqual(referenceTwoStage());
	});

	it('a damaged record is listed with its errors and is never returned as a design', async () => {
		const store = memoryStore([
			{
				id: 'x',
				kind: 'vessel',
				name: 'Broken',
				design: {
					formatVersion: 2,
					name: 'Broken',
					parts: [{ index: 0, part: 'gone.part', parent: null }],
					stages: []
				},
				thumbnail: null,
				createdAt: 1,
				updatedAt: 1
			}
		]);
		const [entry] = await listEntries(store, parts);
		expect(entry!.ok).toBe(false);
		if (!entry!.ok) expect(entry!.errors.length).toBeGreaterThan(0);
	});

	it('kinds are separate lists', async () => {
		const store = memoryStore();
		const e = env();
		await saveEntry(store, e, { kind: 'vessel', design: referenceTwoStage() });
		await saveEntry(store, e, { kind: 'assembly', design: { ...emptyDesign('Pack'), parts: [] } });
		expect(await listEntries(store, parts, 'assembly')).toHaveLength(1);
		expect(await listEntries(store, parts, 'vessel')).toHaveLength(1);
	});

	it('falls back to memory when the primary store throws, and says so', async () => {
		const broken: LibraryStore = {
			list: () => Promise.reject(new Error('blocked')),
			put: () => Promise.reject(new Error('blocked')),
			delete: () => Promise.reject(new Error('blocked'))
		};
		const store = withFallback(broken);
		expect(store.degraded).toBe(false);
		await saveEntry(store, env(), { kind: 'vessel', design: referenceTwoStage() });
		expect(store.degraded).toBe(true);
		expect(await listEntries(store, parts)).toHaveLength(1);
	});

	it('uniqueName counts up and ignores case', () => {
		expect(uniqueName(['a', 'A (2)'], 'A')).toBe('A (3)');
		expect(uniqueName([], 'A')).toBe('A');
	});
});
