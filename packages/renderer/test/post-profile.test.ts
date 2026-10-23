/** Plan 405 (ADR 0345): a mod's post profile reaches the post chains' knobs. */
import { describe, expect, test } from 'bun:test';
import { activeProfile, postLook, STOCK_BLOOM } from '../src/post-profile.ts';

describe('post profiles (plan 405)', () => {
	test('no profile is the stock look', () => {
		expect(postLook(undefined)).toEqual({ bloom: STOCK_BLOOM, exposure: 1 });
	});

	test('a profile replaces what it names and keeps the rest', () => {
		const look = postLook({ bloom: { strength: 0.8 }, exposure: 1.4 });
		expect(look.bloom).toEqual({ strength: 0.8, radius: 0.55, threshold: 3 });
		expect(look.exposure).toBe(1.4);
	});

	test('the last registered profile is the one drawn', () => {
		expect(activeProfile([])).toBeUndefined();
		expect(activeProfile(undefined)).toBeUndefined();
		expect(activeProfile([{ id: 'a' }, { id: 'b' }])).toEqual({ id: 'b' });
	});
});
