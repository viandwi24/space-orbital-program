/**
 * Plan 122 (ADR 0119 point 4): with the Sun at the root and the home planet on its tilted orbit, a
 * flight in the home sphere is the flight it was before. The frozen numbers come from the old system
 * (`fixtures/make-sun-parity.ts`), re-frozen in plan 212 when the atmosphere changed on purpose.
 */
import { describe, expect, test } from 'bun:test';
import frozen from './fixtures/sun-parity.json';
import { runParity, type ParityState } from './helpers/sun-parity.ts';

const close = (got: ParityState, want: ParityState) => {
	expect(got.soi).toBe(want.soi);
	expect(Math.abs(got.t - want.t)).toBeLessThan(1e-6 * want.t);
	for (const k of ['position', 'velocity'] as const) {
		const w = want[k];
		const scale = Math.hypot(w.x, w.y, w.z);
		const err = Math.hypot(got[k].x - w.x, got[k].y - w.y, got[k].z - w.z);
		expect(err / scale).toBeLessThan(1e-6);
	}
};

describe('the home sphere with the Sun at the root (plan 122)', () => {
	test('the ascent and the moon transfer match the flights from before the Sun within 1e-6', async () => {
		const run = await runParity();
		close(run.orbit, frozen.orbit);
		close(run.moon, frozen.moon);
	}, 120_000);
});
