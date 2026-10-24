/** Plan 410: the level of each look for each scene's camera state. */
import { describe, expect, test } from 'bun:test';
import {
	GATES,
	RELEVANCE_LOOKS,
	relevanceLevels,
	relevanceOf,
	type RelevanceInput
} from '../src/relevance.ts';

const air = 70_000;
const view = (over: Partial<RelevanceInput>): RelevanceInput => ({
	altitude: 2,
	atmosphereTop: air,
	vessel: 'landed',
	map: false,
	...over
});

describe('relevanceOf: the scenes', () => {
	test('the pad: everything near is full, no re-entry', () => {
		expect(relevanceLevels(view({}))).toEqual({
			ocean: 2,
			clouds: 2,
			rocks: 2,
			terrain: 2,
			plume: 2,
			plasma: 0
		});
	});
	test('3 km: the sea is just past full, the rocks gone', () => {
		const l = relevanceLevels(view({ altitude: 3_000, vessel: 'flying' }));
		expect(l).toMatchObject({ ocean: 1, clouds: 2, rocks: 0, terrain: 2 });
	});
	test('12 km: the sea analytic, the clouds full, the terrain still mesh', () => {
		const l = relevanceLevels(view({ altitude: 12_000, vessel: 'flying' }));
		expect(l).toMatchObject({ ocean: 1, clouds: 2, rocks: 0, terrain: 2 });
	});
	test('40 km: the sea off, the clouds cheap, the terrain off', () => {
		const l = relevanceLevels(view({ altitude: 40_000, vessel: 'flying' }));
		expect(l).toMatchObject({ ocean: 0, clouds: 1, rocks: 0, terrain: 0 });
	});
	test('orbit: only the baked stand-ins draw, the rest costs nothing', () => {
		const l = relevanceLevels(view({ altitude: 100_000, vessel: 'orbiting' }));
		expect(l).toEqual({ ocean: 0, clouds: 0, rocks: 0, terrain: 0, plume: 2, plasma: 0 });
	});
	test('the map view shows none of the flight looks', () => {
		for (const look of RELEVANCE_LOOKS)
			expect(relevanceOf(look, view({ map: true, heating: true }))).toBe(0);
	});
});

describe('relevanceOf: the rules', () => {
	test('rocks: all below the near gate, some below the far one, none above', () => {
		expect(relevanceOf('rocks', view({ altitude: GATES.rocksFull - 1 }))).toBe(2);
		expect(relevanceOf('rocks', view({ altitude: GATES.rocksFull + 1 }))).toBe(1);
		expect(relevanceOf('rocks', view({ altitude: GATES.rocks + 1 }))).toBe(0);
	});
	test('a body without air has no clouds and its sea is off', () => {
		expect(relevanceOf('clouds', view({ atmosphereTop: 0 }))).toBe(0);
		expect(relevanceOf('ocean', view({ atmosphereTop: 0, altitude: 50_000 }))).toBe(0);
	});
	test('plumes need a vessel and a share of the screen', () => {
		expect(relevanceOf('plume', view({ vessel: 'none' }))).toBe(0);
		expect(relevanceOf('plume', view({ screenShare: 0 }))).toBe(0);
		expect(relevanceOf('plume', view({ screenShare: 0.0005 }))).toBe(1);
		expect(relevanceOf('plume', view({ screenShare: 0.02 }))).toBe(2);
	});
	test('the plasma shell needs heating and a vessel that is not on the ground', () => {
		expect(relevanceOf('plasma', view({ heating: true, vessel: 'flying' }))).toBe(2);
		expect(relevanceOf('plasma', view({ heating: false, vessel: 'flying' }))).toBe(0);
		expect(relevanceOf('plasma', view({ heating: true, vessel: 'landed' }))).toBe(0);
	});
	test('levels never rise with altitude', () => {
		for (const look of ['ocean', 'rocks', 'terrain'] as const) {
			let last = 2;
			for (const altitude of [0, 10, 100, 1_000, 5_000, 20_000, 60_000, 500_000]) {
				const level = relevanceOf(look, view({ altitude, vessel: 'flying' }));
				expect(level).toBeLessThanOrEqual(last);
				last = level;
			}
		}
	});
});
