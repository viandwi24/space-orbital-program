import { describe, expect, test } from 'bun:test';
import {
	G0,
	ModuleCommand,
	ModuleDecoupler,
	ModuleEngine,
	ModuleFin,
	ModuleHeatShield,
	ModuleLandingLeg,
	ModuleReactionWheel,
	ModuleResourceContainer,
	containerConfigSchema,
	deposit,
	engineConfigSchema,
	engineOutput,
	finConfigSchema,
	finNormalForce,
	ispAt,
	landingLegColliders,
	propellantRates,
	withdraw
} from '../src/index.ts';
import { SEA_LEVEL_PRESSURE, describeModule, thrustAtPressure } from '@orbital/sdk';
import { contextFor, fakeVessel, loaded } from './helpers.ts';

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
		expect(ctx.state).toEqual({
			ignited: false,
			throttle: 0,
			flameout: false,
			gimbal: [0, 0]
		});
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
			flameout: true,
			gimbal: [0, 0]
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

describe('engine update (through the vessel capability API)', () => {
	const dt = 0.02;
	const fuel = (amount: number) => ({ [LF]: amount, [OX]: amount * 1.2 });

	test('burning: throttle copied, propellant drawn at the mass flow, thrust along +Y', () => {
		const vessel = fakeVessel(fuel(400));
		vessel.control.throttle = 0.5;
		const ctx = contextFor(ModuleEngine, engine, vessel);
		ModuleEngine.onStage?.(ctx);
		ModuleEngine.update?.(ctx, dt);
		expect(ctx.state.throttle).toBe(0.5);
		expect(vessel.forces).toHaveLength(1);
		const { force } = vessel.forces[0]!;
		expect(force.x).toBe(0);
		expect(force.z).toBe(0);
		expect(force.y).toBeCloseTo(107_500, 6); // vacuum, half throttle
		const out = engineOutput(engine, { ...burning, throttle: 0.5 }, 0);
		const rates = propellantRates(
			engine,
			out.massFlow,
			(id) => loaded.registries.resources.get(id)!.density
		);
		expect(400 - vessel.stock[LF]!).toBeCloseTo(rates[0]!.rate * dt, 12);
		expect(480 - vessel.stock[OX]!).toBeCloseTo(rates[1]!.rate * dt, 12);
	});

	test('uses the ambient pressure: lower thrust at sea level for the same flow', () => {
		const vessel = fakeVessel(fuel(400));
		vessel.control.throttle = 1;
		vessel.ambient.pressure = 101_325;
		const ctx = contextFor(ModuleEngine, engine, vessel);
		ModuleEngine.onStage?.(ctx);
		ModuleEngine.update?.(ctx, dt);
		expect(vessel.forces[0]!.force.y).toBeCloseTo((215_000 * 280) / 300, 6);
	});

	test('does nothing until ignited, at zero throttle, or after flameout', () => {
		const vessel = fakeVessel(fuel(400));
		vessel.control.throttle = 1;
		const ctx = contextFor(ModuleEngine, engine, vessel);
		ModuleEngine.update?.(ctx, dt); // cold
		ModuleEngine.onStage?.(ctx);
		vessel.control.throttle = 0;
		ModuleEngine.update?.(ctx, dt); // zero throttle
		expect(vessel.forces).toHaveLength(0);
		expect(vessel.stock[LF]).toBe(400);
	});

	test('propellant shortfall: partial thrust for the fraction drawn, then flameout event', () => {
		const vessel = fakeVessel({ [LF]: 0.05, [OX]: 100 });
		vessel.control.throttle = 1;
		const ctx = contextFor(ModuleEngine, engine, vessel);
		const flameouts: unknown[] = [];
		ctx.events.on('stock:engine-flameout', (e) => flameouts.push(e));
		ModuleEngine.onStage?.(ctx);
		ModuleEngine.update?.(ctx, dt);
		const full = engineOutput(engine, burning, 0).thrust;
		const f = vessel.forces[0]!.force.y;
		expect(f).toBeGreaterThan(0);
		expect(f).toBeLessThan(full);
		expect(vessel.stock[LF]).toBeCloseTo(0, 12);
		expect(ctx.state).toMatchObject({ ignited: false, flameout: true });
		expect(flameouts).toEqual([{ part: ctx.entity }]);
		ModuleEngine.update?.(ctx, dt); // flamed out: silent
		expect(vessel.forces).toHaveLength(1);
	});

	test('an empty tank flames out without thrust', () => {
		const vessel = fakeVessel({});
		vessel.control.throttle = 1;
		const ctx = contextFor(ModuleEngine, engine, vessel);
		ModuleEngine.onStage?.(ctx);
		ModuleEngine.update?.(ctx, dt);
		expect(vessel.forces).toHaveLength(0);
		expect(ctx.state.flameout).toBe(true);
	});
});

