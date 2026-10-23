/** Plan 376 (ADR 0312): the Mods page's cards, counts, chips, dependencies, search and sort. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { recordOf } from './fixtures';
import type { ModStatus } from './manager.svelte';
import {
	countsByPlugin,
	countsFromLog,
	modCards,
	modHue,
	monogram,
	shownCards,
	viewerHref,
	type CardInput
} from './mod-cards';

const builtins = [
	{ id: 'stock', title: 'Orbital stock content', version: '0.1.0', api: '^0.1' },
	{ id: 'guidance', title: 'Guidance Computer', version: '0.2.0', api: '^0.1' }
];

async function input(over: Partial<CardInput> = {}, statuses: Record<string, ModStatus> = {}) {
	const a = await recordOf('acme.rockets', { order: 0 });
	a.manifest = { ...a.manifest, author: 'Acme', dependencies: { stock: '^0.1' } };
	const b = await recordOf('zed.extras', { order: 1, enabled: false });
	b.manifest = { ...b.manifest, dependencies: { 'acme.rockets': '^2.0', missing: '^1.0' } };
	b.installedAt = 5;
	return {
		builtins,
		records: [b, a],
		statusOf: (r) => statuses[r.id] ?? (r.enabled ? { kind: 'running' } : { kind: 'off' }),
		patchesOf: () => [],
		counts: new Map([['acme.rockets', { parts: 3, programs: 1 }]]),
		apiVersion: '0.1.110',
		...over
	} satisfies CardInput;
}

describe('countsByPlugin', () => {
	it('counts what each plugin registered, by kind', () => {
		const counts = countsByPlugin(loadPlugins([Stock]).registries);
		expect(counts.get('stock')?.parts).toBeGreaterThan(20);
		expect(counts.get('stock')?.world).toBeGreaterThan(0);
	});
});

describe('modCards', () => {
	it('built-ins first, always on and not removable; installed in load order', async () => {
		const cards = modCards(await input());
		expect(cards.map((c) => [c.id, c.builtin, c.removable])).toEqual([
			['stock', true, false],
			['guidance', true, false],
			['acme.rockets', false, true],
			['zed.extras', false, true]
		]);
		expect(cards[0]!.source).toBe('Built-in');
	});

	it('counts link to the developer viewers filtered by the mod', async () => {
		const acme = modCards(await input()).find((c) => c.id === 'acme.rockets')!;
		expect(acme.counts).toEqual([
			{ key: 'parts', label: 'parts', n: 3, href: viewerHref('parts', 'acme.rockets') },
			{ key: 'programs', label: 'program', n: 1, href: viewerHref('programs', 'acme.rockets') }
		]);
		expect(viewerHref('parts', 'acme.rockets')).toBe('/developer?tab=parts&mod=acme.rockets');
	});

	it('marks dependencies and the API range', async () => {
		const cards = modCards(await input({ apiVersion: '0.2.0' }));
		const acme = cards.find((c) => c.id === 'acme.rockets')!;
		expect(acme.deps).toEqual([{ id: 'stock', range: '^0.1', ok: true, why: null }]);
		expect(acme.api).toEqual({ range: '^0.1', ok: false });
		const zed = cards.find((c) => c.id === 'zed.extras')!;
		expect(zed.deps.map((d) => [d.id, d.ok, d.why])).toEqual([
			['acme.rockets', false, '1.0.0 installed'],
			['missing', false, 'not installed or off']
		]);
	});

	it('status chips: loaded, warnings, failed, needs a reload, off', async () => {
		const chips = (s: Record<string, ModStatus>, patches = 0) =>
			input(
				{
					patchesOf: (id) =>
						id === 'acme.rockets'
							? Array.from({ length: patches }, (_, i) => ({
									id: `p${i}`,
									by: id,
									target: 'part' as const,
									applied: [],
									changes: [],
									disabled: 'no match'
								}))
							: []
				},
				s
			).then((i) => modCards(i).find((c) => c.id === 'acme.rockets')!.chip);
		expect((await chips({})).label).toBe('Loaded');
		expect((await chips({}, 2)).tone).toBe('warn');
		expect((await chips({}, 2)).reason).toBe('2 patches did not apply');
		expect(await chips({ 'acme.rockets': { kind: 'failed', reason: 'threw' } })).toEqual({
			tone: 'bad',
			label: 'Failed',
			reason: 'threw'
		});
		expect((await chips({ 'acme.rockets': { kind: 'starts-after-reload' } })).label).toBe(
			'Needs a reload'
		);
	});

	it('Update only for a mod downloaded from an address', async () => {
		const i = await input();
		const a = i.records.find((r) => r.id === 'acme.rockets')!;
		a.source = { kind: 'url', url: 'https://example.com/a.orbital-mod.json' };
		const card = modCards(i).find((c) => c.id === 'acme.rockets')!;
		expect(card.updateUrl).toBe('https://example.com/a.orbital-mod.json');
		expect(modCards(i).find((c) => c.id === 'zed.extras')!.updateUrl).toBeNull();
	});
});

describe('shownCards', () => {
	it('searches, filters and sorts', async () => {
		const cards = modCards(await input({ apiVersion: '0.1.110' }));
		const ids = (o: Partial<Parameters<typeof shownCards>[1]>) =>
			shownCards(cards, { query: '', filter: 'all', sort: 'order', ...o }).map((c) => c.id);
		expect(ids({ query: 'acme' })).toEqual(['acme.rockets']);
		expect(ids({ filter: 'disabled' })).toEqual(['zed.extras']);
		expect(ids({ filter: 'enabled' })).toEqual(['stock', 'guidance', 'acme.rockets']);
		expect(ids({ sort: 'name' })[0]).toBe('guidance');
		expect(ids({ sort: 'recent' })[0]).toBe('zed.extras');
	});
});

describe('the monogram tile', () => {
	it('two letters and a stable hue', () => {
		expect(monogram('Guidance Computer')).toBe('GC');
		expect(monogram('autodock')).toBe('AU');
		expect(modHue('acme.rockets')).toBe(modHue('acme.rockets'));
		expect(modHue('a')).not.toBe(modHue('b'));
	});
});

describe('the loader log (plan 375)', () => {
	it('maps its registry kinds to the card counts, programs from the registries', () => {
		const counts = countsFromLog(
			[
				{
					id: 'acme',
					counts: { part: 2, 'crew-outfit': 1, 'crew-look': 2, body: 1, module: 9, blueprint: 1 }
				}
			],
			new Map([['acme', { programs: 3, parts: 99 }]])
		);
		expect(counts.get('acme')).toEqual({ parts: 2, crew: 3, world: 1, blueprints: 1, programs: 3 });
	});

	it('its warnings make the chip amber, in its own words', async () => {
		const i = await input({
			warningsOf: (id) => (id === 'acme.rockets' ? ['registers nothing'] : [])
		});
		const chip = modCards(i).find((c) => c.id === 'acme.rockets')!.chip;
		expect(chip).toEqual({
			tone: 'warn',
			label: 'Loaded with warnings',
			reason: 'registers nothing'
		});
	});
});
