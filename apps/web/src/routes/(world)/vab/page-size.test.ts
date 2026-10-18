/** Plan 029: the route stays layout only; behaviour lives in `lib/vab/controller.svelte.ts`. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lines = (file: string): number =>
	readFileSync(new URL(file, import.meta.url), 'utf8').split('\n').length;

describe('the VAB route file', () => {
	it('is at most 700 lines (it was 1 294 before plan 029)', () => {
		expect(lines('./+page.svelte')).toBeLessThanOrEqual(700);
	});
	it('holds no pointer or keyboard handling of its own', () => {
		const text = readFileSync(new URL('./+page.svelte', import.meta.url), 'utf8');
		expect(text).not.toMatch(/function (pointer|onKey|cycle)/);
	});
});
