import { afterEach, describe, expect, it } from 'vitest';
import { loadContent } from '../catalog';
import { bootedMods, modHint } from '../save/mods';
import { importCode, pluginSource, recordOf } from './fixtures';
import { evaluateMods, initModRuntime, resetModRuntime } from './runtime';
import { memoryModStore } from './store';

afterEach(() => resetModRuntime());

describe('the mod runtime', () => {
	it('boots enabled, trusted mods and reports every other state', async () => {
		const runtime = await evaluateMods([
			await recordOf('good', { order: 0 }),
			await recordOf('off', { order: 1, enabled: false }),
			await recordOf('tampered', { order: 2, trusted: 'f'.repeat(64) }),
			await recordOf('bad', {
				order: 3,
				code: pluginSource('bad', '1.0.0', `throw new Error('boom');`)
			})
		], { importModule: importCode });
		const states = Object.fromEntries(runtime.entries.map((e) => [e.record.id, e.state]));
		expect(states['good']).toEqual({ kind: 'loaded' });
		expect(states['off']).toEqual({ kind: 'disabled' });
		expect(states['tampered']).toMatchObject({ kind: 'untrusted' });
		expect(states['bad']).toMatchObject({ kind: 'failed', reason: expect.stringContaining('boom') });
		expect(runtime.plugins.map((p) => p.meta.id)).toEqual(['good']);
		expect(runtime.bundles.map((b) => b.manifest.id)).toEqual(['good']);
	});

	it('feeds the catalogue and the list of booted mods; a failing mod does not stop the game', async () => {
		const store = memoryModStore();
		await store.put(await recordOf('good'));
		await store.put(await recordOf('bad', { order: 1, code: pluginSource('bad', '1.0.0', 'throw 1;') }));
		await initModRuntime(store, { importModule: importCode });
		const { catalog } = loadContent();
		expect(catalog.plugins).toEqual(['stock', 'good']);
		expect(catalog.parts.some((p) => p.id === 'good.thing')).toBe(true);
		expect([...bootedMods().keys()]).toEqual(['stock', 'good']);
	});

	it('explains why a mod a save needs is not running', async () => {
		const store = memoryModStore();
		await store.put(await recordOf('off', { enabled: false }));
		await store.put(await recordOf('bad', { order: 1, code: pluginSource('bad', '1.0.0', 'throw new Error("x");') }));
		await initModRuntime(store, { importModule: importCode });
		expect(modHint('off')).toBe('installed but turned off');
		expect(modHint('bad')).toContain('failed to load');
		expect(modHint('nope')).toBe('not installed');
	});

	it('an unreadable store means stock only', async () => {
		await initModRuntime({
			list: () => Promise.reject(new Error('locked')),
			put: async () => {},
			delete: async () => {}
		});
		expect([...bootedMods().keys()]).toEqual(['stock']);
	});
});
