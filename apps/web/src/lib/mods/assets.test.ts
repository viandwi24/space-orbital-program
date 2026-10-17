/** Plan 051 / ADR 0076: a package with models through the install flow, the runtime and the Worker message. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildGlb, lathe } from '../../../../../tools/mod-build/glb';
import { parseClientMessage } from '../messages';
import { prepareModelProviders, modelProviders } from './asset-models';
import { importCode, packageText, pluginSource, recordOf } from './fixtures';
import { assetLabel } from './format';
import { ModManager } from './manager.svelte';
import { evaluateMods, resetModRuntime } from './runtime';
import { memoryModStore } from './store';

afterEach(() => resetModRuntime());

const glb = (): Uint8Array =>
	buildGlb({
		meshes: [
			lathe(
				[
					[0.5, -0.5],
					[0.5, 0.5]
				],
				12,
				0
			)
		],
		materials: [{ color: [1, 1, 1, 1] }],
		nodes: [{ name: 'body', mesh: 0 }],
		roots: [0]
	});

const files = { 'models/a.glb': glb() };
/** The fixtures' importer evaluates `export default <expression>`: a plugin whose part names the asset. */
const assetPlugin = (path = 'models/a.glb') =>
	pluginSource(
		'm',
		'1.0.0',
		`ctx.parts.register({ id: 'm.thing', title: 'Thing', mass: 2, shape: { kind: 'cylinder', radius: 0.5, height: 1 }, visual: { kind: 'tank', asset: ${JSON.stringify(path)} } });`
	);

describe('installing a package with models', () => {
	it('the trust prompt lists the files and the record keeps them', async () => {
		const store = memoryModStore();
		const manager = new ModManager({
			open: async () => ({ store, volatile: false }),
			booted: () => new Map(),
			reload: () => {},
			now: () => 1
		});
		await manager.load();
		const text = await packageText('m', { code: assetPlugin(), files });
		await manager.inspectFile({ name: 'm.json', text: async () => text });
		expect(manager.error).toBeNull();
		expect(manager.pending?.assets).toEqual([
			{
				path: 'models/a.glb',
				size: files['models/a.glb'].byteLength,
				sha256: expect.any(String),
				triangles: 24
			}
		]);
		await manager.confirm();
		const [record] = await store.list();
		expect(Object.keys(record!.assets ?? {})).toEqual(['models/a.glb']);
		expect(
			assetLabel(
				manager.pending?.assets[0] ?? { size: 2048, triangles: 24, sha256: 'a'.repeat(64) }
			)
		).toContain('24 triangles');
	});

	it('an edited asset is refused before any prompt', async () => {
		const manager = new ModManager({
			open: async () => ({ store: memoryModStore(), volatile: false }),
			booted: () => new Map(),
			reload: () => {}
		});
		await manager.load();
		const pkg = JSON.parse(await packageText('m', { code: assetPlugin(), files }));
		pkg.assets['models/a.glb'].data = pkg.assets['models/a.glb'].data.replace(/.$/, (c: string) =>
			c === 'A' ? 'B' : 'A'
		);
		await manager.inspectFile({ name: 'x', text: async () => JSON.stringify(pkg) });
		expect(manager.pending).toBeNull();
		expect(manager.error).toContain('models/a.glb');
	});
});

describe('the runtime with models', () => {
	it('gives the checked bytes of a part that names a shipped model', async () => {
		const runtime = await evaluateMods([await recordOf('m', { code: assetPlugin(), files })], {
			importModule: importCode
		});
		expect(runtime.entries[0]!.state).toEqual({ kind: 'loaded' });
		expect([...runtime.partAssets.keys()]).toEqual(['m.thing']);
		expect(runtime.partAssets.get('m.thing')!.byteLength).toBe(files['models/a.glb'].byteLength);
		expect(runtime.bundles[0]!.assets).toBeDefined();
	});

	it('a part naming a model the package lacks fails the mod with the part and file named', async () => {
		const runtime = await evaluateMods(
			[await recordOf('m', { code: assetPlugin('models/missing.glb'), files })],
			{ importModule: importCode }
		);
		expect(runtime.entries[0]!.state).toMatchObject({
			kind: 'failed',
			reason: expect.stringContaining('models/missing.glb')
		});
		expect(runtime.partAssets.size).toBe(0);
	});

	it('a record whose asset bytes changed since it was trusted does not run', async () => {
		const record = await recordOf('m', { code: assetPlugin(), files });
		const asset = record.assets!['models/a.glb']!;
		const flipped = { ...record, assets: { 'models/a.glb': { ...asset, sha256: '0'.repeat(64) } } };
		const runtime = await evaluateMods([flipped], { importModule: importCode });
		expect(runtime.entries[0]!.state).toMatchObject({ kind: 'untrusted' });
	});
});

describe('the Worker init message', () => {
	it('carries assets with a bundle and drops one with a malformed table', async () => {
		const record = await recordOf('m', { code: assetPlugin(), files });
		const ok = parseClientMessage({
			kind: 'init',
			mods: [{ manifest: record.manifest, code: record.code, assets: record.assets }]
		});
		expect(ok).toMatchObject({ kind: 'init', mods: [{ assets: { 'models/a.glb': {} } }] });
		const bad = parseClientMessage({
			kind: 'init',
			mods: [
				{ manifest: record.manifest, code: record.code, assets: { 'models/a.glb': { data: 1 } } }
			]
		});
		expect(bad).toEqual({ kind: 'init' });
	});
});

describe('model providers', () => {
	it('stay empty without mod models and report a model that cannot be parsed, keeping the game going', async () => {
		await prepareModelProviders(new Map());
		expect(modelProviders()).toEqual([]);
		const log = vi.fn();
		await prepareModelProviders(new Map([['m.thing', new Uint8Array(64)]]), log);
		expect(modelProviders()).toHaveLength(1);
		expect(log).toHaveBeenCalledWith(expect.stringContaining('could not be loaded'));
		await prepareModelProviders(new Map());
	});
});
