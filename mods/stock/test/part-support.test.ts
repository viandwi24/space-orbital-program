/** Part-support modules (plan 302): open/close, bay doors, fuel cell, a single leg, staged panels. */
import { describe, expect, test } from 'bun:test';
import {
	ElectricCharge,
	LiquidFuel,
	ModuleAnimate,
	ModuleAntenna,
	ModuleBay,
	ModuleExperiment,
	ModuleFuelCell,
	ModuleSolarPanel,
	Oxidizer,
	landingLegColliders
} from '../src/index.ts';
import { contextFor, fakeVessel, loaded } from './helpers.ts';

describe('stock.animate (plan 302)', () => {
	test('opens and closes by action; staging opens it only when stageable', () => {
		const ctx = contextFor(ModuleAnimate, { label: 'Aperture door' });
		expect(ctx.state.open).toBe(false);
		ModuleAnimate.actions!.setOpen!(ctx, true);
		expect(ctx.state.open).toBe(true);
		ModuleAnimate.actions!.close!(ctx);
		expect(ctx.state.open).toBe(false);
		ModuleAnimate.onStage!(ctx);
		expect(ctx.state.open).toBe(false);
		const staged = contextFor(ModuleAnimate, { stageable: true });
		ModuleAnimate.onStage!(staged);
		expect(staged.state.open).toBe(true);
	});
});

describe('stock.bay (plan 302, ADR 0261)', () => {
	const profile = [
		{ y: -1, r: 1 },
		{ y: 1, r: 1 }
	];
	test('a closed bay is a shell; open, it shields nothing', () => {
		const ctx = contextFor(ModuleBay, { profile });
		expect(ModuleBay.shell!(ctx.config, ctx.state)).toEqual(profile);
		ModuleBay.actions!.open!(ctx);
		expect(ModuleBay.shell!(ctx.config, ctx.state)).toBeNull();
	});
});

describe('stock.fuel-cell (plan 302)', () => {
	test('running, it turns LF and Ox into EC at its rate; idle or dry, nothing', () => {
		const vessel = fakeVessel({ [LiquidFuel.id]: 10, [Oxidizer.id]: 10, [ElectricCharge.id]: 0 });
		const ctx = contextFor(ModuleFuelCell, { rate: 2 }, vessel);
		ModuleFuelCell.update!(ctx, 1);
		expect(vessel.stock[ElectricCharge.id]).toBe(0);
		ModuleFuelCell.actions!.start!(ctx);
		ModuleFuelCell.update!(ctx, 10);
		expect(vessel.stock[ElectricCharge.id]).toBeCloseTo(20, 9);
		expect(vessel.stock[LiquidFuel.id]).toBeCloseTo(10 - 20 * 0.0016875, 9);
		expect(vessel.stock[Oxidizer.id]).toBeCloseTo(10 - 20 * 0.0020625, 9);
		const dry = fakeVessel({ [LiquidFuel.id]: 0, [Oxidizer.id]: 5 });
		const c2 = contextFor(ModuleFuelCell, { running: true }, dry);
		ModuleFuelCell.update!(c2, 1);
		expect(dry.stock[ElectricCharge.id] ?? 0).toBe(0);
		expect(dry.stock[Oxidizer.id]).toBe(5);
		expect(c2.state.starved).toBe(true);
	});
});

describe('a single landing leg (plan 302)', () => {
	test('one foot out along +X when deployed, none retracted', () => {
		const config = { spread: 1.2, drop: 0.8, footSize: 0.3, layout: 'single' as const };
		expect(landingLegColliders(config, { deployed: false })).toEqual([]);
		const feet = landingLegColliders(config, { deployed: true });
		expect(feet).toHaveLength(1);
		expect(feet[0]!.offset).toEqual({ x: 1.2, y: -0.8, z: 0 });
		expect(
			landingLegColliders({ spread: 2, drop: 0.4, footSize: 0.3 }, { deployed: true })
		).toHaveLength(4);
	});
});

describe('a stageable solar panel (plan 302)', () => {
	test('staging unfolds a stageable panel only', () => {
		const a = contextFor(ModuleSolarPanel, { stageable: true });
		ModuleSolarPanel.onStage!(a);
		expect(a.state.deployed).toBe(true);
		const b = contextFor(ModuleSolarPanel, {});
		ModuleSolarPanel.onStage!(b);
		expect(b.state.deployed).toBe(false);
	});
});

