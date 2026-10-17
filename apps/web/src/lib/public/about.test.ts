/** The product name (plan 074, ADR 0105): one constant, read by every title and the menu. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import PageMeta from '../ui/PageMeta.svelte';
import { GAME_DESCRIPTION, GAME_NAME } from './about';

/** Every `.svelte` file under a directory. */
function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return svelteFiles(path);
		return name.endsWith('.svelte') ? [path] : [];
	});
}

describe('product name', () => {
	it('is Space Orbital Program', () => {
		expect(GAME_NAME).toBe('Space Orbital Program');
		expect(GAME_DESCRIPTION.startsWith(`${GAME_NAME} is`)).toBe(true);
	});
	it('PageMeta puts it in the title and the site name', () => {
		const { head } = render(PageMeta, { props: { title: `Credits · ${GAME_NAME}` } });
		expect(head).toContain('<title>Credits · Space Orbital Program</title>');
		expect(head).toContain('og:site_name" content="Space Orbital Program"');
	});
	it('no page or component writes the old name as text or in a title', () => {
		const root = new URL('../..', import.meta.url).pathname;
		const old = /title="[^"]*\bOrbital"|>\s*Orbital\b|\bOrbital (is|needs|mods)\b/;
		const hits = svelteFiles(root).filter((f) => old.test(readFileSync(f, 'utf8')));
		expect(hits).toEqual([]);
	});
});