describe('decoupler and reaction wheel', () => {
	test('decoupler defaults, onStage fires once-and-stays and detaches the configured node', () => {
		const vessel = fakeVessel();
		const ctx = contextFor(ModuleDecoupler, {}, vessel);
		expect(ctx.config).toEqual({ separates: 'top', ejectionImpulse: 2_000 });
		expect(ctx.state.decoupled).toBe(false);
		ModuleDecoupler.onStage?.(ctx);
		ModuleDecoupler.onStage?.(ctx);
		expect(ModuleDecoupler.snapshot?.(ctx.state)).toEqual({ decoupled: true });
		expect(vessel.detached).toEqual([{ node: 'top', impulse: 2_000 }]);
	});

	test('decouple action and a bottom-separating config', () => {
		const vessel = fakeVessel();
		const ctx = contextFor(ModuleDecoupler, { separates: 'bottom', ejectionImpulse: 10 }, vessel);
		ModuleDecoupler.actions?.decouple?.(ctx);
		expect(vessel.detached).toEqual([{ node: 'bottom', impulse: 10 }]);
	});

	test('wheel torque follows the attitude demand and draws charge in proportion', () => {
		const vessel = fakeVessel({ 'stock.electric-charge': 10 });
		vessel.control.pitch = 0.5;
		const ctx = contextFor(ModuleReactionWheel, { torque: 5_000, chargeRate: 0.6 }, vessel);
		ModuleReactionWheel.update?.(ctx, 0.02);
		expect(vessel.torques).toEqual([{ x: 2_500, y: 0, z: 0 }]);
		expect(10 - vessel.stock['stock.electric-charge']!).toBeCloseTo(0.6 * 0.5 * 0.02, 12);
	});

	test('wheel: no demand, disabled, or no charge means no torque; partial charge scales it', () => {
		const vessel = fakeVessel({ 'stock.electric-charge': 0 });
		const ctx = contextFor(ModuleReactionWheel, { torque: 1_000, chargeRate: 1 }, vessel);
		ModuleReactionWheel.update?.(ctx, 0.02); // no demand
		vessel.control.yaw = 1;
		ModuleReactionWheel.update?.(ctx, 0.02); // no charge
		expect(vessel.torques).toHaveLength(0);
		vessel.stock['stock.electric-charge'] = 0.01; // half of the 0.02 needed
		ModuleReactionWheel.update?.(ctx, 0.02);
		expect(vessel.torques[0]!.z).toBeCloseTo(500, 9);
		ctx.state.enabled = false;
		ModuleReactionWheel.update?.(ctx, 0.02);
		expect(vessel.torques).toHaveLength(1);
	});

	test('resource container and command declare their generic roles', () => {
		const ctx = contextFor(ModuleResourceContainer, { contents: { [LF]: { capacity: 10 } } });
		const store = ModuleResourceContainer.store!;
		expect(store.resources(ctx.config, ctx.state)).toEqual([LF]);
		expect(store.amount(ctx.config, ctx.state, LF)).toBe(10);
		expect(store.withdraw(ctx.config, ctx.state, LF, 4)).toBe(4);
		expect(store.deposit(ctx.config, ctx.state, LF, 99)).toBe(4);
		expect(ModuleCommand.controlSource).toBe(true);
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

describe('landing leg', () => {
	const config = { spread: 2, drop: 0.4, footSize: 0.3, deployed: false };

	test('retracted it adds no boxes; deployed it adds four feet below the part, 2 m from the axis', () => {
		expect(landingLegColliders(config, { deployed: false })).toEqual([]);
		const feet = landingLegColliders(config, { deployed: true });
		expect(feet).toHaveLength(4);
		for (const f of feet) {
			expect(f.offset.y).toBe(-0.4);
			expect(Math.hypot(f.offset.x, f.offset.z)).toBe(2);
			expect(f.halfExtents).toEqual({ x: 0.15, y: 0.15, z: 0.15 });
		}
		expect(new Set(feet.map((f) => `${f.offset.x},${f.offset.z}`)).size).toBe(4);
	});

	test('deploy, retract, toggle and onStage change the state; the definition exposes colliders', () => {
		const ctx = contextFor(ModuleLandingLeg, {});
		expect(ctx.state.deployed).toBe(false);
		ModuleLandingLeg.actions!.deploy!(ctx);
		expect(ctx.state.deployed).toBe(true);
		ModuleLandingLeg.actions!.toggle!(ctx);
		expect(ctx.state.deployed).toBe(false);
		ModuleLandingLeg.onStage!(ctx);
		expect(ctx.state.deployed).toBe(true);
		expect(ModuleLandingLeg.colliders!(ctx.config, ctx.state)).toHaveLength(4);
		ModuleLandingLeg.actions!.retract!(ctx);
		expect(ModuleLandingLeg.colliders!(ctx.config, ctx.state)).toEqual([]);
		expect(ModuleLandingLeg.snapshot!(ctx.state)).toEqual({ deployed: false });
	});
});

describe('heat shield', () => {
	test('starts full, is the ablator store, and snapshots what is left', () => {
		const ctx = contextFor(ModuleHeatShield, {});
		expect(ctx.state.ablator).toBe(120);
		const store = ModuleHeatShield.store!;
		expect(store.resources(ctx.config, ctx.state)).toEqual(['stock.ablator']);
		expect(store.withdraw(ctx.config, ctx.state, 'stock.ablator', 20)).toBe(20);
		expect(store.withdraw(ctx.config, ctx.state, LF, 5)).toBe(0);
		expect(store.deposit(ctx.config, ctx.state, 'stock.ablator', 99)).toBe(20);
		expect(ModuleHeatShield.snapshot!(ctx.state)).toEqual({ ablator: 120 });
	});

	test('below the ablation temperature it absorbs nothing and burns nothing', () => {
		const ctx = contextFor(ModuleHeatShield, {});
		expect(ModuleHeatShield.absorbHeat!(ctx, { power: 1e6, temperature: 600 }, 0.02)).toBe(0);
		expect(ctx.state.ablator).toBe(120);
	});

	test('hot, it absorbs all the power and burns power*dt/heatOfAblation kg', () => {
		const ctx = contextFor(ModuleHeatShield, { heatOfAblation: 2e6 });
		const taken = ModuleHeatShield.absorbHeat!(ctx, { power: 1e6, temperature: 800 }, 2);
		expect(taken).toBe(1e6);
		expect(120 - ctx.state.ablator).toBeCloseTo(1, 12); // 1e6 W * 2 s / 2e6 J/kg
	});

	test('with little ablator left it absorbs only what the rest can carry, then nothing', () => {
		const ctx = contextFor(ModuleHeatShield, { ablator: 1, heatOfAblation: 1e6 });
		const taken = ModuleHeatShield.absorbHeat!(ctx, { power: 1e9, temperature: 800 }, 1);
		expect(taken).toBeCloseTo(1e6, 6); // 1 kg * 1e6 J/kg over 1 s
		expect(ctx.state.ablator).toBeCloseTo(0, 12);
		expect(ModuleHeatShield.absorbHeat!(ctx, { power: 1e9, temperature: 800 }, 1)).toBe(0);
	});
});

describe('module descriptors (ADR 0033)', () => {
	test('the engine describes the same thrust and flow as engineOutput, in vacuum and in air', () => {
		const cfg = engineConfigSchema.parse(engine);
		const info = describeModule(ModuleEngine, engine);
		const e = info?.engine;
		expect(e).toBeDefined();
		for (const p of [0, 25_000, SEA_LEVEL_PRESSURE, 2e5]) {
			const want = engineOutput(cfg, burning, p);
			expect(thrustAtPressure(e!.thrust, p) / want.thrust).toBeCloseTo(1, 12);
			expect(e!.massFlow / want.massFlow).toBeCloseTo(1, 12);
		}
		expect(e!.propellants).toEqual(engine.propellants);
		expect(e).toMatchObject({ ignited: false, flameout: false });
	});

	test('a live view supplies ignited and flameout; the decoupler names its node and whether it fired', () => {
		expect(
			describeModule(ModuleEngine, engine, { ignited: true, throttle: 1, flameout: false })?.engine
				?.ignited
		).toBe(true);
		expect(describeModule(ModuleDecoupler, {})?.separator).toEqual({ node: 'top', done: false });
		expect(
			describeModule(ModuleDecoupler, { separates: 'bottom' }, { decoupled: true })?.separator
		).toEqual({ node: 'bottom', done: true });
		// Containers describe only their catalogue category (plan 023).
		expect(describeModule(ModuleResourceContainer, { contents: {} })).toEqual({
			category: 'tanks'
		});
	});

	test('the engine reports the throttle of a live view, the fin its lifting plate, others their category (plan 023)', () => {
		expect(
			describeModule(ModuleEngine, engine, { ignited: true, throttle: 0.4, flameout: false })
				?.engine?.throttle
		).toBe(0.4);
		expect(describeModule(ModuleEngine, engine)?.category).toBe('propulsion');
		expect(describeModule(ModuleFin, { area: 2, centre: [0, 1, 0] })).toMatchObject({
			category: 'aero',
			lift: { area: 2, liftSlope: 2, crossflow: 1.2, centre: [0, 1, 0] }
		});
		expect(describeModule(ModuleCommand, undefined)?.category).toBe('command');
		expect(describeModule(ModuleReactionWheel, { torque: 100 })?.category).toBe('control');
	});
});

describe('stock.fin (ADR 0035)', () => {
	const config = finConfigSchema.parse({ area: 2, liftSlope: 2, crossflow: 1.2 });

	test('small angle: the force is the linear lift slope, -1/2 rho S C_La |v_p| v_n', () => {
		const rho = 1.2;
		const v = { x: 0, y: -100, z: 2 }; // 100 m/s along the chord, 2 m/s through the plate
		const speed = Math.hypot(100, 2);
		const expected =
			-0.5 * rho * speed * speed * 2 * (2 * (2 / speed) * (100 / speed) + 1.2 * (2 / speed) ** 2);
		expect(finNormalForce(config, v, rho)).toBeCloseTo(expected, 9);
		expect(finNormalForce(config, v, rho) / (-0.5 * rho * 2 * 2 * 100 * 2)).toBeCloseTo(1, 1);
	});

	test('no flow, no air and a flow in the plate plane give no force; the sign opposes the through-flow', () => {
		expect(finNormalForce(config, { x: 0, y: 0, z: 0 }, 1)).toBe(0);
		expect(finNormalForce(config, { x: 0, y: -50, z: 3 }, 0)).toBe(0);
		expect(finNormalForce(config, { x: 30, y: -50, z: 0 }, 1)).toBeCloseTo(0, 12);
		expect(finNormalForce(config, { x: 0, y: -50, z: 3 }, 1)).toBeLessThan(0);
		expect(finNormalForce(config, { x: 0, y: -50, z: -3 }, 1)).toBeGreaterThan(0);
	});

	test('broadside the plate stalls: the force is the cross-flow coefficient only', () => {
		const f = finNormalForce(config, { x: 0, y: 0, z: 40 }, 1);
		expect(f).toBeCloseTo(-0.5 * 1 * 40 * 40 * 2 * 1.2, 9);
	});

	test('update pushes along local Z at the centre of pressure, and nothing in vacuum', () => {
		const vessel = fakeVessel();
		vessel.ambient.density = 1;
		vessel.air = { x: 0, y: -80, z: 4 };
		const ctx = contextFor(ModuleFin, { area: 2, centre: [0.25, -0.1, 0] }, vessel);
		ModuleFin.update!(ctx, 0.02);
		expect(vessel.forces).toHaveLength(1);
		expect(vessel.forces[0]!.point).toEqual({ x: 0.25, y: -0.1, z: 0 });
		expect(vessel.forces[0]!.force.x).toBe(0);
		expect(vessel.forces[0]!.force.z).toBeLessThan(0);
		vessel.forces.length = 0;
		vessel.ambient.density = 0;
		ModuleFin.update!(ctx, 0.02);
		expect(vessel.forces).toHaveLength(0);
	});
});
