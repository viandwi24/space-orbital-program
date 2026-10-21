/** Plan 318: Terminate, Recover and the occupied pad, as plain values. */
import { describe, expect, it } from 'vitest';
import type { EntityId, Snapshot, VesselSnapshot } from '@orbital/core';
import {
	fleetPick,
	focusAfterRemoval,
	isDebrisVessel,
	occupiedPrompt,
	spotOccupants,
	terminateQuestion
} from './fleet-actions';

const id = (n: number) => n as EntityId;
const quote = (credit: number) => ({ value: credit, factor: 1, distance: 0, credit });
const crew = (n: number) =>
	Array.from({ length: n }, (_, i) => ({ member: `c${i}`, part: id(1), abilities: {} }));
const vessel = (n: number, extra: Partial<VesselSnapshot> = {}): VesselSnapshot =>
	({
		id: id(n),
		name: `V${n}`,
		type: 'probe',
		mode: 'flight',
		soi: 'home',
		position: { x: 0, y: 0, z: 0 },
		velocity: { x: 0, y: 0, z: 0 },
		orientation: { x: 0, y: 0, z: 0, w: 1 },
		parts: [],
		...extra
	}) as VesselSnapshot;
const snapshot = (vessels: VesselSnapshot[]): Snapshot =>
	({ t: 0, vessels }) as unknown as Snapshot;

describe('fleet pick (plan 318)', () => {
	it('counts crew and the credit of the recoverable ones, and skips other agencies', () => {
		const s = snapshot([
			vessel(1, { recovery: quote(100), crew: crew(2) }),
			vessel(2, { type: 'debris' }),
			vessel(3, { owner: 'rival', recovery: quote(50) })
		]);
		const pick = fleetPick(s, [1, 2, 3]);
		expect(pick.vessels.map((v) => v.id)).toEqual([1, 2]);
		expect(pick.recoverable.map((v) => v.id)).toEqual([1]);
		expect(pick.crew).toBe(2);
		expect(pick.credit).toBe(100);
	});

	it('asks before a terminate only when crew are aboard', () => {
		const s = snapshot([vessel(1, { crew: crew(1) }), vessel(2, { type: 'debris' })]);
		expect(terminateQuestion(fleetPick(s, [2]))).toBeNull();
		expect(terminateQuestion(fleetPick(s, [1]))).toContain('V1');
		expect(terminateQuestion(fleetPick(s, [1, 2]))).toContain('2 vessels');
		expect(terminateQuestion(fleetPick(s, [1, 2]))).toContain('1 crew member is aboard');
	});

	it('debris is the player’s and typed debris', () => {
		expect(isDebrisVessel(vessel(1, { type: 'debris' }))).toBe(true);
		expect(isDebrisVessel(vessel(1, { type: 'debris', owner: 'rival' }))).toBe(false);
		expect(isDebrisVessel(vessel(1))).toBe(false);
	});
});

describe('occupied pad (plan 318)', () => {
	const at = (site: string, east: number, north = 0) => ({ atSite: { site, east, north } });
	const s = snapshot([
		vessel(1, { ...at('ksc', 3), recovery: quote(300) }),
		vessel(2, { ...at('ksc', -20, 25), type: 'debris', recovery: quote(20) }),
		vessel(3, at('ksc', 600)),
		vessel(4, at('other', 0))
	]);
	const pad = { east: 0, north: 0 };

	it('lists who stands within the clear radius of that spot of that site only', () => {
		expect(spotOccupants(s, 'ksc', pad).map((v) => v.id)).toEqual([1, 2]);
		expect(spotOccupants(s, 'ksc', { east: 600, north: 0 }).map((v) => v.id)).toEqual([3]);
		expect(spotOccupants(s, 'nowhere', pad)).toEqual([]);
	});

	it('offers Recover only when every occupant can be recovered, and warns about crew', () => {
		const both = occupiedPrompt(spotOccupants(s, 'ksc', pad))!;
		expect(both.names).toBe('V1, V2');
		expect(both.canRecover).toBe(true);
		expect(both.credit).not.toBeNull();
		expect(both.crewWarning).toBeNull();
		const moving = occupiedPrompt([vessel(5, { crew: crew(3) })])!;
		expect(moving.canRecover).toBe(false);
		expect(moving.crewWarning).toContain('3 crew members');
		expect(occupiedPrompt([])).toBeNull();
	});

	it('shortens a long list of names', () => {
		const many = occupiedPrompt([1, 2, 3, 4, 5].map((n) => vessel(n)))!;
		expect(many.names).toBe('V1, V2, V3 and 2 more');
	});
});

describe('focus after a removal (plan 318)', () => {
	const s = snapshot([
		vessel(1),
		vessel(2, { type: 'debris', uncontrolled: 'no-source' }),
		vessel(3, { owner: 'rival' }),
		vessel(4)
	]);

	it('keeps the focus when it stays', () => {
		expect(focusAfterRemoval(s, 1, [4])).toBe(1);
	});
	it('moves to another controllable vessel of the player when the focus goes', () => {
		expect(focusAfterRemoval(s, 1, [1])).toBe(4);
	});
	it('is null (the Space Center) when none is left', () => {
		expect(focusAfterRemoval(s, 1, [1, 4])).toBeNull();
		expect(focusAfterRemoval(snapshot([]), null, [])).toBeNull();
	});
});
