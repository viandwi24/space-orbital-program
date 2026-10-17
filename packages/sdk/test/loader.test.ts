import { describe, expect, test } from 'bun:test';
import {
	defineBody,
	defineModule,
	definePart,
	definePatch,
	definePlugin,
	defineResource,
	defineSystem,
	loadPlugins,
	partDefinitionSchema,
	PluginError,
	RegistryError,
	z,
	type Plugin
} from '../src/index.ts';
import jsonPart from './fixtures/part-json.json';
import jsonPartBad from './fixtures/part-json-bad.json';

const meta = (id: string, extra: { api?: string; version?: string } = {}) => ({
	id,
	version: extra.version ?? '1.0.0',
	api: extra.api ?? '^0.1'
});
const plain = (id: string, depends: Plugin[] = [], optional: Plugin[] = []) =>
	definePlugin({ meta: meta(id), depends, optional, setup() {} });

describe('ordering', () => {
	test('dependencies boot first; ties keep input order', () => {
		const a = plain('a');
		const b = plain('b', [a]);
		const c = plain('c', [a]);
		const d = plain('d', [b, c]);
		expect(loadPlugins([d, c, b, a]).report.order).toEqual(['a', 'c', 'b', 'd']);
		expect(loadPlugins([a, b, c, d]).report.order).toEqual(['a', 'b', 'c', 'd']);
	});

	test('string dependencies order loaded plugins', () => {
		const a = plain('a');
		const b = definePlugin({ meta: meta('b'), depends: ['a'], setup() {} });
		expect(loadPlugins([b, a]).report.order).toEqual(['a', 'b']);
	});

	test('a cycle throws and names the cycle', () => {
		const x = definePlugin({ meta: meta('x'), depends: ['y'], setup() {} });
		const y = definePlugin({ meta: meta('y'), depends: ['z'], setup() {} });
		const z2 = definePlugin({ meta: meta('z'), depends: ['x'], setup() {} });
		const ok = plain('ok');
		expect(() => loadPlugins([ok, x, y, z2])).toThrow(/x -> y -> z -> x/);
	});

	test('a plugin downstream of a cycle does not hide the cycle', () => {
		const x = definePlugin({ meta: meta('x'), depends: ['y'], setup() {} });
		const y = definePlugin({ meta: meta('y'), depends: ['x'], setup() {} });
		const tail = definePlugin({ meta: meta('tail'), depends: ['x'], setup() {} });
		expect(() => loadPlugins([tail, x, y])).toThrow(/x -> y -> x/);
	});

	test('an optional dependency also orders when present, and cycles through it are errors', () => {
		const a = definePlugin({ meta: meta('a'), optional: ['b'], setup() {} });
		const b = plain('b');
		expect(loadPlugins([a, b]).report.order).toEqual(['b', 'a']);
		const c = definePlugin({ meta: meta('c'), optional: ['d'], setup() {} });
		const d = definePlugin({ meta: meta('d'), depends: ['c'], setup() {} });
		expect(() => loadPlugins([c, d])).toThrow(/c -> d -> c/);
	});
});

