import { describe, expect, test } from 'bun:test';
import * as z from 'zod';
import {
	applyPatches,
	createRegistries,
	createRegistry,
	loadPlugins,
	PluginError,
	type AnyPatchDefinition,
	type PartDefinition,
	type PatchSource,
	type Plugin,
	type Registries
} from '../src/index.ts';

const engine = (id: string, thrust = 200_000): PartDefinition => ({
	id,
	title: 'Engine',
	mass: 1000,
	modules: [['stock.engine', { thrust, isp: 300 }]]
});

/** Registries with one engine module (schema checked by `checkEntry`) and two engine parts. */
function fixture(): Registries {
	const r = createRegistries();
	r.modules.register(
		{ id: 'stock.engine', config: z.object({ thrust: z.number().positive(), isp: z.number() }) },
		'stock'
	);
	r.parts.register(engine('stock.engine-a'), 'stock');
	r.parts.register(engine('stock.engine-b', 300_000), 'stock');
	r.parts.register({ id: 'stock.tank', title: 'Tank', mass: 500 }, 'stock');
	return r;
}

const source = (def: AnyPatchDefinition, by: string, bootIndex: number): PatchSource => ({
	def,
	by,
	bootIndex
});

function run(r: Registries, patches: PatchSource[]) {
	return applyPatches({
		patches,
		registries: { part: r.parts, resource: r.resources, body: r.bodies },
		checkEntry: (target, entry) => {
			if (target !== 'part') return undefined;
			for (const [moduleId, config] of (entry as PartDefinition).modules ?? []) {
				const parsed = r.modules.get(moduleId)?.config?.safeParse(config);
				if (parsed && !parsed.success)
					return `config for module "${moduleId}": ${z.prettifyError(parsed.error)}`;
			}
			return undefined;
		}
	});
}

const thrustOf = (r: Registries, id: string) =>
	(r.parts.get(id)!.modules![0]![1] as { thrust: number }).thrust;

describe('applyPatches: order', () => {
	const setThrust = (
		id: string,
		value: number,
		extra: Partial<AnyPatchDefinition> = {}
	): AnyPatchDefinition =>
		({
			id,
			target: 'part',
			select: { id: 'stock.engine-a' },
			ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value }],
			...extra
		}) as AnyPatchDefinition;

	for (const listOrder of ['a-first', 'b-first'] as const) {
		test(`"after" decides the result, not the load list (${listOrder})`, () => {
			const r = fixture();
			// beta says it comes after alpha; alpha boots later, so plain boot order would put it last.
			const a = source(setThrust('alpha.thrust', 210_000), 'alpha', 2);
			const b = source(setThrust('beta.thrust', 230_000, { after: ['alpha'] }), 'beta', 1);
			const { patches, provenance } = run(r, listOrder === 'a-first' ? [a, b] : [b, a]);
			expect(thrustOf(r, 'stock.engine-a')).toBe(230_000);
			expect(patches.map((p) => p.id)).toEqual(['alpha.thrust', 'beta.thrust']);
			expect(provenance.part['stock.engine-a']!['modules.stock.engine.thrust']).toEqual([
				'stock',
				'alpha',
				'beta'
			]);
		});
	}

	test('"before" works the same way', () => {
		const r = fixture();
		run(r, [
			source(setThrust('alpha.thrust', 210_000, { before: ['beta'] }), 'alpha', 2),
			source(setThrust('beta.thrust', 230_000), 'beta', 1)
		]);
		expect(thrustOf(r, 'stock.engine-a')).toBe(230_000);
	});

	test('priority orders what constraints leave open; then boot index; then registration', () => {
		const r = fixture();
		const { patches } = run(r, [
			source(setThrust('c.late', 1, { priority: 10 }), 'c', 0),
			source(setThrust('b.second', 2), 'b', 1),
			source(setThrust('a.first', 3), 'a', 0),
			source(setThrust('a.first-2', 4), 'a', 0)
		]);
		expect(patches.map((p) => p.id)).toEqual(['a.first', 'a.first-2', 'b.second', 'c.late']);
		expect(thrustOf(r, 'stock.engine-a')).toBe(1);
	});

	test('a cycle of "after" constraints disables its patches with the cycle named; others apply', () => {
		const r = fixture();
		const { patches } = run(r, [
			source(setThrust('alpha.thrust', 210_000, { after: ['beta'] }), 'alpha', 0),
			source(setThrust('beta.thrust', 230_000, { after: ['alpha'] }), 'beta', 1),
			source(
				{
					id: 'gamma.mass',
					target: 'part',
					select: { id: 'stock.tank' },
					ops: [{ op: 'set', path: 'mass', value: 600 }]
				},
				'gamma',
				2
			)
		]);
		const byId = Object.fromEntries(patches.map((p) => [p.id, p]));
		for (const id of ['alpha.thrust', 'beta.thrust']) {
			expect(byId[id]!.disabled).toContain('cycle');
			expect(byId[id]!.disabled).toContain('"alpha.thrust"');
			expect(byId[id]!.disabled).toContain('"beta.thrust"');
		}
		expect(thrustOf(r, 'stock.engine-a')).toBe(200_000);
		expect(byId['gamma.mass']!.disabled).toBeUndefined();
		expect(r.parts.get('stock.tank')!.mass).toBe(600);
	});

	test('constraints naming plugins that are not loaded are ignored', () => {
		const r = fixture();
		const { patches } = run(r, [
			source(setThrust('a.t', 5, { after: ['nobody'], before: ['ghost'] }), 'a', 0)
		]);
		expect(patches[0]!.disabled).toBeUndefined();
		expect(thrustOf(r, 'stock.engine-a')).toBe(5);
	});
});

