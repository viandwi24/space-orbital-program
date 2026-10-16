import { describe, expect, it } from 'vitest';
import { ModManager, fetchPackageText, type ModManagerOptions } from './manager.svelte';
import { packageText, recordOf } from './fixtures';
import { dependencyList, shortHash, sizeLabel, sourceLabel, statusLabel } from './format';
import { memoryModStore, ModStoreError, type ModStore } from './store';

function make(over: Partial<ModManagerOptions> = {}, store: ModStore = memoryModStore()) {
	let reloads = 0;
	const manager = new ModManager({
		open: async () => ({ store, volatile: false }),
		booted: () => new Map(),
		reload: () => void reloads++,
		now: () => 42,
		...over
	});
	return { manager, store, reloads: () => reloads };
}
const file = (name: string, text: string) => ({ name, text: async () => text });

describe('ModManager install flow', () => {
	it('reads a package, waits for the trust prompt and stores nothing until confirmed', async () => {
		const { manager, store } = make();
		await manager.load();
		await manager.inspectFile(file('a.orbital-mod.json', await packageText('a')));
		expect(manager.error).toBeNull();
		expect(manager.pending?.package.manifest.id).toBe('a');
		expect(manager.pending?.source).toEqual({ kind: 'file', name: 'a.orbital-mod.json' });
		expect(await store.list()).toEqual([]);
		manager.cancel();
		expect(manager.pending).toBeNull();
		expect(await store.list()).toEqual([]);
	});

	it('confirm stores the mod enabled, trusted at its fingerprint, and asks for a reload', async () => {
		const { manager, store } = make();
		await manager.load();
		await manager.inspectFile(file('a.json', await packageText('a')));
		await manager.confirm();
		const [record] = await store.list();
		expect(record).toMatchObject({ id: 'a', enabled: true, order: 0, installedAt: 42 });
		expect(record!.trusted).toBe(record!.sha256);
		expect(manager.pending).toBeNull();
		expect(manager.changed).toBe(true);
		expect(manager.records.map((r) => r.id)).toEqual(['a']);
		expect(manager.statusOf(record!)).toEqual({ kind: 'starts-after-reload' });
	});

	it('refuses junk and edited packages with a readable message and no prompt', async () => {
		const { manager } = make();
		await manager.load();
		await manager.inspectFile(file('x', 'not json'));
		expect(manager.error).toContain('not JSON');
		expect(manager.pending).toBeNull();
		const text = await packageText('a');
		await manager.inspectFile(file('x', text.replace('Thing', 'Evil!')));
		expect(manager.error).toContain('edited or damaged');
		expect(manager.pending).toBeNull();
	});

	it('installing the same id again replaces it, keeps its place, and says so in the prompt', async () => {
		const { manager, store } = make();
		await manager.load();
		for (const id of ['a', 'b']) {
			await manager.inspectFile(file('f', await packageText(id)));
			await manager.confirm();
		}
		await manager.inspectFile(file('f', await packageText('a', { version: '2.0.0' })));
		expect(manager.pending?.replaces?.manifest.version).toBe('1.0.0');
		await manager.confirm();
		const records = await store.list();
		expect(records.map((r) => [r.id, r.manifest.version, r.order])).toEqual([
			['a', '2.0.0', 0],
			['b', '1.0.0', 1]
		]);
	});

	it('installs from a URL through the same prompt, and reports a failed download', async () => {
		const text = await packageText('a');
		const ok = make({ fetchText: async () => text });
		await ok.manager.load();
		await ok.manager.inspectUrl(' https://example.com/a.orbital-mod.json ');
		expect(ok.manager.pending?.source).toEqual({ kind: 'url', url: 'https://example.com/a.orbital-mod.json' });
		const bad = make({
			fetchText: async () => {
				throw new Error('The server answered 404.');
			}
		});
		await bad.manager.load();
		await bad.manager.inspectUrl('https://example.com/x');
		expect(bad.manager.error).toBe('The server answered 404.');
		expect(bad.manager.pending).toBeNull();
	});

	it('only downloads from https (or a local server) and says what a failed fetch means', async () => {
		await expect(fetchPackageText('not a url')).rejects.toThrow('not a web address');
		await expect(fetchPackageText('http://example.com/a.json')).rejects.toThrow('https://');
		await expect(fetchPackageText('ftp://x/y')).rejects.toThrow('https://');
	});
});