describe('deployables break in strong airflow (plan 280)', () => {
	/** A vessel in air of `density` kg/m³ moving at `speed` m/s: q = 0.5 ρ v². */
	const inAir = (density: number, speed: number) => {
		const vessel = fakeVessel();
		vessel.ambient.density = density;
		vessel.air = { x: 0, y: speed, z: 0 };
		return vessel;
	};

	test('a deployed folding array above its break pressure breaks and gives nothing; folded, it survives', () => {
		// 0.5 * 0.5 * 400² = 40 kPa: the array breaks above 30 kPa
		const deployed = contextFor(
			ModuleSolarPanel,
			{ breakQ: 30_000, deployed: true },
			inAir(0.5, 400)
		);
		ModuleSolarPanel.update!(deployed, 0.02);
		expect(deployed.state.broken).toBe(true);
		expect(deployed.state.deployed).toBe(false);
		expect(deployed.vessel.resources.amount('stock.electric-charge')).toBe(0);
		// it cannot be deployed again, by action or by staging
		ModuleSolarPanel.actions!.setDeployed!(deployed, true);
		ModuleSolarPanel.actions!.deploy!(deployed);
		ModuleSolarPanel.onStage!(deployed);
		expect(deployed.state.deployed).toBe(false);
		const info = ModuleSolarPanel.describe!(deployed.config, deployed.state as never);
		expect(JSON.stringify(info)).toContain('Broken by the airflow');
		expect(ModuleSolarPanel.snapshot!(deployed.state)).toMatchObject({ broken: true });

		const folded = contextFor(ModuleSolarPanel, { breakQ: 30_000 }, inAir(0.5, 400));
		ModuleSolarPanel.update!(folded, 0.02);
		expect(folded.state.broken).toBeUndefined();
	});

	test('a deployed panel in gentle air, or one with no break pressure, keeps working', () => {
		const gentle = contextFor(
			ModuleSolarPanel,
			{ breakQ: 30_000, deployed: true },
			inAir(0.5, 100)
		);
		ModuleSolarPanel.update!(gentle, 0.02);
		expect(gentle.state.broken).toBeUndefined();
		expect(gentle.state.deployed).toBe(true);
		const sturdy = contextFor(ModuleSolarPanel, { deployed: true }, inAir(0.5, 400));
		ModuleSolarPanel.update!(sturdy, 0.02);
		expect(sturdy.state.broken).toBeUndefined();
	});

	test('a deployed dish breaks and switches off for good; stowed (disabled), it survives', () => {
		const on = contextFor(
			ModuleAntenna,
			{ antenna: 'stock.dish', breakQ: 20_000 },
			inAir(0.5, 400)
		);
		ModuleAntenna.update!(on, 0.02);
		expect(on.state.broken).toBe(true);
		expect(on.state.enabled).toBe(false);
		ModuleAntenna.actions!.setEnabled!(on, true);
		expect(on.state.enabled).toBe(false);
		expect(ModuleAntenna.antenna!(on.config, on.state)).toMatchObject({ enabled: false });
		const stowed = contextFor(
			ModuleAntenna,
			{ antenna: 'stock.dish', breakQ: 20_000 },
			inAir(0.5, 400)
		);
		stowed.state.enabled = false;
		ModuleAntenna.update!(stowed, 0.02);
		expect(stowed.state.broken).toBeUndefined();
	});

	test('the stock deployables carry break pressures; the retracted fixed panels do not', () => {
		const get = (id: string) => loaded.registries.parts.get(id)!;
		const breakQ = (id: string, mod: string) =>
			(get(id).modules!.find(([m]) => m === mod)![1] as { breakQ?: number }).breakQ;
		expect(breakQ('stock.solar-fold', 'stock.solar-panel')).toBe(40_000);
		expect(breakQ('stock.solar-wings', 'stock.solar-panel')).toBe(30_000);
		expect(breakQ('stock.solar-array-xl', 'stock.solar-panel')).toBe(25_000);
		expect(breakQ('stock.antenna-dish-fold', 'stock.antenna')).toBe(20_000);
		expect(breakQ('stock.solar-flat', 'stock.solar-panel')).toBeUndefined();
	});
});

describe('the scanning arm (plan 283)', () => {
	const armed = (found: boolean) => {
		const vessel = fakeVessel({ 'stock.electric-charge': 10 });
		vessel.situation = () => 'stock.landed';
		const asked: Array<{ reach: number; point?: { x: number; y: number; z: number } }> = [];
		vessel.nearestFeature = (reach, point) => {
			asked.push(point ? { reach, point } : { reach });
			return found
				? { id: 'stock.cinder:0:3:4', kind: 'rock', distance: 1, radius: 0.3 }
				: undefined;
		};
		vessel.science.result = (experiment) => ({ subject: `${experiment}@landed@cinder`, value: 8 });
		const stored: unknown[] = [];
		vessel.data.store = (item) => (stored.push(item), 'item-1');
		const ctx = contextFor(
			ModuleExperiment,
			{ experiment: 'stock.rock-study', reach: 2.6, tip: [-0.06, -0.9, 0] },
			vessel
		);
		return { ctx, asked, stored };
	};

	test('a rock within reach of the tip lets the study run and yield a result', () => {
		const { ctx, asked, stored } = armed(true);
		ModuleExperiment.actions!.run!(ctx);
		expect(ctx.state.status).toBe('RUNNING');
		expect(asked[0]).toEqual({ reach: 2.6, point: { x: -0.06, y: -0.9, z: 0 } });
		for (let i = 0; i < 200 && ctx.state.status === 'RUNNING'; i++)
			ModuleExperiment.update!(ctx, 0.1);
		expect(ctx.state.status).toBe('READY');
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({ subject: 'stock.rock-study@landed@cinder', value: 8 });
	});

	test('no rock in reach: nothing runs and nothing is stored', () => {
		const { ctx, stored } = armed(false);
		ModuleExperiment.actions!.run!(ctx);
		expect(ctx.state.status).toBe('INVALID');
		expect(ctx.state.reason).toContain('no rock within reach');
		expect(stored).toHaveLength(0);
	});

	test('the arms and the seat are parts with their own reach and a crew seat', () => {
		const get = (id: string) => loaded.registries.parts.get(id)!;
		const reach = (id: string) =>
			(get(id).modules!.find(([m]) => m === 'stock.experiment')![1] as { reach: number }).reach;
		expect(reach('stock.scan-arm-s')).toBeLessThan(reach('stock.scan-arm-m'));
		expect(reach('stock.scan-arm-m')).toBeLessThan(reach('stock.scan-arm-l'));
		expect(get('stock.seat-external').crewCapacity).toBe(1);
		expect(get('stock.seat-external').modules?.some(([m]) => m === 'stock.command')).toBe(false);
	});
});
