/**
 * Compile-time tests for the define-API: checked by `tsc` (bun run typecheck), never executed.
 * `@ts-expect-error` fails the build if the next line stops being an error.
 */
import {
	defineBody,
	defineModule,
	definePart,
	definePlugin,
	defineResource,
	defineSystem,
	z,
	type EntityId,
	type PartId
} from '../src/index.ts';

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const assertType = <_T extends true>(): void => {};

// ---- module augmentation through the SDK specifier -----------------------------------------
declare module '@orbital/sdk' {
	interface EventMap {
		'test:meltdown': { part: PartId; temperature: number };
	}
	interface ResourceMap {
		'test.uranium': { enrichment: number };
	}
	interface ModuleMap {
		'test.reactor': { output: number };
	}
}

// ---- typed ctx from depends / contributes --------------------------------------------------
const A = definePlugin({
	meta: { id: 'a', version: '1.0.0', api: '^0.1' },
	contributes: {} as { a: { hi(): string } },
	setup(ctx) {
		ctx.provide('a', { hi: () => 'hi' });
		// @ts-expect-error -- wrong implementation type for key "a"
		ctx.provide('a', { hi: () => 1 });
		// @ts-expect-error -- "nope" is not a contributed key
		ctx.provide('nope', {});
		// @ts-expect-error -- a plugin does not see its own contributions on ctx, only dependents do
		ctx.a;
	}
});

const B = definePlugin({
	meta: { id: 'b', version: '1.0.0', api: '^0.1' },
	depends: [A],
	contributes: {} as { b: number },
	setup(ctx) {
		const s = ctx.a.hi();
		assertType<Equal<typeof s, string>>();
		// @ts-expect-error -- no such member on A's API
		ctx.a.nope;
		ctx.provide('b', 1);
	}
});

// Transitive contributions are not in ctx: only direct dependencies count.
definePlugin({
	meta: { id: 'c', version: '1.0.0', api: '^0.1' },
	depends: [B],
	setup(ctx) {
		const b: number = ctx.b;
		void b;
		// @ts-expect-error -- A is a dependency of B, not of this plugin
		ctx.a;
	}
});

// A plugin that does not depend on A cannot see ctx.a.
definePlugin({
	meta: { id: 'd', version: '1.0.0', api: '^0.1' },
	setup(ctx) {
		// @ts-expect-error -- A is not in depends
		ctx.a.hi();
	}
});

// Several dependencies merge.
definePlugin({
	meta: { id: 'e', version: '1.0.0', api: '^0.1' },
	depends: [A, B],
	setup(ctx) {
		ctx.a.hi();
		const b: number = ctx.b;
		void b;
	}
});

// String dependencies order only; they add nothing to ctx.
definePlugin({
	meta: { id: 'f', version: '1.0.0', api: '^0.1' },
	depends: ['some.other'],
	setup(ctx) {
		// @ts-expect-error -- ids carry no types
		ctx.a;
	}
});

// Optional dependencies are possibly undefined under ctx.optional, and not on ctx itself.
definePlugin({
	meta: { id: 'g', version: '1.0.0', api: '^0.1' },
	optional: [A],
	setup(ctx) {
		const hi = ctx.optional.a;
		assertType<Equal<typeof hi, { hi(): string } | undefined>>();
		// @ts-expect-error -- possibly undefined
		ctx.optional.a.hi();
		ctx.optional.a?.hi();
		// @ts-expect-error -- optional deps are not on ctx
		ctx.a;
	}
});

// ctx.events is typed by augmentation made through '@orbital/sdk'.
definePlugin({
	meta: { id: 'h', version: '1.0.0', api: '^0.1' },
	setup(ctx) {
		ctx.events.on('test:meltdown', (e) => {
			assertType<Equal<typeof e.part, PartId>>();
			assertType<Equal<typeof e.temperature, number>>();
		});
		// @ts-expect-error -- unknown event name
		ctx.events.on('test:nope', () => {});
		// @ts-expect-error -- wrong payload
		ctx.events.emit('test:meltdown', { part: 'x', temperature: 1 });
	}
});

