/** Plan 045 / ADR 0056: the node and warp-to commands are validated at the boundary. */
import { describe, expect, test } from 'bun:test';
import { commandSchema, MAX_NODE_DV, SAS_MODES } from '../src/index.ts';

const ok = (c: unknown) => commandSchema.safeParse(c).success;

describe('maneuver commands', () => {
	test('node-set accepts a new node and an edit', () => {
		expect(
			ok({ type: 'node-set', vessel: 1, time: 100, prograde: 10, normal: -2, radial: 0 })
		).toBe(true);
		expect(
			ok({ type: 'node-set', vessel: 1, id: 3, time: 100, prograde: 0, normal: 0, radial: 0 })
		).toBe(true);
	});
	test('node-set refuses non-finite or huge values, a missing field and a negative id', () => {
		const base = { type: 'node-set', vessel: 1, time: 100, prograde: 1, normal: 0, radial: 0 };
		expect(ok({ ...base, time: Number.NaN })).toBe(false);
		expect(ok({ ...base, time: Infinity })).toBe(false);
		expect(ok({ ...base, prograde: MAX_NODE_DV + 1 })).toBe(false);
		expect(ok({ ...base, normal: undefined })).toBe(false);
		expect(ok({ ...base, id: -1 })).toBe(false);
	});
	test('node-remove with and without an id; warp-to needs a finite time and a factor of at least 1', () => {
		expect(ok({ type: 'node-remove', vessel: 1 })).toBe(true);
		expect(ok({ type: 'node-remove', vessel: 1, id: 2 })).toBe(true);
		expect(ok({ type: 'warp-to', time: 5, factor: 100 })).toBe(true);
		expect(ok({ type: 'warp-to', time: Number.NaN, factor: 100 })).toBe(false);
		expect(ok({ type: 'warp-to', time: 5, factor: 0.5 })).toBe(false);
	});
	test('maneuver is a SAS mode', () => {
		expect(SAS_MODES).toContain('maneuver');
		expect(ok({ type: 'sas', vessel: 1, mode: 'maneuver' })).toBe(true);
	});
});
