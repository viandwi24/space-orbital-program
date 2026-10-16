import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREDITS, GAME_LICENCE } from './credits';
import { ROADMAP, ROADMAP_AREAS } from './roadmap';

const plans = join(__dirname, '../../../../../docs/plans');

function planFile(id: string): string | undefined {
	return readdirSync(plans).find((f) => f.startsWith(`${id}-`));
}

describe('public roadmap', () => {
	it('lists only plans that exist and are not done (a shipped plan leaves the page)', () => {
		for (const item of ROADMAP) {
			const file = planFile(item.plan);
			expect(file, `plan ${item.plan}`).toBeDefined();
			const text = readFileSync(join(plans, file!), 'utf8');
			const status = /^status: (\S+)/m.exec(text)?.[1];
			expect(['draft', 'ready', 'in-progress'], `plan ${item.plan}`).toContain(status);
		}
	});
	it('has unique plans, known areas and a sentence for each', () => {
		expect(new Set(ROADMAP.map((r) => r.plan)).size).toBe(ROADMAP.length);
		for (const item of ROADMAP) {
			expect(ROADMAP_AREAS).toContain(item.area);
			expect(item.gives.length).toBeGreaterThan(40);
		}
	});
	it('covers every draft plan of ADR 0048 post-v1 list', () => {
		for (const id of ['034', '035', '036', '038', '040', '041'])
			expect(ROADMAP.map((r) => r.plan)).toContain(id);
	});
});

describe('credits', () => {
	it('names a licence for every dependency and leaves the game licence undecided', () => {
		for (const c of CREDITS) expect(c.licence.length).toBeGreaterThan(2);
		expect(GAME_LICENCE).toMatch(/to be decided/i);
	});
});