describe('applyPatches: validation', () => {
	test('a patch that makes a part invalid is disabled; the part keeps its unpatched value', () => {
		const r = fixture();
		const before = r.parts.get('stock.tank');
		const { patches } = run(r, [
			source(
				{
					id: 'bad.mass',
					target: 'part',
					select: { id: 'stock.tank' },
					ops: [{ op: 'set', path: 'mass', value: -1 }]
				},
				'bad',
				0
			)
		]);
		expect(patches[0]!.disabled).toContain('stock.tank');
		expect(patches[0]!.applied).toEqual([]);
		expect(r.parts.get('stock.tank')).toBe(before!);
		expect(r.parts.get('stock.tank')!.mass).toBe(500);
	});

	test('a patch that breaks a module config is disabled the same way', () => {
		const r = fixture();
		const { patches, provenance } = run(r, [
			source(
				{
					id: 'bad.thrust',
					target: 'part',
					select: { id: 'stock.engine-a' },
					ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value: 'x' }]
				},
				'bad',
				0
			)
		]);
		expect(patches[0]!.disabled).toContain('module "stock.engine"');
		expect(thrustOf(r, 'stock.engine-a')).toBe(200_000);
		expect(provenance.part).toEqual({});
	});

	test('all or nothing: one invalid entry keeps every selected entry unpatched', () => {
		const r = fixture();
		const { patches } = run(r, [
			source(
				{
					id: 'bad.all',
					target: 'part',
					select: { ids: ['stock.engine-a', 'stock.tank'] },
					// The tank has no engine module: the path fails on it.
					ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value: 1 }]
				},
				'bad',
				0
			)
		]);
		expect(patches[0]!.disabled).toContain('stock.tank');
		expect(thrustOf(r, 'stock.engine-a')).toBe(200_000);
	});

	test('a later patch sees the value without a disabled one', () => {
		const r = fixture();
		const { patches } = run(r, [
			source(
				{
					id: 'a.bad',
					target: 'part',
					select: { id: 'stock.tank' },
					ops: [{ op: 'set', path: 'mass', value: -5 }]
				},
				'a',
				0
			),
			source(
				{
					id: 'b.ok',
					target: 'part',
					select: { id: 'stock.tank' },
					ops: [{ op: 'set', path: 'mass', value: 700 }]
				},
				'b',
				1
			)
		]);
		expect(patches[1]!.changes).toEqual([
			{ entry: 'stock.tank', path: 'mass', from: 500, to: 700 }
		]);
	});

	test('the id cannot change, and a throwing "where" disables the patch', () => {
		const r = fixture();
		const { patches } = run(r, [
			source(
				{
					id: 'a.id',
					target: 'part',
					select: { id: 'stock.tank' },
					ops: [{ op: 'set', path: 'id', value: 'stock.other' }]
				},
				'a',
				0
			),
			source(
				{
					id: 'a.where',
					target: 'part',
					select: {
						where: () => {
							throw new Error('boom');
						}
					},
					ops: []
				},
				'a',
				0
			)
		]);
		expect(patches[0]!.disabled).toContain('cannot change the id');
		expect(patches[1]!.disabled).toContain('boom');
	});

	test('patched entries stay frozen', () => {
		const r = fixture();
		run(r, [
			source(
				{
					id: 'a.m',
					target: 'part',
					select: { id: 'stock.tank' },
					ops: [{ op: 'set', path: 'mass', value: 1 }]
				},
				'a',
				0
			)
		]);
		expect(Object.isFrozen(r.parts.get('stock.tank'))).toBe(true);
	});
});

