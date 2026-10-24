import { describe, expect, it } from 'vitest';
import {
	compilesInPlay,
	lookCostLines,
	lookCostTotal,
	playCompilesText,
	type LookCost
} from './compile-play';

const line = (label: string, phase: string, at: number) => ({ label, phase, at });

describe('compilesInPlay (plan 410)', () => {
	it('counts only the pipelines of the play phase and names the latest five, newest last', () => {
		const list = [
			line('scene', 'programs', 1),
			line('planet', 'warm', 2),
			...Array.from({ length: 7 }, (_, i) => line(`late ${i}`, 'play', 100 + i)),
			line('vegetation', 'background', 50)
		];
		const c = compilesInPlay(list);
		expect(c.count).toBe(7);
		expect(c.last).toEqual(['late 2', 'late 3', 'late 4', 'late 5', 'late 6']);
	});

	it('orders by the time asked, not by the order of the list', () => {
		const c = compilesInPlay([line('b', 'play', 20), line('a', 'play', 10)], 5);
		expect(c.last).toEqual(['a', 'b']);
	});

	it('says none when the load built everything, and names an unlabelled pipeline', () => {
		expect(playCompilesText(compilesInPlay([line('x', 'warm', 1)]))).toContain('none');
		const text = playCompilesText(compilesInPlay([line('', 'play', 1), line('mesh', 'play', 2)]));
		expect(text).toBe('2: (no label), mesh');
	});
});

describe('look costs', () => {
	const costs: LookCost[] = [
		{ look: 'clouds', ms: 1.5, level: 2 },
		{ look: 'ocean', ms: 3.25, level: 1 },
		{ look: 'rocks', ms: 0, level: 0 }
	];

	it('lists the costliest first with the level in words, a dash where the cost is unknown', () => {
		expect(lookCostLines(costs)).toEqual([
			'ocean 3.25 ms · cheap',
			'clouds 1.50 ms · full',
			'rocks – ms · off'
		]);
	});

	it('totals the costs, and is empty before the renderer reports any', () => {
		expect(lookCostTotal(costs)).toBeCloseTo(4.75, 6);
		expect(lookCostLines([])).toEqual([]);
		expect(lookCostTotal([])).toBe(0);
	});
});