describe('disabling', () => {
	test('a missing hard dependency disables the plugin with a reason, and its dependents', () => {
		const ghost = plain('ghost');
		const a = plain('a', [ghost]);
		const b = plain('b', [a]);
		const fine = plain('fine');
		const { report } = loadPlugins([a, b, fine]);
		expect(report.order).toEqual(['fine']);
		expect(report.disabled).toEqual([
			{ id: 'a', reason: 'missing dependency "ghost"' },
			{ id: 'b', reason: 'dependency "a" is disabled (missing dependency "ghost")' }
		]);
	});

	test('an absent optional dependency leaves ctx.optional.x undefined', () => {
		const lib = definePlugin({
			meta: meta('lib'),
			contributes: {} as { life: { on(): boolean } },
			setup(ctx) {
				ctx.provide('life', { on: () => true });
			}
		});
		const seen: Array<boolean | undefined> = [];
		const user = definePlugin({
			meta: meta('user'),
			optional: [lib],
			setup(ctx) {
				seen.push(ctx.optional.life?.on());
			}
		});
		const without = loadPlugins([user]);
		expect(without.report.order).toEqual(['user']);
		loadPlugins([lib, user]);
		expect(seen).toEqual([undefined, true]);
	});

	test('an api mismatch is refused with a clear reason', () => {
		const old = definePlugin({ meta: meta('old', { api: '^0.0' }), setup() {} });
		const future = definePlugin({ meta: meta('future', { api: '^0.2' }), setup() {} });
		const garbled = definePlugin({ meta: meta('garbled', { api: '>=0.1' }), setup() {} });
		const ok = definePlugin({ meta: meta('ok', { api: '~0.1.0' }), setup() {} });
		const { report } = loadPlugins([old, future, garbled, ok], { apiVersion: '0.1.4' });
		expect(report.order).toEqual(['ok']);
		expect(report.disabled.map((d) => d.id)).toEqual(['old', 'future', 'garbled']);
		expect(report.disabled[0]?.reason).toBe('requires mod API "^0.0" but this game provides 0.1.4');
		expect(report.disabled[2]?.reason).toMatch(
			/invalid api range: Unsupported version range ">=0.1"/
		);
	});

	test('a malformed plugin version disables, a malformed id throws', () => {
		const badVersion = definePlugin({ meta: meta('v', { version: '1.0' }), setup() {} });
		expect(loadPlugins([badVersion]).report.disabled[0]?.reason).toMatch(/invalid version "1.0"/);
		expect(() => loadPlugins([plain('Not Valid')])).toThrow(PluginError);
	});

	test('the same plugin id twice in the load list throws', () => {
		expect(() => loadPlugins([plain('a'), plain('a')])).toThrow(/Duplicate plugin id "a"/);
	});
});

describe('typed contributions at runtime', () => {
	const A = definePlugin({
		meta: meta('a'),
		contributes: {} as { a: { hi(): string } },
		setup(ctx) {
			ctx.provide('a', { hi: () => 'hi' });
		}
	});

	test('a dependent reads its dependency API from ctx', () => {
		let said = '';
		const B = definePlugin({
			meta: meta('b'),
			depends: [A],
			setup(ctx) {
				said = ctx.a.hi();
			}
		});
		loadPlugins([B, A]);
		expect(said).toBe('hi');
	});

	test('only direct dependencies appear on ctx at runtime', () => {
		const B = definePlugin({ meta: meta('b'), depends: [A], setup() {} });
		let keys: string[] = [];
		const C = definePlugin({
			meta: meta('c'),
			depends: [B],
			setup(ctx) {
				keys = Object.keys(ctx);
			}
		});
		loadPlugins([A, B, C]);
		expect(keys).not.toContain('a');
	});

	test('a key can be provided once; reserved names are refused', () => {
		const dup = definePlugin({
			meta: meta('dup'),
			contributes: {} as { a: { hi(): string } },
			setup(ctx) {
				ctx.provide('a', { hi: () => 'again' });
			}
		});
		expect(() => loadPlugins([A, dup])).toThrow(/"a" is already provided by plugin "a".*"dup"/);
		const sneaky = definePlugin({
			meta: meta('sneaky'),
			contributes: {} as { events: number },
			setup(ctx) {
				ctx.provide('events', 1);
			}
		});
		expect(() => loadPlugins([sneaky])).toThrow(/reserved/);
	});

	test('setup errors are wrapped with the plugin id; async setup is refused', () => {
		const boom = definePlugin({
			meta: meta('boom'),
			setup() {
				throw new Error('kaput');
			}
		});
		expect(() => loadPlugins([boom])).toThrow(/Plugin "boom" setup failed: kaput/);
		const later = definePlugin({
			meta: meta('later'),
			// A `void` return type admits async functions at compile time, so the loader checks at runtime.
			setup: async () => {}
		});
		expect(() => loadPlugins([later])).toThrow(/async setup is not supported/);
	});
});

