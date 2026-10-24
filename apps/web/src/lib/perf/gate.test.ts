import { describe, expect, it } from 'vitest';
import {
	budgetFor,
	failures,
	formatTable,
	freeze,
	percentile,
	summarizeFrames,
	type Budgets,
	type SceneRun
} from './gate';
import budgetFile from '../../../perf-budgets.json';

const run = (over: Partial<SceneRun> = {}): SceneRun => ({
	scene: 'pad',
	backend: 'webgpu',
	governor: 'off',
	frames: 600,
	seconds: 10,
	p50: 8.3,
	p95: 8.6,
	longPerMinute: 0,
	compilesInPlay: 0,
	heapMin: 300,
	heapMax: 315,
	...over
});

describe('summarizeFrames', () => {
	it('takes percentiles and counts frames over twice the target interval', () => {
		const intervals = [...Array.from({ length: 98 }, () => 8.3), 30, 40];
		const s = summarizeFrames(intervals, 60, 120);
		expect(s.frames).toBe(100);
		expect(s.p50).toBe(8.3);
		expect(s.p95).toBe(8.3);
		// 30 and 40 ms are over 2 × 8.33 ms, in a minute
		expect(s.longPerMinute).toBe(2);
	});

	it('percentile uses the nearest rank and 0 for nothing', () => {
		expect(percentile([], 0.5)).toBe(0);
		expect(percentile([5, 1, 3], 0.5)).toBe(3);
		expect(percentile([1, 2, 3, 4], 0.95)).toBe(4);
	});
});

describe('the budgets', () => {
	const budgets = budgetFile as unknown as Budgets;

	it('the checked-in file holds a default for every tier', () => {
		for (const tier of ['m5', 'm2', 'windows'] as const) {
			const b = budgetFor(budgets, tier, 'pad');
			expect(b.p95Ms).toBeGreaterThan(0);
			expect(b.longPerMinute).toBe(0);
			expect(b.compilesInPlay).toBe(0);
		}
		expect(budgetFor(budgets, 'm5', 'pad').p95Ms).toBeLessThan(
			budgetFor(budgets, 'm2', 'pad').p95Ms!
		);
	});

	it('a scene limit lays over the tier default', () => {
		const b: Budgets = {
			basis: 'target',
			margin: 0.1,
			tiers: {
				m2: { default: { p95Ms: 16.7, heapRangeMb: 30 }, scenes: { orbit: { p95Ms: 12 } } }
			}
		};
		expect(budgetFor(b, 'm2', 'orbit')).toEqual({ p95Ms: 12, heapRangeMb: 30 });
		expect(budgetFor(b, 'm2', 'pad')).toEqual({ p95Ms: 16.7, heapRangeMb: 30 });
		expect(budgetFor(b, 'm5', 'pad')).toEqual({});
	});

	it('passes a run inside the margin and names each limit it is over', () => {
		const budget = budgetFor(budgets, 'm5', 'pad');
		expect(failures(run(), budget, budgets.margin)).toEqual([]);
		// 8.3 ms plus 10 % is 9.13 ms
		expect(failures(run({ p95: 9.1 }), budget, budgets.margin)).toEqual([]);
		expect(failures(run({ p95: 9.3 }), budget, budgets.margin)).toHaveLength(1);
		const bad = failures(
			run({ p95: 12, longPerMinute: 3, compilesInPlay: 2, heapMax: 400 }),
			budget,
			budgets.margin
		);
		expect(bad).toHaveLength(4);
		expect(bad.join(' ')).toContain('long frames');
		expect(bad.join(' ')).toContain('compiled in play');
	});

	it('freezes a measured run into budgets that the same run passes', () => {
		const runs = [run({ p95: 9, longPerMinute: 1.2 }), run({ scene: 'orbit', p95: 7.5 })];
		const frozen = freeze(runs, 'm5', 0.1);
		expect(frozen.basis).toBe('measured');
		for (const r of runs)
			expect(failures(r, budgetFor(frozen, 'm5', r.scene), frozen.margin)).toEqual([]);
		// a quiet scene is held to the tier's interval at least, not to its own lucky p95
		expect(budgetFor(frozen, 'm5', 'orbit').p95Ms).toBeGreaterThanOrEqual(8.3);
	});
});

describe('formatTable', () => {
	it('prints a row per run with the failures beside it', () => {
		const text = formatTable([run(), run({ scene: 'orbit', p95: 20 })], (r) =>
			r.p95 > 10 ? ['slow'] : []
		);
		const lines = text.split('\n');
		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain('p95 ms');
		expect(lines[2]).toContain('ok');
		expect(lines[3]).toContain('FAIL: slow');
	});
});