describe('applyPatches: select', () => {
	type Tagged = { id: string; tags?: string[]; n: number };
	const tagged = () => {
		const reg = createRegistry<Tagged>('body', {
			schema: z.object({ id: z.string(), n: z.number() })
		});
		reg.register({ id: 'x.one', tags: ['moon'], n: 1 }, 'x');
		reg.register({ id: 'x.two', tags: ['planet', 'moon'], n: 2 }, 'x');
		reg.register({ id: 'x.three', n: 3 }, 'x');
		return reg;
	};
	const selected = (select: unknown) => {
		const reg = tagged();
		const r = createRegistries();
		const { patches } = applyPatches({
			patches: [
				source(
					{
						id: 'p.s',
						target: 'body',
						select,
						ops: [{ op: 'set', path: 'n', value: 0 }]
					} as AnyPatchDefinition,
					'p',
					0
				)
			],
			registries: { part: r.parts, resource: r.resources, body: reg as never }
		});
		return patches[0]!.applied;
	};

	test('by id, ids, tag and where', () => {
		expect(selected({ id: 'x.two' })).toEqual(['x.two']);
		expect(selected({ ids: ['x.three', 'x.one'] })).toEqual(['x.one', 'x.three']);
		expect(selected({ tag: 'moon' })).toEqual(['x.one', 'x.two']);
		expect(selected({ where: (e: Tagged) => e.n >= 2 })).toEqual(['x.two', 'x.three']);
		expect(selected({ id: 'x.none' })).toEqual([]);
	});
});

describe('applyPatches: ops', () => {
	const patchTank = (ops: AnyPatchDefinition['ops']) => {
		const r = fixture();
		r.parts.register(
			{
				id: 'stock.box',
				title: 'Box',
				mass: 10,
				visual: { kind: 'tank', palette: { primary: '#111111' } },
				attach: { top: { pos: [0, 1, 0], dir: [0, 1, 0] } }
			} as PartDefinition,
			'stock'
		);
		const { patches } = run(r, [
			source({ id: 'p.ops', target: 'part', select: { id: 'stock.box' }, ops }, 'p', 0)
		]);
		return {
			r,
			report: patches[0]!,
			box: r.parts.get('stock.box') as PartDefinition & Record<string, unknown>
		};
	};

	test('set creates missing parents', () => {
		const { box, report } = patchTank([{ op: 'set', path: 'connector.feeds', value: true }]);
		expect(report.disabled).toBeUndefined();
		expect(box.connector).toEqual({ feeds: true });
	});

	test('merge is shallow and records each key as a path', () => {
		const { box, report } = patchTank([
			{ op: 'merge', path: 'visual.palette', value: { secondary: '#222222' } }
		]);
		expect(box.visual).toEqual({
			kind: 'tank',
			palette: { primary: '#111111', secondary: '#222222' }
		});
		expect(report.changes.map((c) => c.path)).toEqual(['visual.palette.secondary']);
	});

	test('remove deletes a key; a missing path disables the patch', () => {
		expect(patchTank([{ op: 'remove', path: 'visual' }]).box.visual).toBeUndefined();
		const { report, box } = patchTank([{ op: 'remove', path: 'crossfeed' }]);
		expect(report.disabled).toContain('does not exist');
		expect(box.visual).toBeDefined();
	});

	test('append and insert on arrays; numeric segments index them', () => {
		const { box } = patchTank([
			{ op: 'set', path: 'attach.top.pos.1', value: 2 },
			{ op: 'append', path: 'modules', value: ['stock.engine', { thrust: 1, isp: 1 }] },
			{ op: 'insert', path: 'modules', index: 0, value: ['stock.engine', { thrust: 2, isp: 2 }] }
		]);
		expect(box.attach!.top!.pos).toEqual([0, 2, 0]);
		expect(box.modules!.map((m) => (m[1] as { thrust: number }).thrust)).toEqual([2, 1]);
	});

	test('a whole module can be removed by its id', () => {
		const r = fixture();
		run(r, [
			source(
				{
					id: 'p.rm',
					target: 'part',
					select: { id: 'stock.engine-a' },
					ops: [{ op: 'remove', path: 'modules.stock.engine' }]
				},
				'p',
				0
			)
		]);
		expect(r.parts.get('stock.engine-a')!.modules).toEqual([]);
	});

	test('a part without the module is an error, and unsafe segments are refused', () => {
		expect(
			patchTank([{ op: 'set', path: 'modules.stock.engine.thrust', value: 1 }]).report.disabled
		).toContain('no modules');
		expect(patchTank([{ op: 'set', path: '__proto__.x', value: 1 }]).report.disabled).toContain(
			'not allowed'
		);
		expect(
			patchTank([{ op: 'insert', path: 'attach.top.pos', index: 9, value: 1 }]).report.disabled
		).toContain('out of range');
	});
});