describe('registration and report', () => {
	const Engine = defineModule({
		id: 'fixture.engine',
		config: z.object({ thrust: z.number().positive(), isp: z.number().default(300) })
	});
	const Cmd = defineModule({ id: 'fixture.command' });
	const Gimbal = defineModule({ id: 'fixture.gimbal', requires: ['fixture.engine'] });
	const Fuel = defineResource({ id: 'fixture.fuel', density: 800, flowMode: 'stack', unit: 'kg' });
	const Home = defineBody({ id: 'fixture.home', mass: 5e24, radius: 6e5, rotationPeriod: 21_600 });
	const Gravity = defineSystem({ id: 'fixture.gravity', phase: 'pre-physics', update() {} });
	const Lv = definePart({
		id: 'fixture.engine-lv',
		title: 'LV',
		mass: 1250,
		modules: [[Engine, { thrust: 215_000 }], [Cmd]]
	});

	const content = definePlugin({
		meta: meta('fixture'),
		setup(ctx) {
			ctx.resources.register(Fuel);
			ctx.modules.register(Engine);
			ctx.modules.register(Cmd);
			ctx.modules.register(Gimbal);
			ctx.bodies.register(Home);
			ctx.systems.register(Gravity);
			ctx.parts.register(Lv);
		}
	});

	test('the report lists what was registered, by whom, per kind', () => {
		const { report } = loadPlugins([content]);
		expect(report.registered).toEqual({
			part: [{ id: 'fixture.engine-lv', by: 'fixture' }],
			module: [
				{ id: 'fixture.engine', by: 'fixture' },
				{ id: 'fixture.command', by: 'fixture' },
				{ id: 'fixture.gimbal', by: 'fixture' }
			],
			resource: [{ id: 'fixture.fuel', by: 'fixture' }],
			body: [{ id: 'fixture.home', by: 'fixture' }],
			system: [{ id: 'fixture.gravity', by: 'fixture' }],
			rule: [],
			preset: [],
			charge: [],
			'data-kind': [],
			'action-group': [],
			building: [],
			situation: [],
			experiment: [],
			objective: [],
			contract: [],
			mission: [],
			'crew-trait': [],
			'crew-names': [],
			'site-template': [],
			antenna: [],
			'ground-station': [],
			category: []
		});
	});

	test('definePart stores the data form: module ids and configs as written', () => {
		expect(Lv.modules).toEqual([
			['fixture.engine', { thrust: 215_000 }],
			['fixture.command', undefined]
		]);
	});

	test('the same id registered by two plugins throws naming both', () => {
		const other = definePlugin({
			meta: meta('other'),
			setup(ctx) {
				ctx.resources.register(Fuel);
			}
		});
		try {
			loadPlugins([content, other]);
			throw new Error('expected a RegistryError');
		} catch (e) {
			expect(e).toBeInstanceOf(RegistryError);
			expect((e as RegistryError).existingBy).toBe('fixture');
			expect((e as RegistryError).attemptedBy).toBe('other');
			expect((e as Error).message).toMatch(/"fixture".*"other"/);
		}
	});

	test('a part whose module config violates the module schema is rejected', () => {
		const bad = definePlugin({
			meta: meta('bad'),
			depends: [content],
			setup(ctx) {
				// Data-form entry: not checked at compile time, so the loader must catch it.
				ctx.parts.register({
					id: 'bad.engine',
					title: 'Bad',
					mass: 1,
					modules: [['fixture.engine', { thrust: -5 }]]
				});
			}
		});
		expect(() => loadPlugins([content, bad])).toThrow(
			/part "bad.engine" \(plugin "bad"\): config for module "fixture.engine"[\s\S]*thrust/
		);
	});

	test('unknown modules, duplicates and unmet requires are reported together', () => {
		const bad = definePlugin({
			meta: meta('bad'),
			depends: [content],
			setup(ctx) {
				ctx.parts.register({
					id: 'bad.a',
					title: 'A',
					mass: 1,
					modules: [['fixture.nope', {}]]
				});
				ctx.parts.register({
					id: 'bad.b',
					title: 'B',
					mass: 1,
					modules: [
						['fixture.command', undefined],
						['fixture.command', undefined]
					]
				});
				ctx.parts.register({
					id: 'bad.c',
					title: 'C',
					mass: 1,
					modules: [['fixture.gimbal', undefined]]
				});
				ctx.parts.register({
					id: 'bad.d',
					title: 'D',
					mass: 1,
					modules: [['fixture.command', { stray: 1 }]]
				});
			}
		});
		let message = '';
		try {
			loadPlugins([content, bad]);
		} catch (e) {
			message = (e as Error).message;
		}
		expect(message).toMatch(/unknown module "fixture.nope"/);
		expect(message).toMatch(/module "fixture.command" is listed twice/);
		expect(message).toMatch(/module "fixture.gimbal" requires module "fixture.engine"/);
		expect(message).toMatch(/module "fixture.command" takes no config/);
	});

	test('the parsed config applies defaults (what module hooks receive)', () => {
		const { registries } = loadPlugins([content]);
		const engine = registries.modules.get('fixture.engine');
		expect(engine?.config?.parse({ thrust: 1 })).toEqual({ thrust: 1, isp: 300 });
	});
});

