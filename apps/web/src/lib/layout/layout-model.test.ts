import { describe, expect, it } from 'vitest';
import {
	aboveDeckHeight,
	classifyScreen,
	EDGE,
	GAP,
	scriptPanelWidth,
	smallScreenAdvice,
	throttleAnchor
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
		const a = throttleAnchor(vp, 262, false, 150, 0, 300);
		expect(a.centre).toBe((150 + EDGE + (300 - EDGE)) / 2);
		expect(a.centre + a.room / 2).toBeLessThanOrEqual(300 - EDGE);
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
