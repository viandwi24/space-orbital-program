import { describe, expect, it } from 'vitest';
import { noStages, reduceStages, stagesFiredBy } from './stage-state';

const ev = (vessel: number, stage: number) => ({ kind: 'stage' as const, vessel, stage });

describe('stage progress', () => {
	it('counts stage + 1 for the vessel that fired and ignores the others', () => {
		let p = reduceStages(noStages, ev(3, 0));
		expect(stagesFiredBy(p, 3)).toBe(1);
		expect(stagesFiredBy(p, 4)).toBe(0);
		p = reduceStages(p, ev(3, 1));
		expect(stagesFiredBy(p, 3)).toBe(2);
	});
	it('keeps the highest stage whatever the arrival order, and never mutates', () => {
		const a = reduceStages(noStages, ev(1, 1));
		const b = reduceStages(a, ev(1, 0));
		expect(b).toBe(a);
		expect(noStages).toEqual({});
		expect(stagesFiredBy(b, 1)).toBe(2);
	});
	it('reports 0 without a vessel', () => {
		expect(stagesFiredBy(noStages, null)).toBe(0);
	});
});
