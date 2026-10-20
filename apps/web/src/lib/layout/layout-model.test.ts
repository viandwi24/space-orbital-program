import { describe, expect, it } from 'vitest';
import {
	aboveDeckHeight,
	classifyScreen,
	EDGE,
	GAP,
	scriptPanelWidth,
	smallScreenAdvice,
	throttleAnchor,
	viewInsets,
	type MeasuredBox
} from './layout-model';
import { isSmallScreen } from '../touch/touch-model';

describe('clearances above the instrument deck', () => {
	it('a column may take what the deck and two margins leave', () => {
		expect(aboveDeckHeight(768, 262)).toBe(768 - 262 - 2 * EDGE - GAP);
	});
	it('never negative, never NaN', () => {
		expect(aboveDeckHeight(200, 262)).toBe(0);
		expect(aboveDeckHeight(Number.NaN, 262)).toBe(0);
		expect(aboveDeckHeight(768, Number.POSITIVE_INFINITY)).toBe(0);
		expect(aboveDeckHeight(768, -50)).toBe(768 - 2 * EDGE - GAP);
	});
	it('the script panel is 420 px, or 46 % on a narrow screen', () => {
		expect(scriptPanelWidth(1440)).toBe(420);
		expect(scriptPanelWidth(800)).toBeCloseTo(368, 6);
		expect(scriptPanelWidth(-5)).toBe(0);
	});
});

describe('the touch throttle never sits under the script panel, the guide or the deck', () => {
	const vp = { width: 1024, height: 768 };
	it('without the script panel it keeps to the left edge', () => {
		expect(throttleAnchor(vp, 262, false, 0).left).toBe(EDGE - 4);
	});
	it('with the panel open its left edge is past the panel', () => {
		const open = throttleAnchor(vp, 262, true, 0);
		expect(open.left).toBeGreaterThanOrEqual(EDGE + scriptPanelWidth(1024));
	});
	it('closed, its centre is the middle of the space between the guide and the deck', () => {
		const a = throttleAnchor(vp, 262, false, 215);
		expect(a.centre).toBe((215 + EDGE + (768 - 262 - EDGE)) / 2);
	});
	it('open, the guide is beside it, so the span starts at the top margin', () => {
		expect(throttleAnchor(vp, 262, true, 215).centre).toBe((EDGE + 768 - 262 - EDGE) / 2);
	});
	it('beside any open dock panel (plan 112): past its right edge, the full height', () => {
		const a = throttleAnchor(vp, 262, false, 600, 300);
		expect(a.left).toBe(300 + EDGE);
		expect(a.centre).toBe((EDGE + 768 - 262 - EDGE) / 2);
	});
	it('on a narrow screen it stays above the staging stack in the left column (plan 215)', () => {
		const a = throttleAnchor(vp, 262, false, 150, 0, { top: 400, right: 244 });
		expect(a.centre).toBe((150 + EDGE + (400 - EDGE)) / 2);
		expect(a.centre + a.room / 2).toBeLessThanOrEqual(400 - EDGE);
		expect(a.left).toBe(EDGE - 4);
	});
	it('with too little room above the staging stack it stands beside it', () => {
		const a = throttleAnchor(vp, 262, false, 300, 0, { top: 330, right: 244 });
		expect(a.left).toBe(244 + EDGE);
		expect(a.centre).toBe((300 + EDGE + (768 - 262 - EDGE)) / 2);
	});
	it('a deck taller than the screen leaves a centre that is still a number', () => {
		const a = throttleAnchor(vp, 9999, false, 300);
		expect(Number.isFinite(a.centre)).toBe(true);
		expect(a.centre).toBeGreaterThanOrEqual(0);
	});
});

describe('which small screen is it', () => {
	it('is ok exactly where the notice stays away', () => {
		for (const vp of [
			{ width: 1024, height: 768 },
			{ width: 1366, height: 1024 },
			{ width: 900, height: 500 },
			{ width: 1440, height: 900 }
		]) {
			expect(classifyScreen(vp)).toBe('ok');
			expect(isSmallScreen(vp)).toBe(false);
		}
	});
	it('agrees with isSmallScreen everywhere else', () => {
		for (const w of [320, 390, 667, 768, 844, 899, 900, 1024])
			for (const h of [320, 390, 500, 667, 768, 844, 1024]) {
				expect(classifyScreen({ width: w, height: h }) === 'ok').toBe(
					!isSmallScreen({ width: w, height: h })
				);
			}
	});
	it('names phones, tablets in portrait and small windows', () => {
		expect(classifyScreen({ width: 390, height: 844 })).toBe('phone-portrait');
		expect(classifyScreen({ width: 844, height: 390 })).toBe('phone-landscape');
		expect(classifyScreen({ width: 768, height: 1024 })).toBe('tablet-portrait');
		expect(classifyScreen({ width: 800, height: 600 })).toBe('small-window');
	});
	it('every small class has advice that says what to do; ok has none', () => {
		expect(smallScreenAdvice('ok')).toBe('');
		expect(smallScreenAdvice('phone-portrait')).toMatch(/landscape/);
		expect(smallScreenAdvice('tablet-portrait')).toMatch(/landscape/);
		expect(smallScreenAdvice('small-window')).toMatch(/larger/);
		expect(smallScreenAdvice('phone-landscape')).toMatch(/not supported/);
	});
});

describe('the camera clearances (plan 256)', () => {
	const box = (left: number, top: number, width: number, height: number): MeasuredBox => ({
		left,
		top,
		width,
		height,
		right: left + width,
		bottom: top + height
	});
	const frame = { width: 1440, height: 900 };
	const bar = box(24, 24, 500, 44);
	const deck = box(400, 640, 640, 236);
	const right = box(1100, 80, 316, 500);

	it('keeps the time bar and the deck clear, and the side panels only when asked', () => {
		expect(viewInsets({ frame, bar, deck, right, dockRight: 300, centre: false })).toEqual({
			top: 76,
			right: 0,
			bottom: 900 - 640 + 8,
			left: 0
		});
		expect(viewInsets({ frame, bar, deck, right, dockRight: 300, centre: true })).toEqual({
			top: 76,
			right: 1440 - 1100 + 8,
			bottom: 268,
			left: 300
		});
	});

	it('a hidden deck leaves no clearance: the box of a display:none element is empty at the origin', () => {
		const hidden = box(0, 0, 0, 0);
		const shownInsets = viewInsets({ frame, bar, deck, dockRight: 0, centre: false });
		const hiddenInsets = viewInsets({ frame, bar, deck: hidden, dockRight: 0, centre: false });
		expect(hiddenInsets.bottom).toBe(0);
		expect(viewInsets({ frame, bar, dockRight: 0, centre: false }).bottom).toBe(0);
		// the free area grew at the bottom, so the vessel (the middle of what is free) moves down
		const mid = (i: { top: number; bottom: number }): number =>
			(i.top + (frame.height - i.bottom)) / 2;
		expect(mid(hiddenInsets)).toBeGreaterThan(mid(shownInsets));
	});

	it('a hidden bar or side panel leaves none either', () => {
		const hidden = box(0, 0, 0, 0);
		const i = viewInsets({ frame, bar: hidden, deck, right: hidden, dockRight: 0, centre: true });
		expect(i.top).toBe(0);
		expect(i.right).toBe(0);
	});
});
