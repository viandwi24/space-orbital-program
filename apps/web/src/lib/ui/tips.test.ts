/**
 * Tooltips and the glossary (plan 228): no native `title=` outside the allow-list (the one tooltip
 * reads `data-tip`), every term a HUD tooltip names has a glossary entry with a short text under
 * 140 characters, and the player glossary stays listed in the developer glossary.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, SHORT_MAX, glossaryEntry, searchGlossary } from '../public/glossary';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..');
/** Elements where the browser's own tooltip is the only one (plan 228). */
const ALLOWED = new Set(['canvas', 'iframe']);

function files(dir: string, ext: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) files(p, ext, out);
		else if (p.endsWith(ext)) out.push(p);
	}
	return out;
}

describe('tooltips (plan 228)', () => {
	it('finds no native title= outside the allow-list', () => {
		const found: string[] = [];
		for (const f of files(src, '.svelte')) {
			const s = readFileSync(f, 'utf8');
			for (const m of s.matchAll(/(?<![\w-])title=/g)) {
				const open = s.lastIndexOf('<', m.index);
				const name = /^<([A-Za-z][\w:.-]*)/.exec(s.slice(open))?.[1] ?? '?';
				const native = name[0] === name[0]!.toLowerCase() && !name.startsWith('svelte:');
				if ((native && !ALLOWED.has(name)) || name === 'Button' || name === 'IconButton')
					found.push(`${relative(src, f)}:${s.slice(0, m.index).split('\n').length} <${name}>`);
			}
		}
		expect(found).toEqual([]);
	});

	it('every term a HUD tooltip names is in the glossary, each with a short text', () => {
		const used = new Set<string>();
		for (const f of [...files(src, '.svelte'), ...files(src, '.ts')]) {
			const s = readFileSync(f, 'utf8');
			for (const m of s.matchAll(
				/<Term id="([\w-]+)"|termTip\('([\w-]+)'\)|data-tip-term="([\w-]+)"/g
			))
				used.add(m[1] ?? m[2] ?? m[3]!);
		}
		expect(used.size).toBeGreaterThanOrEqual(8);
		for (const id of used) expect(glossaryEntry(id), id).toBeDefined();
		for (const e of GLOSSARY) {
			expect(e.short.length, e.id).toBeLessThan(SHORT_MAX);
			for (const r of e.related ?? []) expect(glossaryEntry(r), `${e.id} → ${r}`).toBeDefined();
		}
		expect(new Set(GLOSSARY.map((e) => e.id)).size).toBe(GLOSSARY.length);
	});

	it('the glossary search finds one entry for TWR, and every HUD abbreviation has an entry', () => {
		expect(searchGlossary('TWR').map((e) => e.id)).toEqual(['twr']);
		for (const abbr of ['Ap', 'Pe', 'TWR', 'Δv', 'Isp', 'SOI', 'MET', 'AN / DN', 'Q', 'Mach', 'EC'])
			expect(
				GLOSSARY.some((e) => e.abbr === abbr),
				abbr
			).toBe(true);
	});

	it('the developer glossary lists every player entry', () => {
		const doc = readFileSync(join(src, '..', '..', '..', 'docs', 'product', 'glossary.md'), 'utf8');
		for (const e of GLOSSARY) expect(doc, e.id).toContain(`\`${e.id}\``);
	});
});
