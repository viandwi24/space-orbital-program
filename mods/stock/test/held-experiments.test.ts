/** Goo and Materials Bay (plan 210): the result stays in the part; View, Transmit, Reset. */
import { describe, expect, test } from 'bun:test';
import { ModuleExperiment, PartGooCanister, PartMaterialsBay } from '../src/index.ts';
import { contextFor, fakeVessel } from './helpers.ts';

function goo() {
	const stored: Array<{ subject?: string; value: number; meta?: Record<string, unknown> }> = [];
	const vessel = Object.assign(fakeVessel({ 'stock.electric-charge': 100 }), {
		situation: () => 'stock.space-low',
		science: {
			result: () => ({ subject: 'stock.goo@stock.space-low:stock.home', value: 6 }),
			credit: (_subject: string, _value: number) => {}
		},
		data: {
			store: (item: (typeof stored)[number]) => void stored.push(item),
			used: () => 0,
			capacity: () => 0
		}
	});
	const config = PartGooCanister.modules!.find(([m]) => m === ModuleExperiment.id)![1] as never;
	return { ctx: contextFor(ModuleExperiment, config, vessel), stored };
}

const actionsOf = (ctx: ReturnType<typeof goo>['ctx']) =>
	Object.fromEntries(
		ModuleExperiment.describe!(ctx.config, ctx.state)!.actions!.map((a) => [a.id, a.enabled])
	);

describe('held experiments (plan 210)', () => {
	test('a run keeps its result in the part; transmit stores it once and leaves the part spent', () => {
		const { ctx, stored } = goo();
		ModuleExperiment.actions!.run!(ctx);
		for (let i = 0; i < 200; i++) ModuleExperiment.update!(ctx, 0.02);
		expect(ctx.state.result).toMatchObject({ value: 6 });
		expect(stored).toHaveLength(0);
		expect(actionsOf(ctx)).toEqual({ run: false, view: true, transmit: true, reset: true });
		expect(ModuleExperiment.snapshot!(ctx.state)).toMatchObject({ result: { value: 6 } });
		ModuleExperiment.actions!.view!(ctx);
		expect(ctx.state.result).toMatchObject({ value: 6 });
		ModuleExperiment.actions!.transmit!(ctx);
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({ value: 6, meta: { transmitFactor: 0.3 } });
		expect(ctx.state.spent).toBe(true);
		expect(actionsOf(ctx)).toEqual({ run: false, view: false, transmit: false, reset: true });
		// spent: a run is refused until reset
		ModuleExperiment.actions!.run!(ctx);
		expect(ctx.state.status).toBe('INVALID');
		ModuleExperiment.actions!.reset!(ctx);
		expect(ctx.state.status).toBe('READY');
		expect(actionsOf(ctx).run).toBe(true);
	});

	test('recovery credits a held result in full', () => {
		const { ctx } = goo();
		const credited: number[] = [];
		(ctx.vessel.science as { credit: (s: string, v: number) => void }).credit = (_s, v) =>
			void credited.push(v);
		ModuleExperiment.actions!.run!(ctx);
		for (let i = 0; i < 200; i++) ModuleExperiment.update!(ctx, 0.02);
		ModuleExperiment.onRecover!(ctx);
		expect(credited).toEqual([6]);
	});

	test('both parts hold their results', () => {
		for (const part of [PartGooCanister, PartMaterialsBay]) {
			const config = part.modules!.find(([m]) => m === ModuleExperiment.id)![1] as {
				held: boolean;
			};
			expect(config.held, part.id).toBe(true);
		}
	});
});
