/** Plan 215 (ADR 0205 points 5 and 6): the region table and the breakpoints. */
import { describe, expect, it } from 'vitest';
import { REGIONS, clampSpan, layoutFor } from './regions';

const both = { dock: true, vessel: true };

describe('layoutFor', () => {
	it('1440 × 900: both side panels may be open', () => {
		const l = layoutFor(1440, 1, both);
		expect(l.mode).toBe('two');
		expect(l.open).toEqual(both);
	});

	it('1279: opening the vessel panel closes the dock, and the other way round', () => {
		expect(layoutFor(1279, 1, both, 'vessel')).toMatchObject({
			mode: 'one',
			open: { dock: false, vessel: true }
		});
		expect(layoutFor(1279, 1, both, 'dock').open).toEqual({ dock: true, vessel: false });
		expect(layoutFor(1279, 1, { dock: true, vessel: false }).open.dock).toBe(true);
	});

	it('1024: both are drawers, one at a time', () => {
		const l = layoutFor(1024, 1, both);
		expect(l.mode).toBe('drawer');
		expect(l.open).toEqual({ dock: false, vessel: true });
		expect(REGIONS.touchTarget).toBe(44);
	});

	it('at 125 % a 1440 px window drops to the one-panel rule', () => {
		const l = layoutFor(1440, 1.25, both);
		expect(l.width).toBe(1152);
		expect(l.mode).toBe('one');
		expect(layoutFor(1440, 1.5, both).mode).toBe('drawer'); // 960 px
		expect(layoutFor(1440, 0.8, both).mode).toBe('two');
	});

	it('the region table holds the ADR numbers', () => {
		expect(REGIONS.dock).toEqual({ min: 260, default: 280, max: 400 });
		expect(REGIONS.vessel).toEqual({ min: 300, default: 340, max: 440 });
		expect(REGIONS.navball).toEqual({ width: 390, height: 262 });
		expect(REGIONS.staging).toEqual({ min: 200, default: 220, max: 280 });
		expect(REGIONS.toasts).toBe(4);
		expect(clampSpan(REGIONS.vessel, 600)).toBe(440);
		expect(clampSpan(REGIONS.vessel, Number.NaN)).toBe(340);
	});
});
