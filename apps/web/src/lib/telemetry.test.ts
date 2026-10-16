import { entityId, bodyId, type Snapshot } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { computeTelemetry } from './telemetry';

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
	it('returns null for an unknown vessel', () => {
		expect(computeTelemetry(snapshot(), entityId(9), bodies)).toBeNull();
	});
});
