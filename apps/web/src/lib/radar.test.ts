import { describe, expect, it } from 'vitest';
import { RADAR_MAX_ALTITUDE, radarAltitude, radarReading, radarVisible } from './radar';

describe('radar altitude', () => {
	it('is the height above the ground under the vessel, not above the sphere', () => {
		// 1 800 m above the sphere, ground at 1 650 m, root origin 3 m above the lowest point
		expect(radarAltitude(1800, 3, 1650)).toBe(147);
	});

	it('reads 0 standing on a hillside and on the flat pad', () => {
		expect(radarAltitude(1653, 3, 1650)).toBe(0);
		expect(radarAltitude(3, 3, 0)).toBe(0);
	});

	it('never goes negative (a sunk leg, a rounding error)', () => {
		expect(radarAltitude(1648, 3, 1650)).toBe(0);
	});

	it('equals the altitude over the sea (ground height 0)', () => {
		expect(radarAltitude(5200, 0, 0)).toBe(5200);
	});

	it('is null without terrain data or with a bad number', () => {
		expect(radarAltitude(100, 3, undefined)).toBeNull();
		expect(radarAltitude(100, 3, Number.NaN)).toBeNull();
		expect(radarAltitude(Number.NaN, 3, 0)).toBeNull();
	});

	it('shows only when there is data and the ground is within reach of the read-out', () => {
		expect(radarVisible(null)).toBe(false);
		expect(radarVisible(0)).toBe(true);
		expect(radarVisible(RADAR_MAX_ALTITUDE)).toBe(true);
		expect(radarVisible(RADAR_MAX_ALTITUDE + 1)).toBe(false);
	});
});

describe('radar reading for the HUD model', () => {
	it('is absent without terrain data', () => expect(radarReading(1800, 3, undefined)).toBeNull());
	it('is the height above the ground on a hillside', () => {
		expect(radarReading(1800, 3, 1650)).toBe(147);
	});
	it('is absent above the read-out limit', () => {
		expect(radarReading(30_000, 3, 1650)).toBeNull();
		expect(radarReading(RADAR_MAX_ALTITUDE + 10, 0, 10)).toBe(RADAR_MAX_ALTITUDE);
	});
});
