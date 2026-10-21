/** Plan 273 (V3 §1, ADR 0254): the Space Center's modes. */
import { describe, expect, it } from 'vitest';
import { cardChip, focusLabel, modeOf, stepBuilding } from './sc-mode';

describe('the Space Center modes', () => {
	it('Build while the bar is open, Focus with a selection, else Overview', () => {
		expect(modeOf(false, null)).toBe('overview');
		expect(modeOf(false, 'hangar')).toBe('focus');
		expect(modeOf(true, 'hangar')).toBe('build');
		expect(modeOf(true, null)).toBe('build');
	});

	it('the focus bar steps through the buildings and wraps', () => {
		const ids = ['a', 'b', 'c'];
		expect(stepBuilding(ids, 'a', 1)).toBe('b');
		expect(stepBuilding(ids, 'c', 1)).toBe('a');
		expect(stepBuilding(ids, 'a', -1)).toBe('c');
		expect(stepBuilding(ids, null, -1)).toBe('c');
		expect(stepBuilding([], 'a', 1)).toBeNull();
		expect(focusLabel(ids, 'b')).toBe('Building 2 of 3');
		expect(focusLabel(ids, 'x')).toBe('');
	});

	it('a card shows LOCKED, ×n or nothing', () => {
		expect(cardChip('Only at the home Space Center', 2)).toBe('LOCKED');
		expect(cardChip(null, 2)).toBe('×2');
		expect(cardChip(null, 0)).toBe('');
	});
});
