import { describe, expect, test } from 'vitest';
import { PrecompileTracker } from '@orbital/renderer/precompile-progress';
import { graphicsBadge } from './graphics-progress';

describe('graphics badge (plan 038)', () => {
	test('nothing to show before the work is planned or after it is done', () => {
		expect(graphicsBadge(null)).toBeNull();
		const t = new PrecompileTracker();
		expect(graphicsBadge(t.progress())).toBeNull();
		t.expect(4);
		expect(graphicsBadge(t.progress())).not.toBeNull();
		t.finish(4);
		t.complete();
		expect(graphicsBadge(t.progress())).toBeNull();
	});

	test('the percentage follows the work and stays under 100 until it is done', () => {
		const t = new PrecompileTracker();
		t.expect(8);
		const seen: number[] = [];
		for (let i = 0; i < 8; i++) {
			t.finish();
			seen.push(graphicsBadge(t.progress())!.percent);
		}
		expect(seen[0]).toBe(12);
		expect(seen[3]).toBe(50);
		expect(seen[7]).toBeLessThan(100);
		for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
	});

	test('the label names the stage', () => {
		const t = new PrecompileTracker();
		t.expect(2);
		const programs = graphicsBadge(t.progress())!.label;
		t.setStage('vegetation');
		const scenery = graphicsBadge(t.progress())!.label;
		expect(programs).toMatch(/program/i);
		expect(scenery).toMatch(/scenery/i);
		expect(programs).not.toBe(scenery);
	});
});
