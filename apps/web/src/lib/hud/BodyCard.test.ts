/** The body card (plan 104, ADR 0180): dossier entries locked and unlocked by science results. */
import { dossierOf, loadPlugins, parseSubjectId } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BodyCard from './BodyCard.svelte';

const { registries } = loadPlugins([Stock]);
const home = registries.bodies.get('stock.home')!;
const labelOf = (id: string) =>
	(registries.situations.get(id) ?? registries.experiments.get(id))?.label.toLowerCase() ?? id;
const card = (subjectIds: string[]): string => {
	const subjects = subjectIds.map((id) => ({ ...parseSubjectId(id)!, count: 1 }));
	const dossier = dossierOf(home, subjects, registries.dossierEntries.list(), labelOf);
	return render(BodyCard, { props: { dossier } })
		.body.replace(/<!--.*?-->/g, '')
		.replace(/\s*svelte-[a-z0-9]+/g, '')
		.replace(/ class=""/g, '');
};
const atmosphere = (h: string): string =>
	/data-testid="dossier-atmosphere">([\s\S]*?)<\/div>\s*<div class="entry/.exec(h)![1]!;

describe('body card', () => {
	it('shows the atmosphere profile locked before a flying-high result, and its facts after', () => {
		const before = card(['stock.temperature@stock.home:stock.landed:grass']);
		expect(atmosphere(before)).toContain('Atmosphere profile');
		expect(atmosphere(before)).toContain(
			'Locked: needs a result while flying low or flying high or in space near'
		);
		expect(before).toMatch(/data-testid="dossier-surface">[\s\S]*?<dd>hills<\/dd>/);

		const after = card([
			'stock.temperature@stock.home:stock.landed:grass',
			'stock.pressure@stock.home:stock.flying-high:ocean'
		]);
		expect(atmosphere(after)).not.toContain('Locked');
		expect(atmosphere(after)).toMatch(/<dt>Height<\/dt>\s*<dd>70 km<\/dd>/);
		expect(atmosphere(after)).toMatch(/<dt>Surface pressure<\/dt>\s*<dd>101 kPa<\/dd>/);
		expect(after).toMatch(/<dt>Found<\/dt>\s*<dd>2 of 7<\/dd>/);
	});
});
