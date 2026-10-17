/** The Credits page data (plans 023 and 075): every dependency has a licence; the game's is Apache-2.0. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDITS, GAME_LICENCE, GAME_LICENCE_URL } from './credits';

describe('credits', () => {
	it('names a licence for every dependency', () => {
		for (const c of CREDITS) expect(c.licence.length).toBeGreaterThan(2);
	});

	it('the game licence is Apache-2.0, linked to its text', () => {
		expect(GAME_LICENCE).toBe('Apache-2.0');
		expect(GAME_LICENCE_URL).toBe('https://www.apache.org/licenses/LICENSE-2.0');
	});

	it('every OFL font carries its copyright line', () => {
		const fonts = CREDITS.filter((c) => c.licence === 'SIL Open Font License 1.1');
		expect(fonts.length).toBeGreaterThan(0);
		for (const f of fonts) expect(f.copyright).toMatch(/^Copyright \d{4} /);
	});

	it('nothing says the licence is still to be decided', () => {
		const root = join(__dirname, '../../../../..');
		const readme = readFileSync(join(root, 'README.md'), 'utf8');
		const page = readFileSync(join(root, 'apps/web/src/routes/credits/+page.svelte'), 'utf8');
		for (const text of [readme, page, GAME_LICENCE]) {
			expect(text).not.toMatch(/to be decided|not been decided|licence situation/i);
		}
	});
});