// ---- modules, parts, config checking -------------------------------------------------------
const Engine = defineModule({
	id: 'test.engine',
	config: z.object({ thrust: z.number(), isp: z.number().default(300) }),
	state: () => ({ throttle: 0, ignited: false }),
	onStage(ctx) {
		ctx.state.ignited = true;
		assertType<Equal<typeof ctx.config.isp, number>>(); // parsed output: default applied
		assertType<Equal<typeof ctx.entity, EntityId>>();
		// @ts-expect-error -- state has no such field
		ctx.state.nope;
	},
	update(ctx, dt) {
		ctx.state.throttle += dt * ctx.config.thrust;
	},
	actions: {
		toggle: (ctx) => {
			ctx.state.ignited = !ctx.state.ignited;
		}
	},
	snapshot: (state) => ({ throttle: state.throttle })
});
const Command = defineModule({ id: 'test.command' });

// state() receives the parsed config (ADR 0014): defaults are applied, state type is inferred
defineModule({
	id: 'test.tank',
	config: z.object({ capacity: z.number(), fill: z.number().default(1) }),
	state: (config) => {
		assertType<Equal<typeof config.fill, number>>();
		return { amount: config.capacity * config.fill };
	},
	update(ctx) {
		assertType<Equal<typeof ctx.state.amount, number>>();
	}
});

definePart({
	id: 'test.engine-lv',
	title: 'Engine',
	mass: 1250,
	modules: [[Engine, { thrust: 215_000 }], [Command]]
});
// isp is optional on input (has a default), allowed when given
definePart({ id: 'test.p', title: 'P', mass: 1, modules: [[Engine, { thrust: 1, isp: 280 }]] });
// config-less modules also accept an explicit undefined
definePart({ id: 'test.p', title: 'P', mass: 1, modules: [[Command, undefined]] });
// a part without modules is fine
definePart({ id: 'test.p', title: 'P', mass: 1 });
// data-form entries for ids declared in ModuleMap
definePart({ id: 'test.p', title: 'P', mass: 1, modules: [['test.reactor', { output: 5 }]] });
// both forms together
definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	modules: [
		[Engine, { thrust: 1 }],
		['test.reactor', { output: 5 }]
	]
});

definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	// @ts-expect-error -- thrust must be a number
	modules: [[Engine, { thrust: 'big' }]]
});
definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	// @ts-expect-error -- thrust is required
	modules: [[Engine, { isp: 3 }]]
});
definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	// @ts-expect-error -- unknown config key
	modules: [[Engine, { thrust: 1, nope: 1 }]]
});
definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	// @ts-expect-error -- a module with a schema needs its config
	modules: [[Engine]]
});
definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	// @ts-expect-error -- this module takes no config
	modules: [[Command, { x: 1 }]]
});
definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	// @ts-expect-error -- ModuleMap says test.reactor.output is a number
	modules: [['test.reactor', { output: 'x' }]]
});
definePart({
	id: 'test.p',
	title: 'P',
	mass: 1,
	// @ts-expect-error -- unknown module id string (not in ModuleMap)
	modules: [['test.unknown', {}]]
});
// @ts-expect-error -- title is required
definePart({ id: 'test.p', mass: 1 });

// ---- resources, bodies, systems ------------------------------------------------------------
defineResource({ id: 'test.uranium', density: 19, flowMode: 'stack', unit: 'kg' });
// @ts-expect-error -- flowMode is a closed set
defineResource({ id: 'test.uranium', density: 19, flowMode: 'liquid', unit: 'kg' });
defineBody({ id: 'test.home', mass: 5e24, radius: 6e6, rotationPeriod: 86_000 });
defineSystem({
	id: 'test.gravity',
	phase: 'pre-physics',
	update(world, dt, ctx) {
		world.entities();
		ctx.registries.parts.list();
		// @ts-expect-error -- systems get read-only registries
		ctx.registries.parts.register;
		void dt;
	}
});
// A system may also take fewer parameters.
defineSystem({ id: 'test.noop', phase: 'post-physics', update() {} });
