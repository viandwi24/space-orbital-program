import { describe, expect, test } from 'bun:test';
import {
	API_VERSION,
	createModPackage,
	importModBundle,
	modCodeHash,
	parseModPackage,
	resolveMods,
	type ModBundle,
	type ModManifest,
	type Plugin
} from '../src/index.ts';

const builtin: Plugin = {
	meta: { id: 'base', version: '1.2.0', api: '*' },
	depends: [],
	optional: [],
	setup(ctx) {
		ctx.parts.register({ id: 'base.rock', title: 'Rock', mass: 1 });
	}
};

const manifest = (over: Partial<ModManifest> = {}): ModManifest => ({
	id: 'm',
	version: '1.0.0',
	api: '^0.1',
	dependencies: {},
	...over
});

/** A mod written as the text a bundle contains: an ES module that default-exports a plugin. */
const source = (
	o: { id?: string; version?: string; api?: string; setup?: string; depends?: string } = {}
) =>
	`export default { meta: { id: ${JSON.stringify(o.id ?? 'm')}, version: ${JSON.stringify(o.version ?? '1.0.0')}, api: ${JSON.stringify(o.api ?? '^0.1')} },
	depends: ${o.depends ?? '[]'}, optional: [],
	setup(ctx) { ${o.setup ?? `ctx.parts.register({ id: '${o.id ?? 'm'}.thing', title: 'Thing', mass: 2 });`} } };`;

const bundle = (
	m: Partial<ModManifest>,
	code = source({ id: m.id, version: m.version })
): ModBundle => ({
	manifest: manifest(m),
	code
});

const run = (bundles: ModBundle[]) =>
	resolveMods(bundles, { builtin: [builtin], importModule: importModBundle });

describe('mod packages', () => {
	test('a package round trips and its fingerprint is checked', async () => {
		const pkg = await createModPackage({ id: 'm', version: '1.0.0', api: '^0.1' }, source());
		const text = JSON.stringify(pkg);
		const parsed = await parseModPackage(text);
		expect(parsed.ok && parsed.package.manifest.dependencies).toEqual({});
		expect(pkg.sha256).toBe(await modCodeHash(pkg.code));
		const edited = await parseModPackage(text.replace('Thing', 'Evil!'));
		expect(edited).toEqual({ ok: false, errors: [expect.stringContaining('edited or damaged')] });
	});

	test('bad packages are refused with readable reasons and nothing is run', async () => {
		const good = JSON.parse(
			JSON.stringify(await createModPackage({ id: 'm', version: '1.0.0', api: '^0.1' }, source()))
		);
		const errors = async (value: unknown) => {
			const r = await parseModPackage(typeof value === 'string' ? value : JSON.stringify(value));
			return r.ok ? [] : r.errors.join(' | ');
		};
		expect(await errors('{nope')).toContain('not JSON');
		expect(await errors({ hello: 1 })).toContain('Not an Orbital mod package');
		expect(await errors({ ...good, formatVersion: 3 })).toContain('newer game');
		expect(await errors({ ...good, manifest: { ...good.manifest, id: 'Bad Id' } })).toContain(
			'manifest.id'
		);
		expect(await errors({ ...good, manifest: { ...good.manifest, version: '1.0' } })).toContain(
			'manifest.version'
		);
		expect(await errors({ ...good, manifest: { ...good.manifest, api: '>=1' } })).toContain(
			'manifest.api'
		);
		expect(await errors({ ...good, manifest: { ...good.manifest, extra: 1 } })).toContain('extra');
		expect(await errors({ ...good, code: '' })).toContain('code');
		expect(await errors({ ...good, sha256: 'abc' })).toContain('sha256');
	});
});

