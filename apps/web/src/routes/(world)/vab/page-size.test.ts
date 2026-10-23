/**
 * Plan 029: the screen stays layout only; behaviour lives in `lib/vab/controller.svelte.ts`. Since
 * plan 375 the screen is `lib/vab/HangarPage.svelte` (the world route and the sandbox share it).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lines = (file: string): number =>
	readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').length;

describe('the VAB route file', () => {
	it('is at most 780 lines (it was 1 294 before plan 029)', () => {
		expect(lines('../../../lib/vab/HangarPage.svelte')).toBeLessThanOrEqual(780);
	});
	it('holds no pointer or keyboard handling of its own', () => {
		const text = readFileSync(new URL('../../../lib/vab/HangarPage.svelte', import.meta.url), 'utf8');
		expect(text).not.toMatch(/function (pointer|onKey|cycle)/);
	});
});
