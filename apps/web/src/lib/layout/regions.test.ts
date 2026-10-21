/** Plan 215 (ADR 0205 points 5 and 6), revised by plan 272 (ADR 0253 point 8). */
import { describe, expect, it } from 'vitest';
import { REGIONS, clampSpan, cornerTop, layoutFor } from './regions';

describe('layoutFor', () => {
	it('1440 × 900 and 1280: staging at the bottom right ("two")', () => {
		expect(layoutFor(1440, 1)).toEqual({ mode: 'two', width: 1440 });
		expect(layoutFor(1280, 1).mode).toBe('two');
	});

	it('1279: staging and the dock stop above the navball module ("one")', () => {
		expect(layoutFor(1279, 1).mode).toBe('one');
	});

	it('1024: drawers with 44 px targets', () => {
		expect(layoutFor(1024, 1).mode).toBe('drawer');
		expect(REGIONS.touchTarget).toBe(44);
	});

	it('at 125 % a 1440 px window drops to the one-panel rule', () => {
		const l = layoutFor(1440, 1.25);
		expect(l.width).toBe(1152);
		expect(l.mode).toBe('one');
		expect(layoutFor(1440, 1.5).mode).toBe('drawer'); // 960 px
		expect(layoutFor(1440, 0.8).mode).toBe('two');
	});

	it('the region table holds the v3 numbers (V3 §2.3 to §2.5)', () => {
		expect(REGIONS.dock).toEqual({ min: 260, default: 272, max: 400 });
		expect(REGIONS.navball).toEqual({ width: 552, height: 232 });
		expect(REGIONS.staging).toEqual({ width: 260 });
		expect(REGIONS.toasts).toBe(2);
		expect(clampSpan(REGIONS.dock, 600)).toBe(400);
		expect(clampSpan(REGIONS.dock, Number.NaN)).toBe(272);
	});
});

describe('cornerTop (ADR 0267)', () => {
	const tools = { left: 300, right: 600, top: 80, bottom: 160 };
	it('keeps the column at its top when the map toolbar ends left of it', () => {
		expect(cornerTop(80, { left: 996 }, tools)).toBe(80);
		expect(cornerTop(80, { left: 608 }, tools)).toBe(80);
	});
	it('starts the column under the toolbar where they would meet', () => {
		expect(cornerTop(80, { left: 472 }, tools)).toBe(168);
		expect(cornerTop(80, { left: 472 }, tools, 12)).toBe(172);
	});
	it('ignores a toolbar that is hidden or above the column', () => {
		expect(cornerTop(80, { left: 472 }, undefined)).toBe(80);
		expect(cornerTop(80, { left: 472 }, { ...tools, bottom: 80 })).toBe(80);
		expect(cornerTop(80, { left: 472 }, { left: 300, right: 600, top: 24, bottom: 60 })).toBe(80);
		expect(cornerTop(80, undefined, tools)).toBe(80);
	});
});
