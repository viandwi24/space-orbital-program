import { describe, expect, test } from 'bun:test';
import {
	G0,
	ModuleDecoupler,
	ModuleEngine,
	ModuleReactionWheel,
	ModuleResourceContainer,
	containerConfigSchema,
	deposit,
	engineConfigSchema,
	engineOutput,
	ispAt,
	propellantRates,
	withdraw
} from '../src/index.ts';
import { contextFor, loaded } from './helpers.ts';

const LF = 'stock.liquid-fuel';
const OX = 'stock.oxidizer';
const engine = {
	thrust: 215_000,
	ispVacuum: 300,
	ispSeaLevel: 280,
	propellants: [
		{ resource: LF, ratio: 0.9 },
		{ resource: OX, ratio: 1.1 }
	]
};
const burning = { ignited: true, throttle: 1, flameout: false };

describe('resource container', () => {
	test('state starts from config: default full, explicit amount honoured', () => {
		const full = contextFor(ModuleResourceContainer, {
			contents: { [LF]: { capacity: 400 }, [OX]: { capacity: 490, amount: 100 } }
		});
		expect(full.state.amounts).toEqual({ [LF]: 400, [OX]: 100 });
		expect(ModuleResourceContainer.snapshot?.(full.state)).toEqual({
			amounts: { [LF]: 400, [OX]: 100 }
		});
	});

	test('withdraw and deposit clamp to contents and capacity', () => {
		const ctx = contextFor(ModuleResourceContainer, { contents: { [LF]: { capacity: 10 } } });
		expect(withdraw(ctx.state, LF, 4)).toBe(4);
		expect(withdraw(ctx.state, LF, 100)).toBe(6);
		expect(ctx.state.amounts[LF]).toBe(0);
		expect(withdraw(ctx.state, OX, 1)).toBe(0); // not held
		expect(deposit(ctx.config, ctx.state, LF, 25)).toBe(10);
		expect(deposit(ctx.config, ctx.state, OX, 5)).toBe(0); // not held: nothing created
		expect(ctx.state.amounts).toEqual({ [LF]: 10 });
		expect(() => withdraw(ctx.state, LF, -1)).toThrow(RangeError);
		expect(() => withdraw(ctx.state, LF, Number.NaN)).toThrow(RangeError);
	});

	test('actions validate their arguments and return the moved amount', () => {
		const ctx = contextFor(ModuleResourceContainer, { contents: { [LF]: { capacity: 10 } } });
		expect(ModuleResourceContainer.actions?.withdraw?.(ctx, LF, 3)).toBe(3);
		expect(ModuleResourceContainer.actions?.deposit?.(ctx, LF, 1)).toBe(1);
		expect(ctx.state.amounts[LF]).toBe(8);
		expect(() => ModuleResourceContainer.actions?.withdraw?.(ctx, LF)).toThrow();
		expect(() => ModuleResourceContainer.actions?.withdraw?.(ctx, LF, 'x')).toThrow();
	});

	test('config rejects an amount above capacity, non-positive capacity and bad resource keys', () => {
		expect(
			containerConfigSchema.safeParse({ contents: { [LF]: { capacity: 1, amount: 2 } } }).success
		).toBe(false);
		expect(containerConfigSchema.safeParse({ contents: { [LF]: { capacity: 0 } } }).success).toBe(
			false
		);
		expect(containerConfigSchema.safeParse({ contents: { Fuel: { capacity: 1 } } }).success).toBe(
			false
		);
	});
});

