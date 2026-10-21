/** Lights (plans 242 and 311, ADR 0239): the toggle, the group, the colours, the charge drain. */
import { describe, expect, test } from 'bun:test';
import { ElectricCharge, LIGHT_COLOURS, ModuleLight } from '../src/index.ts';
import { contextFor, fakeVessel, loaded } from './helpers.ts';

const EC = ElectricCharge.id;

describe('stock.light', () => {
	test('is in the Lights group, starts off, and the toggle switches it', () => {
		const ctx = contextFor(ModuleLight, {}, fakeVessel({ [EC]: 10 }));
		const toggle = ModuleLight.describe!(ctx.config, ctx.state).actions!.find(
			(a) => a.id === 'setOn'
		)!;
		expect(toggle.group).toBe('stock.lights');
		expect(toggle.kind).toBe('toggle');
		expect(toggle.value).toBe(false);
		expect(loaded.registries.actionGroups.get('stock.lights')).toBeDefined();
		ModuleLight.actions!.setOn!(ctx, true);
		expect(ctx.state.on).toBe(true);
		expect(ModuleLight.snapshot!(ctx.state)).toMatchObject({
			on: true,
			colour: LIGHT_COLOURS.warm
		});
	});

	test('draws charge while on, scaled by brightness, and nothing while off', () => {
		const vessel = fakeVessel({ [EC]: 10 });
		const ctx = contextFor(ModuleLight, { drain: 0.1 }, vessel);
		ModuleLight.update!(ctx, 10);
		expect(vessel.stock[EC]).toBe(10);
		ModuleLight.actions!.setOn!(ctx, true);
		ModuleLight.update!(ctx, 10);
		expect(vessel.stock[EC]).toBeCloseTo(9, 9);
		ModuleLight.actions!.setBrightness!(ctx, 0.5);
		ModuleLight.background!(ctx, 10);
		expect(vessel.stock[EC]).toBeCloseTo(8.5, 9);
	});

	test('goes out when the vessel has no charge left to give', () => {
		const vessel = fakeVessel({ [EC]: 0 });
		const ctx = contextFor(ModuleLight, { drain: 0.1, on: true }, vessel);
		expect(ctx.state.on).toBe(true);
		ModuleLight.update!(ctx, 1);
		expect(ctx.state.on).toBe(false);
	});

	test('colour is one of the named ones; a stranger and a brightness out of range are refused', () => {
		const ctx = contextFor(ModuleLight, {});
		ModuleLight.actions!.setColour!(ctx, 'red');
		expect(ModuleLight.snapshot!(ctx.state)).toMatchObject({ colour: LIGHT_COLOURS.red });
		expect(() => ModuleLight.actions!.setColour!(ctx, 'plaid')).toThrow();
		expect(() => ModuleLight.actions!.setBrightness!(ctx, 2)).toThrow();
	});

	test('the power budget counts a lamp that starts on', () => {
		const on = contextFor(ModuleLight, { drain: 0.08, on: true, brightness: 0.5 });
		expect(ModuleLight.power!(on.config).rate).toBeCloseTo(-0.04, 9);
		expect(ModuleLight.power!(contextFor(ModuleLight, {}).config).rate).toBe(0);
	});

	test('the parts are in the catalogue and unlocked by the electrics node', () => {
		for (const id of ['stock.light-spot', 'stock.light-flood']) {
			const part = loaded.registries.parts.get(id)!;
			expect(part.visual?.lamp?.module).toBe(ModuleLight.id);
			expect(part.attach?.radial).toBeDefined();
			expect(loaded.registries.techNodes.get('stock.power')!.unlocks).toContain(id);
		}
	});

	// owner, 2026-10-21: a flying vessel's panel reads the snapshot view, whose colour is a hex
	test('the panel described from a live snapshot is valid: the colour reads as its name', () => {
		const ctx = contextFor(ModuleLight, { colour: 'red', blink: true }, fakeVessel({ [EC]: 10 }));
		const view = ModuleLight.snapshot!(ctx.state) as typeof ctx.state;
		const colour = ModuleLight.describe!(ctx.config, view).actions!.find(
			(a) => a.id === 'setColour'
		)!;
		expect(colour.value).toBe('red');
		expect(colour.options!.map((o) => o.value)).toContain(colour.value as string);
	});
});
