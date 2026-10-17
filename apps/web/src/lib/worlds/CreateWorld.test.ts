/** Create World's form (plan 087): generated from the registries, n-body shown and disabled. */
import { calendarOf, loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import type { WorldCatalog } from './catalog';
import CreateWorld from './CreateWorld.svelte';

const { registries } = loadPlugins([Stock]);
const bodies = registries.bodies.list();
const catalog: WorldCatalog = {
	rules: registries.rules.list(),
	presets: registries.presets.list(),
	bodies,
	calendar: calendarOf(bodies),
	system: { id: 'stock', version: '0.1.0', label: 'Stock system', variants: ['default'] },
	mods: [{ id: 'stock', version: '0.1.0' }]
};
const html = (): string =>
	render(CreateWorld, {
		props: {
			open: true,
			catalog,
			onclose: () => {},
			oncreate: () => {},
			newId: () => 'w-1',
			newSeed: () => 42
		}
	}).body.replace(/<!--.*?-->/g, '');

describe('Create World form', () => {
	it('renders the n-body option disabled and labelled Coming soon', () => {
		const h = html();
		expect(h).toMatch(/<input[^>]*value="n-body"[^>]*disabled[^>]*data-testid="gravity-n-body"/);
		expect(h).toMatch(/N-body\s*<span class="chip[^"]*outline[^"]*">Coming soon<\/span>/);
		expect(h).toMatch(/<input[^>]*value="patched"/);
	});

	it('shows every registered rule, grouped, with the identity rules marked', () => {
		const h = html();
		for (const rule of catalog.rules) expect(h).toContain(`data-testid="rule-${rule.id}"`);
		for (const c of ['economy', 'science', 'crew', 'comms', 'launch', 'agency']) {
			expect(h).toContain(`data-testid="rules-${c}"`);
		}
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
});
