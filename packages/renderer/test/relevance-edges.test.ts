/** Plan 410 (the fixtures of Worker C): the gates' edges, an airless body, and what the levels must keep to. */
import { describe, expect, test } from 'bun:test';
import {
	GATES,
	RELEVANCE_LOOKS,
	relevanceLevels,
	relevanceOf,
	type RelevanceInput,
	type RelevanceLook
} from '../src/relevance.ts';

const view = (over: Partial<RelevanceInput>): RelevanceInput => ({
	altitude: 2,
	atmosphereTop: 70_000,
	vessel: 'flying',
	map: false,
	...over
});

describe('the gates: a metre either side', () => {
	const edges: Array<[RelevanceLook, number, number, number]> = [
		// look, gate altitude, level below, level at and above
		['ocean', GATES.oceanFull, 2, 1],
		['ocean', GATES.oceanNear, 1, 0],
		['clouds', GATES.cloudsFull, 2, 1],
		['rocks', GATES.rocksFull, 2, 1],
		['rocks', GATES.rocks, 1, 0],
		['terrain', GATES.terrain, 2, 0]
	];
	test.each(edges)('%s at %d m', (look, gate, below, above) => {
		expect(relevanceOf(look, view({ altitude: gate - 1 })), `${look} below`).toBe(
			below as 0 | 1 | 2
		);
		expect(relevanceOf(look, view({ altitude: gate })), `${look} at`).toBe(above as 0 | 1 | 2);
	});

	test('the clouds go off at the top of the air', () => {
		expect(relevanceOf('clouds', view({ altitude: 69_999 }))).toBe(1);
		expect(relevanceOf('clouds', view({ altitude: 70_000 }))).toBe(0);
	});

	test('below the surface counts as the ground', () => {
		expect(relevanceLevels(view({ altitude: -5, vessel: 'landed' }))).toEqual(
			relevanceLevels(view({ altitude: 0, vessel: 'landed' }))
		);
	});
});

describe('an airless moon', () => {
	const moon = (altitude: number, over: Partial<RelevanceInput> = {}) =>
		view({ altitude, atmosphereTop: 0, ...over });
	test('on the ground: the terrain and the rocks, no clouds, no plasma', () => {
		const l = relevanceLevels(moon(2, { vessel: 'landed' }));
		expect(l).toMatchObject({ clouds: 0, terrain: 2, rocks: 2, plasma: 0 });
	});
	test('a landing burn: the plume draws, the shell does not', () => {
		const l = relevanceLevels(moon(300, { screenShare: 0.01 }));
		expect(l).toMatchObject({ plume: 2, plasma: 0, clouds: 0 });
	});
	test('high over it nothing of the near looks is left', () => {
		const l = relevanceLevels(moon(50_000, { vessel: 'orbiting' }));
		expect(l).toMatchObject({ ocean: 0, clouds: 0, rocks: 0, terrain: 0 });
	});
});

describe('what the levels keep to', () => {
	test('every level is 0, 1 or 2 in any view', () => {
		for (const altitude of [-1, 0, 50, 500, 5_000, 25_000, 80_000, 4e6])
			for (const vessel of ['none', 'landed', 'flying', 'orbiting'] as const)
				for (const map of [false, true])
					for (const look of RELEVANCE_LOOKS)
						expect([0, 1, 2]).toContain(
							relevanceOf(
								look,
								view({ altitude, vessel, map, heating: altitude > 20_000, screenShare: 0.01 })
							)
						);
	});

	test('the clouds never rise with altitude either', () => {
		let last = 2;
		for (const altitude of [0, 5_000, 14_999, 15_000, 40_000, 69_999, 70_000, 400_000]) {
			const level = relevanceOf('clouds', view({ altitude }));
			expect(level).toBeLessThanOrEqual(last);
			last = level;
		}
	});

	test('relevanceLevels is relevanceOf for every look', () => {
		const input = view({ altitude: 8_000, screenShare: 0.0004, heating: true });
		const all = relevanceLevels(input);
		for (const look of RELEVANCE_LOOKS) expect(all[look]).toBe(relevanceOf(look, input));
	});

	test('the map view turns every look off, whatever the altitude', () => {
		for (const altitude of [0, 3_000, 100_000])
			expect(Object.values(relevanceLevels(view({ altitude, map: true, heating: true })))).toEqual([
				0, 0, 0, 0, 0, 0
			]);
	});
});
