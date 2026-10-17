/** The catalogue rail from the categories registry, with a mod's own category (plan 069, ADR 0146). */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { defineCategory, definePart, definePlugin } from '@orbital/sdk';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { categoriesOf, categoryOf } from '../editor/categories';
import { ICONS } from '../ui/icons';
import Catalogue from './Catalogue.svelte';

const PANEL_ICON = 'M4 6h16v12H4ZM4 12h16M12 6v12';

const Solar = definePlugin({
	meta: { id: 'solar', version: '1.0.0', api: '^0.1' },
	depends: [Stock],
	setup(ctx) {
		ctx.categories.register(
			defineCategory({ id: 'solar.panels', label: 'Solar', icon: { path: PANEL_ICON }, order: 450 })
		);
		ctx.categories.register(
			defineCategory({ id: 'solar.odd', label: 'Odd', icon: 'no-such-icon', order: 550 })
		);
		ctx.parts.register(
			definePart({
				id: 'solar.panel',
				title: 'Panel',
				mass: 20,
				catalog: { category: 'solar.panels' }
			})
		);
		ctx.parts.register(
			definePart({
				id: 'solar.gadget',
				title: 'Gadget',
				mass: 5,
				catalog: { category: 'solar.odd' }
			})
		);
		ctx.parts.register(
			definePart({
				id: 'solar.lost',
				title: 'Lost',
				mass: 5,
				catalog: { category: 'solar.nowhere' }
			})
		);
	}
});

const { registries } = loadPlugins([Stock, Solar]);
const categories = categoriesOf(registries.categories.list());
const html = render(Catalogue, {
	props: {
		parts: registries.parts.list(),
		icons: {},
		armed: null,
		facts: () => [],
		modules: registries.modules,
		categories,
		onarm: () => {}
	}
}).body;

describe('catalogue categories from the registry', () => {
	it('a mod category with order 450 sits between Structural and Aerodynamics', () => {
		expect(categories.map((c) => c.id)).toEqual([
			'stock.command',
			'stock.tanks',
			'stock.propulsion',
			'stock.structural',
			'solar.panels',
			'stock.aero',
			'solar.odd',
			'stock.control',
			'stock.landing',
			'stock.thermal',
			'stock.other'
		]);
	});

	it('a part sits in the mod category it names; an unregistered one lands in Other', () => {
		const of = (id: string) =>
			categoryOf(registries.parts.get(id)!, registries.modules, categories);
		expect(of('solar.panel')).toBe('solar.panels');
		expect(of('solar.lost')).toBe('stock.other');
		expect(of('stock.command-pod')).toBe('stock.command');
	});

	it('the rail shows the tabs in order, the mod path icon, and the fallback for an unknown name', () => {
		const tab = (label: string) => html.indexOf(`title="${label} (`);
		expect(tab('Structural')).toBeGreaterThan(-1);
		expect(tab('Structural')).toBeLessThan(tab('Solar'));
		expect(tab('Solar')).toBeLessThan(tab('Aerodynamics'));
		expect(tab('Aerodynamics')).toBeLessThan(tab('Odd'));
		expect(html).toContain(`d="${PANEL_ICON}"`);
		const odd = html.slice(tab('Odd'), html.indexOf('</button>', tab('Odd')));
		expect(odd).toContain(`d="${ICONS.part}"`);
	});

	it('stock alone shows exactly its own categories on the rail (Other holds the data drive, as before)', () => {
		const stock = loadPlugins([Stock]).registries;
		const own = categoriesOf(stock.categories.list());
		const rail = render(Catalogue, {
			props: {
				parts: stock.parts.list(),
				icons: {},
				armed: null,
				facts: () => [],
				modules: stock.modules,
				categories: own,
				onarm: () => {}
			}
		}).body;
		const labels = [...rail.matchAll(/role="tab"[^>]*title="([^"(]+) \(/g)].map((m) => m[1]);
		expect(labels).toEqual([
			'All parts',
			'Command',
			'Fuel tanks',
			'Engines',
			'Structural',
			'Aerodynamics',
			'Control',
			'Landing',
			'Thermal',
			'Other',
			'Sub-assemblies'
		]);
	});

	it('plan 093: a vertical rail with the chosen tab marked; a card without a cost shows [—]', () => {
		expect(html).toContain('aria-orientation="vertical"');
		const selected = [
			...html.matchAll(/role="tab"[^>]*aria-selected="true"[^>]*title="([^"(]+) \(/g)
		];
		expect(selected.map((m) => m[1])).toEqual(['All parts']);
		const card = (title: string): string => {
			const at = html.indexOf(`>${title}<`);
			expect(at, title).toBeGreaterThan(-1);
			return html.slice(at, html.indexOf('</button>', at));
		};
		expect(card('Panel')).toContain('[—]');
		expect(card('Command Pod')).not.toContain('[—]');
	});
});
