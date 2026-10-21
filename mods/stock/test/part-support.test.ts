/** Part-support modules (plan 302): open/close, bay doors, fuel cell, a single leg, staged panels. */
import { describe, expect, test } from 'bun:test';
import {
	ElectricCharge,
	LiquidFuel,
	ModuleAnimate,
	ModuleBay,
	ModuleFuelCell,
	ModuleSolarPanel,
	Oxidizer,
	landingLegColliders
} from '../src/index.ts';
import { contextFor, fakeVessel } from './helpers.ts';

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
