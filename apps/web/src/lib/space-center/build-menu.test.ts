/** Plan 235 / ADR 0227: the build menu's categories, cards and reasons from the stock content. */
import { loadPlugins, type BuildingDefinition, type CategoryDefinition } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { categoriesOf } from '../editor/categories';
import { buildMenu, buildReason, cardFacts, stepIndex } from './build-menu';

const { registries } = loadPlugins([Stock]);
const buildings = registries.buildings.list();
const categories = registries.categories.list();
const home = { home: true, body: 'stock.home' };

describe('the build menu', () => {
	it('lists the stock categories in order, each with its buildings', () => {
		const menu = buildMenu(buildings, categories, home);
		expect(menu.map((c) => c.label)).toEqual([
			'Launch',
			'Comms',
			'Science',
			'Crew',
			'Administration',
			'Production',
			'Infrastructure'
		]);
		const of = (label: string) => menu.find((c) => c.label === label)!.cards.map((k) => k.label);
		expect(of('Launch')).toEqual(['Launchpad S', 'Launchpad M', 'Launchpad L', 'Runway']);
		expect(of('Comms')).toEqual(['Tracking dish']);
		expect(of('Science')).toEqual(['R&D', 'Test stand']);
		// at home the off-world kinds come after the buildable ones, disabled with the reason
		const production = menu.find((c) => c.label === 'Production')!.cards;
		expect(production[0]).toMatchObject({ label: 'Propellant plant', reason: null });
		expect(production.slice(1).map((k) => k.reason)).toEqual(
			production.slice(1).map(() => 'Only at an off-world base')
		);
		// every stock building has a card, and a generator for its thumbnail
		expect(menu.flatMap((c) => c.cards).length).toBe(buildings.length);
		expect(menu.flatMap((c) => c.cards).every((k) => k.generator !== null)).toBe(true);
	});

	it('says why a card cannot be built: place, body, then funds', () => {
		const pad = registries.buildings.get('stock.launchpad-s')!;
		expect(buildReason(pad, home)).toBeNull();
		expect(buildReason(pad, { home: false, body: 'stock.cinder' })).toBe(
			'Only at the home Space Center'
		);
		expect(buildReason(pad, { ...home, funds: 5_000 })).toBe('Needs 20,000 funds, 5,000 available');
		const picky: BuildingDefinition = { ...pad, placement: undefined, bodies: ['stock.home'] };
		expect(
			buildReason(picky, { home: false, body: 'stock.cinder', bodyName: () => 'Cinder' })
		).toBe('Cannot be built on Cinder');
		const card = buildMenu([pad], categories, { ...home, funds: 5_000 })[0]!.cards[0]!;
		expect(card.reason).toMatch(/^Needs/);
		expect(cardFacts(card)).toBe('20,000 funds · 30 × 30 m · 5 days · levels 1–3');
		expect(card.levels.map((l) => l.capacity)).toEqual([
			'launch-pad 18',
			'launch-pad 30',
			'launch-pad 45'
		]);
	});

	it('a mod category joins the menu; an unknown category lands in Other; the Hangar rail ignores them', () => {
		const mine: CategoryDefinition = {
			id: 'mymod.power',
			label: 'Power',
			icon: { path: 'M4 4 H20' },
			order: 650,
			scope: 'buildings'
		};
		const pad = registries.buildings.get('stock.launchpad-s')!;
		const menu = buildMenu(
			[
				{ ...pad, id: 'mymod.solar-farm', label: 'Solar farm', category: 'mymod.power' },
				{ ...pad, id: 'mymod.thing', label: 'Thing', category: 'mymod.nowhere' }
			],
			[...categories, mine],
			home
		);
		expect(menu.map((c) => c.label)).toEqual(['Power', 'Other']);
		expect(categoriesOf([...categories, mine]).map((c) => c.id)).not.toContain('mymod.power');
		expect(categoriesOf(categories).map((c) => c.id)).not.toContain('stock.launch');
	});

	it('arrow keys move along a row and wrap', () => {
		expect(stepIndex(3, 0, 'ArrowRight')).toBe(1);
		expect(stepIndex(3, 0, 'ArrowLeft')).toBe(2);
		expect(stepIndex(3, 1, 'End')).toBe(2);
		expect(stepIndex(3, 2, 'Home')).toBe(0);
		expect(stepIndex(0, 0, 'ArrowRight')).toBe(-1);
	});
});
