import { describe, expect, test } from 'bun:test';
import {
	PrecompileTracker,
	precompileLabel,
	type PrecompileProgress
} from '../src/precompile-progress.ts';

describe('precompile progress (plan 038)', () => {
	test('counts units, never reaches 1 before complete, and complete makes done equal total', () => {
		const t = new PrecompileTracker();
		const seen: PrecompileProgress[] = [];
		t.subscribe((p) => seen.push(p));
		expect(seen[0]).toEqual({ done: 0, total: 0, stage: 'programs', fraction: 0 });
		t.expect(10);
		for (let i = 0; i < 10; i++) t.finish();
		expect(t.progress().done).toBe(10);
		expect(t.progress().fraction).toBeLessThan(1); // not complete until told
		t.setStage('maps');
		t.expect(2);
		expect(t.progress().fraction).toBeCloseTo(10 / 12, 9);
		t.finish(2);
		t.complete();
		const last = t.progress();
		expect(last).toEqual({ done: 12, total: 12, stage: 'done', fraction: 1 });
		expect(t.isComplete).toBe(true);
		// monotone fractions
		for (let i = 1; i < seen.length; i++) {
			if (seen[i]!.total === seen[i - 1]!.total) {
				expect(seen[i]!.fraction).toBeGreaterThanOrEqual(seen[i - 1]!.fraction);
			}
		}
		// after complete nothing moves
		t.expect(5);
		t.finish(5);
		expect(t.progress()).toEqual(last);
	});

	test('finish never counts past the total, and a stopped listener hears nothing', () => {
		const t = new PrecompileTracker();
		let calls = 0;
		const stop = t.subscribe(() => calls++);
		t.expect(2);
		t.finish(5);
		expect(t.progress().done).toBe(2);
		stop();
		const before = calls;
		t.finish();
		t.expect(1);
		expect(calls).toBe(before);
	});

	test('every stage has a label', () => {
		for (const s of ['programs', 'maps', 'vegetation', 'done'] as const) {
			expect(precompileLabel(s).length).toBeGreaterThan(3);
		}
	});
});