describe('JSON parts use the same schemas', () => {
	const Engine = defineModule({
		id: 'fixture.engine',
		config: z.object({ thrust: z.number().positive() })
	});
	const modules = definePlugin({
		meta: meta('fixture'),
		setup(ctx) {
			ctx.modules.register(Engine);
		}
	});
	const jsonPlugin = (data: unknown) =>
		definePlugin({
			meta: meta('json'),
			depends: [modules],
			setup(ctx) {
				ctx.parts.register(partDefinitionSchema.parse(data));
			}
		});

	test('a JSON part validates and is listed like any other', () => {
		const { report, registries } = loadPlugins([modules, jsonPlugin(jsonPart)]);
		expect(report.registered.part).toEqual([{ id: 'fixture.json-engine', by: 'json' }]);
		expect(registries.parts.get('fixture.json-engine')?.modules).toEqual([
			['fixture.engine', { thrust: 50000 }]
		]);
	});

	test('a JSON part with a bad module config is rejected by the module schema', () => {
		expect(() => loadPlugins([modules, jsonPlugin(jsonPartBad)])).toThrow(
			/part "fixture.json-engine-bad" \(plugin "json"\)[\s\S]*thrust/
		);
	});

	test('a structurally invalid JSON part fails the part schema before the loader', () => {
		expect(() => loadPlugins([modules, jsonPlugin({ id: 'fixture.x' })])).toThrow(/Plugin "json"/);
	});
});

describe('definePatch through definePlugin', () => {
	test('a mod patches a part of the plugin it depends on; the report names it', () => {
		const base = definePlugin({
			meta: { id: 'base', version: '1.0.0', api: '^0.1' },
			setup(ctx) {
				ctx.parts.register(definePart({ id: 'base.tank', title: 'Tank', mass: 500 }));
			}
		});
		const balance = definePlugin({
			meta: { id: 'balance', version: '1.0.0', api: '^0.1' },
			depends: [base],
			setup(ctx) {
				ctx.patches.register(
					definePatch({
						id: 'balance.lighter-tanks',
						target: 'part',
						select: { where: (part) => part.mass >= 500 },
						ops: [{ op: 'set', path: 'mass', value: 400 }]
					})
				);
			}
		});
		const { registries, report } = loadPlugins([base, balance]);
		expect(registries.parts.get('base.tank')!.mass).toBe(400);
		expect(report.patches).toEqual([
			{
				id: 'balance.lighter-tanks',
				by: 'balance',
				target: 'part',
				applied: ['base.tank'],
				changes: [{ entry: 'base.tank', path: 'mass', from: 500, to: 400 }]
			}
		]);
		expect(report.provenance.part).toEqual({ 'base.tank': { mass: ['base', 'balance'] } });
	});
});
