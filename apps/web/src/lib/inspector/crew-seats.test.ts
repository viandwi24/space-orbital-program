import { describe, expect, it } from 'vitest';
import type { EntityId } from '@orbital/core';
import { crewSeats } from './crew-seats';

const defs: Record<string, { crewCapacity?: number; title: string }> = {
	pod: { crewCapacity: 3, title: 'Command pod' },
	lab: { crewCapacity: 2, title: 'Lab' },
	tank: { title: 'Tank' }
};
const parts = { get: (id: string) => defs[id] };
const vessel = {
	parts: [
		{ id: 1, definition: 'pod' },
		{ id: 2, definition: 'lab' },
		{ id: 3, definition: 'tank' }
	],
	crew: [
		{ member: 'a', part: 1 },
		{ member: 'b', part: 1 },
		{ member: 'c', part: 2 },
		{ member: 'd', part: 2 }
	]
} as never;
const roster = [
	{ id: 'a', name: 'Ada' },
	{ id: 'b', name: 'Bo' }
];

describe('crewSeats', () => {
	it('lists who sits in the part and the other seats with room', () => {
		const s = crewSeats(vessel, roster, parts, 1 as EntityId)!;
		expect(s.capacity).toBe(3);
		expect(s.aboard).toEqual([
			{ member: 'a', name: 'Ada' },
			{ member: 'b', name: 'Bo' }
		]);
		expect(s.targets).toEqual([]); // the lab is full, the tank has no seat
	});
	it('offers a seat with room', () => {
		const v = {
			...(vessel as object),
			crew: [
				{ member: 'a', part: 1 },
				{ member: 'c', part: 2 }
			]
		} as never;
		expect(crewSeats(v, roster, parts, 1 as EntityId)!.targets).toEqual([
			{ part: 2, title: 'Lab', free: 1 }
		]);
	});
	it('is null for a part without seats', () => {
		expect(crewSeats(vessel, roster, parts, 3 as EntityId)).toBeNull();
	});
});
