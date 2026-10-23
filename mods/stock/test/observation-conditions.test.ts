/** Plan 298: the telescope's observation needs its aperture door open and its tube within 5° of the target. */
import { describe, expect, test } from 'bun:test';
import { ModuleExperiment, PartTelescope } from '../src/index.ts';
import { contextFor, fakeVessel } from './helpers.ts';

/** A telescope in high orbit; `door` is the aperture door, `off` how far the tube is from its target, degrees. */
function telescope(door: boolean, off: number) {
	const stored: unknown[] = [];
	const rad = (off * Math.PI) / 180;
	const vessel = Object.assign(fakeVessel({ 'stock.electric-charge': 100 }), {
		situation: () => 'stock.space-high',
		sibling: (id: string) => (id === 'stock.animate' ? { open: door } : undefined),
		targetDirection: () => ({ x: Math.sin(rad), y: Math.cos(rad), z: 0 }),
		science: {
			result: () => ({ subject: 'stock.observation@stock.space-high:stock.home', value: 8 }),
			credit: () => {}
		},
		data: { store: (item: unknown) => void stored.push(item), used: () => 0, capacity: () => 1e9 }
	});
	const config = PartTelescope.modules!.find(([m]) => m === ModuleExperiment.id)![1] as never;
	return { ctx: contextFor(ModuleExperiment, config, vessel), stored, vessel };
}
const run = (ctx: ReturnType<typeof telescope>['ctx'], seconds: number) => {
	for (let i = 0; i < Math.round(seconds / 0.02); i++) ModuleExperiment.update!(ctx, 0.02);
};

describe('the telescope observation (plan 298)', () => {
	test('with the door closed it is refused, with the reason', () => {
		const { ctx } = telescope(false, 0);
		ModuleExperiment.actions!.run!(ctx);
		expect(ctx.state.status).toBe('INVALID');
		expect(ctx.state.reason).toMatch(/door is closed/);
	});

	test('with the door open and the tube 10° off the target it is refused', () => {
		const { ctx } = telescope(true, 10);
		ModuleExperiment.actions!.run!(ctx);
		expect(ctx.state.status).toBe('INVALID');
		expect(ctx.state.reason).toMatch(/10° off its target; needs within 5°/);
	});

	test('with the door open and the tube within 5° it runs and stores a result', () => {
		const { ctx, stored } = telescope(true, 4);
		ModuleExperiment.actions!.run!(ctx);
		expect(ctx.state.status).toBe('RUNNING');
		run(ctx, 31);
		expect(ctx.state.status).toBe('READY');
		expect(stored).toHaveLength(1);
	});

	test('a run stops when the door closes or the tube swings off, and the progress is lost', () => {
		const a = telescope(true, 0);
		ModuleExperiment.actions!.run!(a.ctx);
		run(a.ctx, 10);
		expect(a.ctx.state.progress).toBeGreaterThan(0.2);
		(a.vessel as { sibling: unknown }).sibling = () => ({ open: false });
		run(a.ctx, 0.04);
		expect(a.ctx.state.status).toBe('INVALID');
		expect(a.ctx.state.progress).toBe(0);
		const b = telescope(true, 0);
		ModuleExperiment.actions!.run!(b.ctx);
		run(b.ctx, 10);
		(b.vessel as { targetDirection: unknown }).targetDirection = () => ({ x: 1, y: 0, z: 0 });
		run(b.ctx, 0.04);
		expect(b.ctx.state.status).toBe('INVALID');
		expect(b.ctx.state.reason).toMatch(/90° off/);
	});

	test('the other experiments are unchanged: a magnetometer runs with no door and no pointing', () => {
		const { ctx } = telescope(false, 90);
		(ctx.config as { experiment: string }).experiment = 'stock.magnetometer';
		ModuleExperiment.actions!.run!(ctx);
		expect(ctx.state.status).toBe('RUNNING');
	});
});