describe('resolveMods through the blob importer', () => {
	test('a good mod loads and its plugin boots with the built-ins', async () => {
		const r = await run([bundle({ id: 'm' })]);
		expect(r.rejected).toEqual([]);
		expect(r.plugins.map((p) => p.meta.id)).toEqual(['m']);
	});

	test('the API range is checked and the reason names both versions', async () => {
		const r = await run([bundle({ id: 'm', api: '^0.2' })]);
		expect(r.plugins).toEqual([]);
		expect(r.rejected[0]!.reason).toBe(
			`requires mod API "^0.2" but this game provides ${API_VERSION}`
		);
	});

	test('a plugin id used by a built-in or by another mod names both', async () => {
		const r = await run([
			bundle({ id: 'base' }),
			bundle({ id: 'm' }),
			bundle({ id: 'm', version: '2.0.0' })
		]);
		expect(r.rejected.map((x) => x.reason)).toEqual([
			'plugin id "base" is already used by a built-in plugin; a mod cannot replace it',
			expect.stringContaining('mod "m" 1.0.0 and mod "m" 2.0.0')
		]);
		expect(r.plugins.map((p) => p.meta.id)).toEqual(['m']);
	});

	test('a part id registered by two plugins is a rejection naming both', async () => {
		const clash = source({
			id: 'n',
			setup: `ctx.parts.register({ id: 'n.thing', title: 'X', mass: 1 });`
		});
		const clashing = source({
			id: 'o',
			setup: `ctx.parts.register({ id: 'n.thing', title: 'Y', mass: 1 });`
		});
		const r = await run([bundle({ id: 'n' }, clash), bundle({ id: 'o' }, clashing)]);
		expect(r.plugins.map((p) => p.meta.id)).toEqual(['n']);
		expect(r.rejected[0]!.reason).toContain('"n"');
		expect(r.rejected[0]!.reason).toContain('"o"');
	});

	test('dependencies: missing, wrong version, satisfied by a built-in, and by a later mod', async () => {
		const r = await run([
			bundle({ id: 'a', dependencies: { absent: '^1' } }),
			bundle({ id: 'b', dependencies: { base: '^2' } }),
			bundle({ id: 'c', dependencies: { base: '^1.1', d: '*' } }),
			bundle({ id: 'd' })
		]);
		expect(r.rejected.map((x) => [x.id, x.reason])).toEqual([
			['a', 'needs "absent" ^1, which is not installed or enabled'],
			['b', 'needs "base" ^2 but 1.2.0 is installed']
		]);
		expect(r.plugins.map((p) => p.meta.id)).toEqual(['d', 'c']);
	});

	test('a setup that throws is rejected with its message; other mods still load', async () => {
		const r = await run([
			bundle({ id: 'bad' }, source({ id: 'bad', setup: `throw new Error('boom');` })),
			bundle({ id: 'ok' })
		]);
		expect(r.rejected).toEqual([
			{ id: 'bad', version: '1.0.0', reason: expect.stringContaining('boom') }
		]);
		expect(r.plugins.map((p) => p.meta.id)).toEqual(['ok']);
	});

	test('code that does not load, is not a plugin, or disagrees with its manifest', async () => {
		const r = await run([
			bundle({ id: 'a' }, 'export default ;'),
			bundle({ id: 'b' }, 'export default 42;'),
			bundle({ id: 'c' }, source({ id: 'other' })),
			bundle({ id: 'd', version: '1.0.0' }, source({ id: 'd', version: '1.0.1' })),
			bundle({ id: 'e' }, `throw new Error('at import');`)
		]);
		expect(r.rejected.map((x) => x.reason)).toEqual([
			expect.stringContaining('could not be loaded'),
			'the code does not default-export a plugin (definePlugin(...))',
			'the manifest says c 1.0.0 but the code is plugin "other" 1.0.0',
			'the manifest says d 1.0.0 but the code is plugin "d" 1.0.1',
			expect.stringContaining('at import')
		]);
		expect(r.plugins).toEqual([]);
	});

	test('a mod whose own api range is not satisfied by the plugin meta is caught by the loader', async () => {
		const r = await run([bundle({ id: 'm' }, source({ id: 'm', api: '^9' }))]);
		expect(r.rejected[0]!.reason).toContain('requires mod API "^9"');
	});
});