describe('loadPlugins with patches', () => {
	const base: Plugin = {
		meta: { id: 'stock', version: '1.0.0', api: '^0.1' },
		depends: [],
		optional: [],
		setup(ctx) {
			ctx.modules.register({
				id: 'stock.engine',
				config: z.object({ thrust: z.number().positive(), isp: z.number() })
			});
			ctx.parts.register(engine('stock.engine-a'));
		}
	};
	const patcher = (id: string, thrust: number, after: string[] = []): Plugin => ({
		meta: { id, version: '1.0.0', api: '^0.1' },
		depends: ['stock'],
		optional: [],
		setup(ctx) {
			ctx.patches.register({
				id: `${id}.thrust`,
				target: 'part',
				select: { id: 'stock.engine-a' },
				ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value: thrust }],
				after
			});
		}
	});

	test('two plugins patch the same field; "after" wins over the load list', () => {
		for (const list of [
			[base, patcher('beta', 230_000, ['alpha']), patcher('alpha', 210_000)],
			[base, patcher('alpha', 210_000), patcher('beta', 230_000, ['alpha'])]
		]) {
			const { registries, report } = loadPlugins(list);
			expect(thrustOf(registries, 'stock.engine-a')).toBe(230_000);
			expect(report.patches.map((p) => [p.id, p.applied])).toEqual([
				['alpha.thrust', ['stock.engine-a']],
				['beta.thrust', ['stock.engine-a']]
			]);
			expect(report.provenance.part['stock.engine-a']!['modules.stock.engine.thrust']).toEqual([
				'stock',
				'alpha',
				'beta'
			]);
			expect(report.patches[1]!.changes).toEqual([
				{ entry: 'stock.engine-a', path: 'modules.stock.engine.thrust', from: 210_000, to: 230_000 }
			]);
		}
	});

	test('a patch that breaks a module config is reported, not thrown; the load still succeeds', () => {
		const bad: Plugin = {
			meta: { id: 'bad', version: '1.0.0', api: '^0.1' },
			depends: ['stock'],
			optional: [],
			setup(ctx) {
				ctx.patches.register({
					id: 'bad.thrust',
					target: 'part',
					select: { id: 'stock.engine-a' },
					ops: [{ op: 'set', path: 'modules.stock.engine.thrust', value: 'x' }]
				});
			}
		};
		const { registries, report } = loadPlugins([base, bad]);
		expect(report.patches[0]!.disabled).toContain('module "stock.engine"');
		expect(thrustOf(registries, 'stock.engine-a')).toBe(200_000);
	});

	test('no patches: empty report fields', () => {
		const { report } = loadPlugins([base]);
		expect(report.patches).toEqual([]);
		expect(report.provenance).toEqual({ part: {}, resource: {}, body: {} });
	});

	test('patching a module registry or a duplicate patch id is a load error', () => {
		const wrongTarget: Plugin = {
			meta: { id: 'w', version: '1.0.0', api: '^0.1' },
			depends: [],
			optional: [],
			setup(ctx) {
				ctx.patches.register({
					id: 'w.m',
					target: 'module',
					select: { id: 'x' },
					ops: []
				} as unknown as AnyPatchDefinition);
			}
		};
		expect(() => loadPlugins([base, wrongTarget])).toThrow(PluginError);
		const twice: Plugin = {
			meta: { id: 't', version: '1.0.0', api: '^0.1' },
			depends: [],
			optional: [],
			setup(ctx) {
				const p: AnyPatchDefinition = { id: 't.p', target: 'part', select: { id: 'x' }, ops: [] };
				ctx.patches.register(p);
				ctx.patches.register({ ...p });
			}
		};
		expect(() => loadPlugins([base, twice])).toThrow(/Duplicate patch id "t.p"/);
	});
});
