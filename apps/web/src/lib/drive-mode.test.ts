/** Plan 307: drive mode turns on near the ground with a wheel motor on, and shows a chip. */
import { describe, expect, it } from 'vitest';
import type { EntityId, Snapshot } from '@orbital/core';
import { drivable } from './flight-loop';
import { statusChips } from './hud/status-chips';
import type { Telemetry } from './telemetry';

const snap = (motor: boolean) =>
	({
		vessels: [
			{
				id: 1,
				terrainHeight: 100,
				parts: [
					{ modules: { 'stock.wheel': { brakes: false, ...(motor ? { motor: true } : {}) } } }
				]
			}
		]
	}) as unknown as Snapshot;
const at = (altitude: number) => ({ altitude }) as Telemetry;
const one = 1 as EntityId;

describe('drive mode (plan 307)', () => {
	it('on near the ground with a wheel motor on, off high up or without one', () => {
		expect(drivable(snap(true), one, at(102))).toBe(true);
		expect(drivable(snap(true), one, at(500))).toBe(false);
		expect(drivable(snap(false), one, at(102))).toBe(false);
	});
	it('shows a Drive chip', () => {
		const chips = statusChips({
			uncontrolled: null,
			link: null,
			blackout: 0,
			range: null,
			drive: true
		});
		expect(chips.map((c) => c.id)).toEqual(['drive']);
	});
});
