/** The body card (plan 104, ADR 0180): dossier entries locked and unlocked by science results. */
import {
	discoveryDossier,
	dossierOf,
	loadPlugins,
	parseSubjectId,
	type Command,
	type DiscoverySnapshot
} from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import BodyCard from './BodyCard.svelte';

const { registries } = loadPlugins([Stock]);
const home = registries.bodies.get('stock.home')!;
const labelOf = (id: string) =>
	(registries.situations.get(id) ?? registries.experiments.get(id))?.label.toLowerCase() ?? id;
const card = (
	subjectIds: string[],
	discovery?: DiscoverySnapshot,
	oncommand?: (c: Command) => void
): string => {
	const subjects = subjectIds.map((id) => ({ ...parseSubjectId(id)!, count: 1 }));
	const base = dossierOf(home, subjects, registries.dossierEntries.list(), labelOf);
	const dossier = discovery
		? { ...base, discovery: discoveryDossier('stock.home', discovery) }
		: base;
	return render(BodyCard, { props: { dossier, ...(oncommand ? { oncommand } : {}) } })
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

describe('body card: discovery (plan 129, ADR 0192 point 10)', () => {
	const fact = (id: string, label: string, unit: string) => ({
		body: 'stock.home',
		fact: id,
		label,
		unit,
		tolerance: 5
	});
	const snap: DiscoverySnapshot = {
		facts: [
			{ ...fact('stock.polar-ice', 'Polar ice', '%'), status: 'settled', value: 24.9 },
			{ ...fact('stock.magnetic-field', 'Magnetic field', 'μT'), status: 'open' },
			{ ...fact('stock.subsurface-ocean', 'Subsurface ocean', 'km'), status: 'open' },
			{ ...fact('stock.polar-ice', 'Polar ice', '%'), body: 'stock.moon', status: 'open' }
		],
		data: [
			{
				id: 'd1',
				body: 'stock.home',
				fact: 'stock.magnetic-field',
				level: 'raw',
				value: 40,
				sigma: 12
			},
			{
				id: 'd2',
				body: 'stock.home',
				fact: 'stock.magnetic-field',
				level: 'calibrated',
				value: 47.5,
				sigma: 6,
				processing: { to: 'derived', until: 9e9 }
			}
		],
		claims: [
			{
				id: 'c3',
				body: 'stock.home',
				fact: 'stock.polar-ice',
				value: 24,
				confidence: 0.9,
				made: 0,
				due: 1,
				verdict: 'accepted',
				priority: true,
				reputation: 19.2
			},
			{
				id: 'c4',
				body: 'stock.home',
				fact: 'stock.magnetic-field',
				value: 90,
				confidence: 0.9,
				made: 0,
				due: 1,
				verdict: 'rejected',
				reputation: -44.8
			},
			{
				id: 'c5',
				body: 'stock.home',
				fact: 'stock.subsurface-ocean',
				value: 0,
				confidence: 0.6,
				made: 0,
				due: 9e9
			}
		],
		labSlots: 1,
		processing: 1
	};

	it("shows the body's open facts, the best data, the player's claims and their verdicts", () => {
		const h = card([], snap);
		const section = /data-testid="dossier-discovery">([\s\S]*?)<\/section>/.exec(h)![1]!;
		expect(section).toMatch(/data-testid="discovery-fact-stock.polar-ice">\s*24.9 %/);
		expect(section).toMatch(
			/data-testid="discovery-fact-stock.magnetic-field">\s*open<small>47.5 ± 6 μT · calibrated<\/small><small>1 in the lab<\/small>/
		);
		expect(section).toMatch(/data-testid="discovery-fact-stock.subsurface-ocean">\s*open\s*<\/dd>/);
		// only this body's facts
		expect(section.match(/discovery-fact-stock.polar-ice/g)).toHaveLength(1);
		expect(section).toMatch(/Polar ice: 24 % at 90% · accepted\s*\(first\)\s*· \+19.2 reputation/);
		expect(section).toMatch(/Magnetic field: 90 μT at 90% · rejected\s*· −44.8 reputation/);
		expect(section).toMatch(/Subsurface ocean: none at 60% · in review\s*<\/li>/);
	});

	it('offers lab processing of the best open dataset and a claim form for open facts only', () => {
		const h = card([], snap, () => {});
		// d2 is in the lab, so d1 is next for the magnetic field; nothing to process for the ocean
		expect(h).toContain('data-testid="discovery-process-d1"');
		expect(h).not.toContain('discovery-process-d2');
		expect(h).toContain('data-testid="discovery-claim-stock.magnetic-field"');
		expect(h).toContain('data-testid="discovery-claim-stock.subsurface-ocean"');
		expect(h).not.toContain('discovery-act-stock.polar-ice');
		expect(card([], snap)).not.toContain('discovery-act-');
	});

	it('has no Discovery entry with classic science', () => {
		expect(card([])).not.toContain('dossier-discovery');
	});
});
