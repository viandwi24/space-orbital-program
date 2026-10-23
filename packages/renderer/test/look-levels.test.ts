/** Plan 404: per-look levels, the player's pins and what the presets give. */
import { afterEach, describe, expect, test } from 'bun:test';
import {
	AUTO_LOOKS,
	LOOKS,
	PRESETS,
	lookLevel,
	lookPinned,
	setLookChoices
} from '../src/presets.ts';

afterEach(() => setLookChoices(AUTO_LOOKS));

describe('look levels (plan 404)', () => {
	test('a look follows the preset until the player pins it', () => {
		for (const p of ['low', 'medium', 'high'] as const) {
			for (const id of LOOKS) expect(lookLevel(PRESETS[p], id)).toBe(PRESETS[p][id]);
		}
		setLookChoices({ ocean: 'low' });
		expect(lookLevel(PRESETS.high, 'ocean')).toBe('low');
		expect(lookPinned('ocean')).toBe(true);
		// the other looks still follow the preset a governor step moves to
		expect(lookLevel(PRESETS.low, 'plume')).toBe('low');
		expect(lookLevel(PRESETS.high, 'plume')).toBe('high');
		expect(lookPinned('plume')).toBe(false);
	});

	test('a pinned look is the same at every preset the governor can step through', () => {
		setLookChoices({ plasma: 'medium', plume: 'high' });
		for (const p of ['low', 'medium', 'high'] as const) {
			expect(lookLevel(PRESETS[p], 'plasma')).toBe('medium');
			expect(lookLevel(PRESETS[p], 'plume')).toBe('high');
		}
	});

	test('auto frees a pin; the presets rise with the level', () => {
		setLookChoices({ plume: 'low' });
		setLookChoices({ plume: 'auto' });
		expect(lookPinned('plume')).toBe(false);
		const rank = { low: 0, medium: 1, high: 2 } as const;
		for (const id of LOOKS) {
			expect(rank[PRESETS.low[id]]).toBeLessThanOrEqual(rank[PRESETS.medium[id]]);
			expect(rank[PRESETS.medium[id]]).toBeLessThanOrEqual(rank[PRESETS.high[id]]);
		}
	});
});
