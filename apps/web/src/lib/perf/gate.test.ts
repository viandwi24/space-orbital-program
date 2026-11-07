import { describe, expect, it } from 'vitest';
import {
	budgetFor,
	failures,
	formatSoakTable,
	formatTable,
	freeze,
	freezeSoak,
	percentile,
	soakBudgetFor,
	soakFailures,
	summarizeFrames,
	summarizeSoak,
	type Budgets,
	type GcEvent,
	type SceneRun,
	type SoakRun
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

describe('the soak (plan 418)', () => {
	const soakBase = {
		scene: 'pad' as const,
		backend: 'webgpu' as const,
		governor: 'off' as const,
		targetHz: 120
	};
	// 60 s at 8.33 ms, with a 30 ms frame twice
	const intervals = [...Array(7000).fill(8.33), 30, 31];
	const sawtooth = Array.from({ length: 600 }, (_, i) => 100 + (i % 50));

	it('reads the heap growth off the floor, so a sawtooth is not growth', () => {
		const s = summarizeSoak({ ...soakBase, intervals, heapMb: sawtooth, seconds: 60 });
		expect(s.heapGrowthMb).toBe(0);
		const leak = Array.from({ length: 600 }, (_, i) => 100 + (i % 50) + i * 0.1);
		const l = summarizeSoak({ ...soakBase, intervals, heapMb: leak, seconds: 60 });
		expect(l.heapGrowthMb).toBeGreaterThan(40);
	});

	it('counts the long frames a minute and the share over the interval', () => {
		const s = summarizeSoak({ ...soakBase, intervals, heapMb: sawtooth, seconds: 60 });
		expect(s.longPerMinute).toBe(2);
		expect(s.overIntervalShare).toBeCloseTo(2 / 7002, 5);
		expect(s.maxMs).toBe(31);
		expect(s.frames).toBe(7002);
	});

	it('takes the allocation rate and the major GCs from the collections when the trace has them', () => {
		const gcs: GcEvent[] = [
			{ major: false, beforeMb: 120, afterMb: 100 },
			{ major: true, beforeMb: 220, afterMb: 110 },
			{ major: false, beforeMb: 150, afterMb: 130 }
		];
		const s = summarizeSoak({ ...soakBase, intervals, heapMb: [100, 140, 160], seconds: 10, gcs });
		// 20 up to the first, 120 to the second, 40 to the third, 30 after the last (160 - 130)
		expect(s.allocMbPerS).toBeCloseTo((20 + 120 + 40 + 30) / 10, 5);
		expect(s.majorGcs).toBe(1);
		expect(s.minorGcs).toBe(2);
		expect(s.majorGcPerMinute).toBe(6);
	});

	it('falls back to the rises of the samples without a trace', () => {
		const s = summarizeSoak({ ...soakBase, intervals, heapMb: [100, 110, 105, 120], seconds: 5 });
		expect(s.allocMbPerS).toBeCloseTo((10 + 15) / 5, 5);
		expect(s.majorGcs).toBe(0);
	});

	const soakRun = (over: Partial<SoakRun> = {}): SoakRun => ({
		...summarizeSoak({ ...soakBase, intervals, heapMb: sawtooth, seconds: 60 }),
		longPerMinute: 0,
		...over
	});
	const budgets: Budgets = {
		basis: 'measured',
		margin: 0.1,
		tiers: {
			m5: {
				default: {},
				soak: {
					default: { heapGrowthMb: 10, allocMbPerS: 20, majorGcPerMinute: 2, longPerMinute: 0 },
					scenes: { orbit: { allocMbPerS: 5 } }
				}
			}
		}
	};

	it('lays a scene limit over the soak default', () => {
		expect(soakBudgetFor(budgets, 'm5', 'orbit')).toEqual({
			heapGrowthMb: 10,
			allocMbPerS: 5,
			majorGcPerMinute: 2,
			longPerMinute: 0
		});
		expect(soakBudgetFor(budgets, 'm2', 'pad')).toEqual({});
	});

	it('names every limit a soak is over, and applies the margin to the heap and the rate only', () => {
		const b = soakBudgetFor(budgets, 'm5', 'pad');
		expect(soakFailures(soakRun({ allocMbPerS: 21 }), b, budgets.margin)).toEqual([]);
		expect(soakFailures(soakRun({ allocMbPerS: 23 }), b, budgets.margin)).toHaveLength(1);
		const bad = soakFailures(
			soakRun({ heapGrowthMb: 30, allocMbPerS: 50, majorGcPerMinute: 5, longPerMinute: 3 }),
			b,
			budgets.margin
		);
		expect(bad).toHaveLength(4);
		expect(bad.join(' ')).toContain('major GCs');
		expect(bad.join(' ')).toContain('long frames');
		expect(soakFailures(soakRun({ allocMbPerS: 900 }), {}, budgets.margin)).toEqual([]);
	});

	it('freezes soak runs into budgets that the same runs pass', () => {
		const runs = [soakRun({ allocMbPerS: 17.2 }), soakRun({ scene: 'orbit', allocMbPerS: 3.1 })];
		const frozen: Budgets = {
			basis: 'measured',
			margin: 0.1,
			tiers: { m5: { default: {}, soak: { default: {}, scenes: freezeSoak(runs) } } }
		};
		for (const r of runs)
			expect(soakFailures(r, soakBudgetFor(frozen, 'm5', r.scene), frozen.margin)).toEqual([]);
	});

	it('prints a row per soak run with the failures beside it', () => {
		const text = formatSoakTable([soakRun(), soakRun({ scene: 'orbit' })], (r) =>
			r.scene === 'orbit' ? ['leaks'] : []
		);
		const lines = text.split('\n');
		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain('alloc MB/s');
		expect(lines[2]).toContain('ok');
		expect(lines[3]).toContain('FAIL: leaks');
	});
});