describe('engine', () => {
	test('state starts cold; onStage ignites; shutdown, flameout and throttle actions', () => {
		const ctx = contextFor(ModuleEngine, engine);
		expect(ctx.state).toEqual({ ignited: false, throttle: 0, flameout: false });
		ModuleEngine.onStage?.(ctx);
		expect(ctx.state.ignited).toBe(true);
		ModuleEngine.actions?.setThrottle?.(ctx, 2);
		expect(ctx.state.throttle).toBe(1);
		ModuleEngine.actions?.setThrottle?.(ctx, -1);
		expect(ctx.state.throttle).toBe(0);
		ModuleEngine.actions?.flameout?.(ctx);
		expect(ModuleEngine.snapshot?.(ctx.state)).toEqual({
			ignited: false,
			throttle: 0,
			flameout: true
		});
		ModuleEngine.onStage?.(ctx); // re-staging clears the flameout
		expect(ctx.state.flameout).toBe(false);
		ModuleEngine.actions?.shutdown?.(ctx);
		expect(ctx.state.ignited).toBe(false);
	});

	test('output: vacuum rating at p = 0, lower thrust at the same mass flow in air (1e-9 rel)', () => {
		const vac = engineOutput(engine, burning, 0);
		expect(vac.thrust).toBeCloseTo(215_000, 6);
		expect(vac.massFlow).toBeCloseTo(215_000 / (300 * G0), 9);
		const sea = engineOutput(engine, burning, 101_325);
		expect(sea.massFlow).toBeCloseTo(vac.massFlow, 12);
		expect(sea.isp).toBe(280);
		expect(sea.thrust).toBeCloseTo((215_000 * 280) / 300, 6);
		expect(ispAt(engine, 50_662.5)).toBeCloseTo(290, 9);
		expect(ispAt(engine, 1e9)).toBe(280); // pressure above the reference does not extrapolate
	});

	test('no output unless ignited, not flamed out and throttled; throttle scales mass flow', () => {
		for (const state of [
			{ ignited: false, throttle: 1, flameout: false },
			{ ignited: true, throttle: 0, flameout: false },
			{ ignited: true, throttle: 1, flameout: true }
		]) {
			expect(engineOutput(engine, state, 0).thrust).toBe(0);
			expect(engineOutput(engine, state, 0).massFlow).toBe(0);
		}
		const half = engineOutput(engine, { ...burning, throttle: 0.5 }, 0);
		expect(half.thrust).toBeCloseTo(107_500, 6);
	});

	test('propellant rates split by volume ratio and add up to the mass flow', () => {
		const densityOf = (id: string) => loaded.registries.resources.get(id)?.density ?? Number.NaN;
		const { massFlow } = engineOutput(engine, burning, 0);
		const rates = propellantRates(engine, massFlow, densityOf);
		expect(rates.map((r) => r.resource)).toEqual([LF, OX]);
		const [lf, ox] = rates;
		expect(lf!.rate / ox!.rate).toBeCloseTo(0.9 / 1.1, 12);
		const mass = rates.reduce((sum, r) => sum + r.rate * densityOf(r.resource), 0);
		expect(mass).toBeCloseTo(massFlow, 9);
	});

	test('config rejects sea-level Isp above vacuum Isp and an empty propellant list', () => {
		expect(engineConfigSchema.safeParse({ ...engine, ispSeaLevel: 320 }).success).toBe(false);
		expect(engineConfigSchema.safeParse({ ...engine, propellants: [] }).success).toBe(false);
	});
});

describe('decoupler and reaction wheel', () => {
	test('decoupler defaults, onStage fires once-and-stays', () => {
		const ctx = contextFor(ModuleDecoupler, {});
		expect(ctx.config).toEqual({ separates: 'top', ejectionImpulse: 2_000 });
		expect(ctx.state.decoupled).toBe(false);
		ModuleDecoupler.onStage?.(ctx);
		ModuleDecoupler.onStage?.(ctx);
		expect(ModuleDecoupler.snapshot?.(ctx.state)).toEqual({ decoupled: true });
	});

	test('reaction wheel starts enabled, toggles by action, validates its argument', () => {
		const ctx = contextFor(ModuleReactionWheel, { torque: 5_000 });
		expect(ctx.config.chargeRate).toBe(0);
		expect(ctx.state.enabled).toBe(true);
		ModuleReactionWheel.actions?.setEnabled?.(ctx, false);
		expect(ctx.state.enabled).toBe(false);
		expect(() => ModuleReactionWheel.actions?.setEnabled?.(ctx, 'no')).toThrow();
	});
});
