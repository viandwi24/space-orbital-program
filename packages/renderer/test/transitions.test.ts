import { describe, expect, test } from 'bun:test';
import {
	detectTransitions,
	type FxEvent,
	type FxPart,
	type FxVessel,
	type TransitionContext
} from '../src/effects/transitions.ts';

const R = 600_000;
const OMEGA = (2 * Math.PI) / 21_600;
const ctx: TransitionContext = {
	omega: () => ({ x: 0, y: OMEGA, z: 0 }),
	sizeOf: () => 1
};

const part = (id: number, y: number, temperature?: number): FxPart => ({
	id,
	definition: 'mod.part',
	position: { x: 0, y, z: 0 },
	temperature
});

/** A vessel at rest on the equator at +X (moving with the ground: omega x r = (0,0,-omega R)). */
const onGround = (parts: FxPart[], id = 1, extraSpeed = 0): FxVessel => ({
	id,
	soi: 'home',
	position: { x: R, y: 0, z: 0 },
	velocity: { x: extraSpeed, y: 0, z: -OMEGA * R },
	parts
});

const kinds = (events: FxEvent[]) =>
	events.map((e) => e.kind + (e.kind === 'destroyed' ? `:${e.cause}` : ''));

describe('snapshot transitions', () => {
	test('a part that vanishes at 30 m/s relative to the ground is an impact at its last position', () => {
		const prev = [onGround([part(1, 0), part(2, -2)], 1, 30)];
		const next = [onGround([part(1, 0)], 1, 30)];
		const events = detectTransitions(prev, next, ctx);
		expect(kinds(events)).toEqual(['destroyed:impact']);
		const e = events[0]!;
		if (e.kind !== 'destroyed') throw new Error('kind');
		expect(e.position).toEqual({ x: R, y: -2, z: 0 });
		expect(e.speed).toBeGreaterThan(29);
		expect(e.speed).toBeLessThan(31);
	});

	test('a part that vanishes at rest on the ground (despawned debris) gives no event', () => {
		const prev = [onGround([part(1, 0), part(2, -2)])];
		const next = [onGround([part(1, 0)])];
		expect(detectTransitions(prev, next, ctx)).toEqual([]);
		expect(detectTransitions(prev, [], ctx)).toEqual([]);
	});

	test('a hot vanishing part burned up', () => {
		const prev = [onGround([part(1, 0, 900)])];
		expect(kinds(detectTransitions(prev, [], ctx))).toEqual(['destroyed:burn']);
		const cool = [onGround([part(1, 0, 650)])];
		expect(detectTransitions(cool, [], ctx)).toEqual([]);
	});

	test('a vessel splitting in two gives one separation between the pieces', () => {
		const prev = [onGround([part(1, 0), part(2, -1), part(3, -2), part(4, -3)])];
		const next = [onGround([part(1, 0), part(2, -1)], 1), onGround([part(3, -2), part(4, -3)], 5)];
		const events = detectTransitions(prev, next, ctx);
		expect(kinds(events)).toEqual(['separated']);
		expect(events[0]!.position.y).toBeCloseTo(-1.5, 9);
	});

	test('nothing changes, nothing happens; new vessels alone are not events', () => {
		const a = [onGround([part(1, 0), part(2, -1)])];
		expect(detectTransitions(a, a, ctx)).toEqual([]);
		expect(detectTransitions([], a, ctx)).toEqual([]);
	});
});

describe('touchdown (plan 246)', () => {
	const flying = (extraSpeed: number): FxVessel => ({
		...onGround([part(1, 0)], 1, extraSpeed),
		surface: false
	});
	const landed: FxVessel = { ...onGround([part(1, 0)]), surface: true };

	test('a vessel that goes onto surface rails kicks up dust at its landing speed', () => {
		const events = detectTransitions([flying(3)], [landed], ctx);
		expect(kinds(events)).toEqual(['touchdown']);
		expect(events[0]).toMatchObject({ kind: 'touchdown', soi: 'home', speed: 3 });
	});

	test('a vessel that settles without moving, or that was already landed, raises none', () => {
		expect(detectTransitions([flying(0.1)], [landed], ctx)).toEqual([]);
		expect(detectTransitions([landed], [landed], ctx)).toEqual([]);
		expect(detectTransitions([flying(3)], [flying(3)], ctx)).toEqual([]);
	});
});
