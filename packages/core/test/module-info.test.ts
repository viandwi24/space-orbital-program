import { describe, expect, test } from 'bun:test';
import * as z from 'zod';
import {
	SEA_LEVEL_PRESSURE,
	describeModule,
	moduleInfoSchema,
	thrustAtPressure,
	type ModuleDefinition,
	type ModuleInfo
} from '../src/index.ts';

const engine = {
	massFlow: 70,
	thrust: [
		{ pressure: 0, thrust: 215_000 },
		{ pressure: SEA_LEVEL_PRESSURE, thrust: 200_000 }
	],
	propellants: [{ resource: 'acme.xenon', ratio: 1 }],
	ignited: false,
	flameout: false
};

describe('moduleInfoSchema (ADR 0033)', () => {
	test('accepts an engine, a separator, both, and nothing', () => {
		expect(moduleInfoSchema.safeParse({ engine }).success).toBe(true);
		expect(moduleInfoSchema.safeParse({ separator: { node: 'bottom', done: false } }).success).toBe(
			true
		);
		expect(
			moduleInfoSchema.safeParse({ engine, separator: { node: 'top', done: true } }).success
		).toBe(true);
		expect(moduleInfoSchema.safeParse({}).success).toBe(true);
	});

	test('refuses engines that tools could not use', () => {
		const bad: unknown[] = [
			{ engine: { ...engine, massFlow: 0 } },
			{ engine: { ...engine, thrust: [] } },
			// first point not at vacuum
			{ engine: { ...engine, thrust: [{ pressure: 10, thrust: 5 }] } },
			// not ascending
			{
				engine: {
					...engine,
					thrust: [
						{ pressure: 0, thrust: 5 },
						{ pressure: 100, thrust: 4 },
						{ pressure: 100, thrust: 3 }
					]
				}
			},
			{ engine: { ...engine, thrust: [{ pressure: 0, thrust: 0 }] } },
			{ engine: { ...engine, propellants: [] } },
			{ engine: { ...engine, propellants: [{ resource: 'xenon', ratio: 1 }] } },
			{ engine: { ...engine, propellants: [{ resource: 'acme.xenon', ratio: 0 }] } },
			{ engine: { massFlow: 1 } },
			{ separator: { node: '', done: false } },
			{ separator: { node: 'top' } }
		];
		for (const value of bad) expect(moduleInfoSchema.safeParse(value).success).toBe(false);
	});
});

describe('thrustAtPressure', () => {
	const curve = [
		{ pressure: 0, thrust: 100 },
		{ pressure: 50_000, thrust: 90 },
		{ pressure: 100_000, thrust: 50 }
	];
	test('interpolates linearly between points and clamps at both ends', () => {
		expect(thrustAtPressure(curve, 0)).toBe(100);
		expect(thrustAtPressure(curve, -5)).toBe(100);
		expect(thrustAtPressure(curve, 25_000)).toBeCloseTo(95, 12);
		expect(thrustAtPressure(curve, 50_000)).toBe(90);
		expect(thrustAtPressure(curve, 75_000)).toBeCloseTo(70, 12);
		expect(thrustAtPressure(curve, 1e9)).toBe(50);
		expect(thrustAtPressure([{ pressure: 0, thrust: 7 }], 5e4)).toBe(7);
	});
});

describe('describeModule', () => {
	const config = z.object({ flow: z.number().positive().default(10) });
	type Cfg = z.output<typeof config>;
	const info = (c: Cfg, s: { lit: boolean }): ModuleInfo => ({
		engine: { ...engine, massFlow: c.flow, ignited: s.lit }
	});
	const mod: ModuleDefinition = {
		id: 'acme.drive',
		config,
		state: () => ({ lit: false }),
		describe: info
	};

	test('parses the part config (defaults applied) and uses fresh state without a view', () => {
		expect(describeModule(mod, undefined)?.engine).toMatchObject({ massFlow: 10, ignited: false });
		expect(describeModule(mod, { flow: 3 })?.engine?.massFlow).toBe(3);
	});

	test('a live view replaces the fresh state', () => {
		expect(describeModule(mod, {}, { lit: true })?.engine?.ignited).toBe(true);
	});

	test('a module without describe has no descriptor', () => {
		expect(describeModule({ id: 'acme.plain' }, undefined)).toBeUndefined();
	});

	test('a bad config or a bad descriptor names the module', () => {
		expect(() => describeModule(mod, { flow: -1 })).toThrow(/acme\.drive/);
		const broken: ModuleDefinition = {
			id: 'acme.broken',
			describe: () => ({ engine: { ...engine, massFlow: -1 } })
		};
		expect(() => describeModule(broken, undefined)).toThrow(/acme\.broken.*invalid descriptor/s);
	});
});
