/** Create World's form (plan 087): generated from the registries, n-body shown and disabled. */
import { calendarOf, loadPlugins } from '@orbital/core';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { systemsOf, type WorldCatalog } from './catalog';
import CreateWorld from './CreateWorld.svelte';
import { createWorldInfo, formatLatLon, resolveSiteChoice } from './world-model';

const { registries } = loadPlugins([Stock]);
const bodies = registries.bodies.list();
const catalog: WorldCatalog = {
	rules: registries.rules.list(),
	presets: registries.presets.list(),
	bodies,
	calendar: calendarOf(bodies),
	system: { id: 'stock', version: '0.1.0', label: 'Stock system', variants: ['default'] },
	mods: [{ id: 'stock', version: '0.1.0' }],
	siteTemplates: registries.siteTemplates.list(),
	systems: systemsOf([Stock, Sol]),
	achievements: registries.achievements.list(),
	scenarios: registries.scenarios.list()
};
const html = (
	initialSite?: string,
	initialStep: 'mode' | 'world' | 'rules' = 'world',
	initialCategory?: string
): string =>
	render(CreateWorld, {
		props: {
			...(initialSite ? { initialSite } : {}),
			initialStep,
			...(initialCategory ? { initialCategory } : {}),
			open: true,
			catalog,
			onclose: () => {},
			oncreate: () => {},
			newId: () => 'w-1',
			newSeed: () => 42
		}
	}).body.replace(/<!--.*?-->/g, '');

describe('Create World form', () => {
	it("lists Sol's variants with the Δv to orbit and the Moon transfer time from the pack data", () => {
		const sol = catalog.systems.find((x) => x.id === 'sol')!;
		expect(sol.variants.map((v) => v.variant)).toEqual(['1:1', 'rescaled']);
		const h = render(CreateWorld, {
			props: {
				open: true,
				catalog: { ...catalog, systems: [sol, ...catalog.systems.filter((x) => x !== sol)] },
				initialStep: 'world',
				onclose: () => {},
				oncreate: () => {},
				newId: () => 'w-1',
				newSeed: () => 42
			}
		}).body.replace(/<!--.*?-->/g, '');
		for (const v of sol.variants) {
			const f = v.facts!;
			expect(h).toContain(v.label);
			expect(h).toContain(`Δv to orbit ≈ ${(f.dvToOrbit / 1000).toFixed(1)} km/s`);
			expect(h).toContain(`Moon in ${(f.moonTransfer! / 86_400).toFixed(1)} days`);
		}
		// the systems are cards with generated art (plan 317, ADR 0273)
		expect(h).toContain('data-testid="world-system-sol"');
		expect(h).toContain('The real solar system');
		expect(h).toContain('data-testid="system-art"');
	});

	it('offers n-body beside patched conics since plan 125', () => {
		const h = html();
		expect(h).toMatch(/<input[^>]*value="n-body"[^>]*data-testid="gravity-n-body"/);
		expect(h).not.toMatch(/<input[^>]*value="n-body"[^>]*disabled/);
		expect(h).not.toContain('Coming soon');
		expect(h).toMatch(/<input[^>]*value="patched"/);
	});

	it('shows every registered rule, grouped, with the identity rules marked', () => {
		const first = html(undefined, 'rules');
		for (const c of ['economy', 'science', 'crew', 'comms', 'launch', 'agency']) {
			expect(first).toContain(`data-testid="rules-${c}"`);
		}
		// one category at a time (V3 §4.4): together they hold every rule
		const all = [...new Set(catalog.rules.map((r) => r.category))]
			.map((c) => html(undefined, 'rules', c))
			.join('');
		for (const rule of catalog.rules) expect(all).toContain(`data-testid="rule-${rule.id}"`);
		const h = html(undefined, 'rules', 'agency');
		const agency = h.slice(
			h.indexOf('Agency type'),
			h.indexOf('data-testid="rule-stock.agency-type"')
		);
		expect(agency).toContain('Fixed for this world');
	});

	it('the stock calendar starts on day 1; the real-date starts are shown disabled', () => {
		const h = html();
		expect(h).toContain('This star system has its own calendar: worlds start on day 1.');
		expect(h).toMatch(/<input[^>]*value="today"[^>]*disabled/);
	});

	it('a site template shows its resolved place and consequences; the default shows the Legacy site (plan 092)', () => {
		const h = html('stock.equatorial-coast');
		const choice = resolveSiteChoice(catalog, 'stock.equatorial-coast', 42)!;
		const text = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
		expect(text).toContain(formatLatLon(choice.latitude, choice.longitude));
		expect(text).toContain(`${choice.consequences.rotationBoost.toFixed(0)} m/s`);
		expect(text).toMatch(/Downrange east (over the sea|over land|over land and sea)/);
		expect(h).toMatch(/<input[^>]*value="stock\.equatorial-coast"[^>]*checked/);
		expect(html()).not.toContain('data-testid="site-consequences"');
		for (const t of catalog.siteTemplates) expect(h).toContain(t.label);
	});

	it('createWorldInfo writes the chosen site as the first site; the default keeps sites empty', () => {
		const choice = resolveSiteChoice(catalog, 'stock.high-latitude', 42)!;
		const input = {
			id: 'w-1',
			seed: 42,
			preset: catalog.presets[0]!.id,
			rules: {},
			start: { kind: 'day-one' as const },
			gravityModel: 'patched',
			systemId: 'stock',
			systemVersion: '0.1.0',
			variant: 'default'
		};
		const withSite = createWorldInfo(
			{ ...input, site: { latitude: choice.latitude, longitude: choice.longitude } },
			catalog,
			catalog.calendar,
			0
		);
		expect(withSite.ok).toBe(true);
		const site = withSite.ok ? withSite.world.sites[0]! : undefined;
		expect(site).toMatchObject({
			id: 'space-center',
			kind: 'space-center',
			latitude: choice.latitude,
			longitude: choice.longitude
		});
		const plain = createWorldInfo(input, catalog, catalog.calendar, 0);
		expect(plain.ok && plain.world.sites).toEqual([]);
	});

	it("a mod's preset with its own illustration shows it; the stock modes show their line art (ADR 0273)", () => {
		const image = 'data:image/svg+xml,%3Csvg xmlns%3D%22http://www.w3.org/2000/svg%22/%3E';
		const h = render(CreateWorld, {
			props: {
				open: true,
				catalog: {
					...catalog,
					presets: [
						...catalog.presets,
						{ id: 'mod.speedrun', label: 'Speedrun', illustration: image }
					]
				},
				onclose: () => {},
				oncreate: () => {},
				newId: () => 'w-1',
				newSeed: () => 42
			}
		}).body;
		expect(h).toContain(`<img src="${image}"`);
		expect(h).toContain('data-testid="world-preset-stock.career"');
		expect(h.match(/<svg viewBox="0 0 240 150"/g)).toHaveLength(catalog.presets.length);
	});
});
