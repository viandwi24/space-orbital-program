/** Plan 096 / ADR 0123 point 3: no capacity key is a flight tool (ADR 0098 point 3). */
import { describe, expect, test } from 'bun:test';
import { CAPACITY, CAPACITY_KEYS, FLIGHT_TOOLS } from '../src/index.ts';

const norm = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');

describe('capacity keys (ADR 0098 point 3)', () => {
	test('no capacity key is a flight tool; every key has a unit', () => {
		expect([...FLIGHT_TOOLS].sort() as string[]).toEqual(
			[
				'delta-v',
				'maneuver-nodes',
				'map',
				'sas',
				'scripts',
				'staging',
				'target',
				'time-warp',
				'trajectory'
			].sort()
		);
		expect([...CAPACITY_KEYS]).toEqual([
			'hangar',
			'launch-pad',
			'runway',
			'crew',
			'mission-control',
			'comms-node',
			'lab',
			'admin',
			'storage',
			'production'
		]);
		const tools = new Set(FLIGHT_TOOLS.map(norm));
		for (const key of CAPACITY_KEYS) {
			expect(tools.has(norm(key))).toBe(false);
			expect(CAPACITY[key].unit.length).toBeGreaterThan(0);
			expect(key).not.toMatch(/^(unlock|enable|allow|can)/i);
		}
	});
});
