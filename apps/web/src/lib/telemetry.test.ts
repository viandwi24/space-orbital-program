import { entityId, bodyId, type Snapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { canWarp, computeTelemetry } from './telemetry';

const bodies = [{ id: bodyId('stock.home'), radius: 600_000 }];
const orbit = { a: 700_000, e: 0.1, i: 0, raan: 0, argp: 0, m0: 0, epoch: 0 };

const snapshot = (extra: object = {}): Snapshot =>
	({
		t: 12,
		bodies: [],
		vessels: [
			{
				id: entityId(1),
				mode: 'flight',
				soi: bodyId('stock.home'),
				position: { x: 0, y: 650_000, z: 0 },
				velocity: { x: 3, y: 0, z: 4 },
				orientation: { x: 0, y: 0, z: 0, w: 1 },
				parts: [],
				...extra
			}
		]
	}) as unknown as Snapshot;

describe('computeTelemetry', () => {
	it('derives altitude, speed and the orbit apsides above the surface', () => {
		const t = computeTelemetry(snapshot({ orbit }), entityId(1), bodies);
		expect(t).toMatchObject({ t: 12, mode: 'flight', altitude: 50_000, speed: 5, escape: false });
		expect(t?.apoapsis).toBeCloseTo(170_000, 6);
		expect(t?.periapsis).toBeCloseTo(30_000, 6);
	});
	it('omits apsides without elements and flags escape orbits', () => {
		expect(computeTelemetry(snapshot(), entityId(1), bodies)?.apoapsis).toBeUndefined();
		const esc = computeTelemetry(
			snapshot({ orbit: { ...orbit, a: -1e6, e: 1.5 } }),
			entityId(1),
			bodies
		);
		expect(esc).toMatchObject({ escape: true });
		expect(esc?.apoapsis).toBeUndefined();
	});
	it('labels the phase: landed for surface rails, orbit/suborbital on rails, flight otherwise', () => {
		const ground = { x: 0, y: 600_000, z: 0 };
		const landed = computeTelemetry(
			snapshot({ mode: 'on-rails', surface: true, position: ground }),
			entityId(1),
			bodies
		);
		expect(landed).toMatchObject({ phase: 'landed', mode: 'on-rails', altitude: 0 });
		expect(landed?.splashed).toBe(false);
		const water = computeTelemetry(
			snapshot({ mode: 'on-rails', surface: true, position: ground, splashed: true }),
			entityId(1),
			bodies
		);
		expect(water?.splashed).toBe(true);
		expect(landed?.apoapsis).toBeUndefined();
		expect(landed?.periapsis).toBeUndefined();
		const onRails = (o: object) =>
			computeTelemetry(snapshot({ mode: 'on-rails', orbit: o }), entityId(1), bodies)?.phase;
		expect(onRails(orbit)).toBe('orbit');
		expect(onRails({ ...orbit, a: -1e6, e: 1.5 })).toBe('orbit');
		expect(onRails({ ...orbit, a: 640_000, e: 0.2 })).toBe('suborbital');
		expect(computeTelemetry(snapshot({ orbit }), entityId(1), bodies)?.phase).toBe('flight');
		expect(computeTelemetry(snapshot({ mode: 'on-rails' }), entityId(1), bodies)?.phase).toBe(
			'suborbital'
		);
	});
	it('enables the warp control with a vessel, in flight too (plan 206)', () => {
		expect(canWarp({ mode: 'on-rails' }, 1)).toBe(true);
		expect(canWarp({ mode: 'flight' }, 1)).toBe(true);
		expect(canWarp({ mode: 'flight' }, 10)).toBe(true);
		expect(canWarp(null, 1)).toBe(false);
		expect(canWarp({ mode: 'flight' }, 1, true)).toBe(true);
		expect(canWarp(null, 1, true)).toBe(false);
	});
	it('returns null for an unknown vessel', () => {
		expect(computeTelemetry(snapshot(), entityId(9), bodies)).toBeNull();
	});
});