describe('ModManager list', () => {
	it('enable, disable and remove persist and ask for a reload', async () => {
		const { manager, store, reloads } = make();
		await store.put(await recordOf('a'));
		await manager.load();
		expect(manager.changed).toBe(false);
		await manager.setEnabled('a', false);
		expect((await store.list())[0]!.enabled).toBe(false);
		expect(manager.changed).toBe(true);
		await manager.remove('a');
		expect(await store.list()).toEqual([]);
		expect(manager.records).toEqual([]);
		manager.reload();
		expect(reloads()).toBe(1);
	});

	it('statuses compare the record with what this page booted', async () => {
		const a = await recordOf('a');
		const booted = new Map([
			['a', { state: { kind: 'loaded' } as const, sha256: a.sha256 }],
			['f', { state: { kind: 'failed', reason: 'boom' } as const, sha256: (await recordOf('f')).sha256 }]
		]);
		const { manager } = make({ booted: () => booted });
		expect(manager.statusOf(a)).toEqual({ kind: 'running' });
		expect(manager.statusOf({ ...a, enabled: false })).toEqual({ kind: 'stops-after-reload' });
		expect(manager.statusOf(await recordOf('f'))).toEqual({ kind: 'failed', reason: 'boom' });
		expect(manager.statusOf(await recordOf('z', { enabled: false }))).toEqual({ kind: 'off' });
		expect(manager.statusOf({ ...a, sha256: '0'.repeat(64) })).toEqual({ kind: 'starts-after-reload' });
	});

	it('a storage failure is shown and leaves the list as it was', async () => {
		const store = memoryModStore();
		await store.put(await recordOf('a'));
		const failing: ModStore = {
			...store,
			put: () => Promise.reject(new ModStoreError('The browser has no room left to store this mod.', 'quota'))
		};
		const { manager } = make({}, failing);
		await manager.load();
		await manager.setEnabled('a', false);
		expect(manager.error).toBe('The browser has no room left to store this mod.');
		expect(manager.records[0]!.enabled).toBe(true);
		expect(manager.changed).toBe(false);
	});

	it('reports a store that cannot open and says when storage is memory only', async () => {
		const broken = make({ open: () => Promise.reject(new Error('blocked')) });
		await broken.manager.load();
		expect(broken.manager.error).toBe('blocked');
		expect(broken.manager.loading).toBe(false);
		const volatile = make({ open: async () => ({ store: memoryModStore(), volatile: true }) });
		await volatile.manager.load();
		expect(volatile.manager.volatile).toBe(true);
	});
});

describe('labels', () => {
	it('say what the player needs to read', () => {
		expect(statusLabel({ kind: 'running' })).toBe('Running');
		expect(statusLabel({ kind: 'failed', reason: 'boom' })).toBe('Not loaded: boom');
		expect(statusLabel({ kind: 'stops-after-reload' })).toBe('Stops after reload');
		expect(sourceLabel({ kind: 'file', name: 'a.json' })).toBe('file a.json');
		expect(sizeLabel(512)).toBe('512 B');
		expect(sizeLabel(2048)).toBe('2.0 KB');
		expect(shortHash('a'.repeat(32) + 'b'.repeat(32))).toBe('aaaaaaaa…bbbbbbbb');
		expect(dependencyList({})).toBe('none');
		expect(dependencyList({ stock: '^0.1' })).toBe('stock ^0.1');
	});
});
