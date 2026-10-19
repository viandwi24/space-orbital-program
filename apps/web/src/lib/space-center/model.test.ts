/** Plan 091 / ADR 0117: the overlay's rows, keyboard selection, and build mode against canPlace. */
import { LEGACY_LAYOUT, LEGACY_SITE, loadPlugins, type Command } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import {
	actionOf,
	buildingRows,
	checkGhost,
	confirmPlacement,
	ghostCell,
	moveSelection,
	nextRotation,
	siteViews,
	spreadLabels,
	statusTextOf,
	upkeepWarning,
	marketRows,
	productionNote,
	flowRows,
	kindsFor,
	firstFreeCell,
	steadyLabels
} from './model';
import SpaceCenterOverlay from './SpaceCenterOverlay.svelte';
import { buildMenu } from './build-menu';

const { registries } = loadPlugins([Stock]);
const reg = registries.buildings;
const site = { id: 'legacy', buildings: LEGACY_LAYOUT.buildings, roads: LEGACY_LAYOUT.roads };

const props = (over: Record<string, unknown> = {}) => ({
	rows: buildingRows(site, reg),
	labels: {},
	selected: null,
	onselect: () => {},
	menu: buildMenu(reg.list(), registries.categories.list(), { home: true, body: 'stock.home' }),
	build: null,
	onbuild: () => {},
	onrotate: () => {},
	onremove: () => {},
	...over
});

describe('the overlay', () => {
	it('lists every building of the site with its status, as focusable rows', () => {
		const rows = buildingRows(site, reg);
		expect(rows.map((r) => r.label)).toEqual([
			'Launchpad S',
			'Hangar',
			'Mission Center',
			'Administration'
		]);
		const html = render(SpaceCenterOverlay, { props: props() }).body;
		for (const r of rows) {
			expect(html).toContain(`data-testid="sc-row-${r.id}"`);
			expect(html).toContain(r.statusText);
		}
		expect(html).toContain('Every building is running.');
		// the Mission Center opens since plan 113
		expect(rows.find((r) => r.label === 'Mission Center')!.action).toEqual({
			kind: 'link',
			href: '/mission-center',
			label: 'Open the Mission Center'
		});
		// the world's name is in the status bar since plan 233, not over the site
		expect(html).not.toContain('world-capsule');
		// a lab opens R&D since plan 105
		expect(actionOf(['lab'])).toEqual({ kind: 'link', href: '/rnd', label: 'Open R&D' });
		// the test stand opens since plan 130
		expect(actionOf(['test-stand'])).toEqual({
			kind: 'link',
			href: '/test-stand',
			label: 'Open the test stand'
		});
		// Administration opens since plan 099 (its Contracts tab)
		expect(actionOf(['admin'])).toEqual({
			kind: 'link',
			href: '/administration',
			label: 'Open Administration'
		});
	});

	it('keyboard: arrows reach every building in turn and wrap; the selected one opens its detail', () => {
		const rows = buildingRows(site, reg);
		const seen: number[] = [];
		let i = -1;
		for (let k = 0; k < rows.length + 1; k++)
			seen.push((i = moveSelection(rows.length, i, 'ArrowDown')));
		expect(seen).toEqual([0, 1, 2, 3, 0]);
		expect(moveSelection(rows.length, 0, 'ArrowUp')).toBe(3);
		expect(moveSelection(rows.length, 2, 'End')).toBe(3);
		const hangar = rows.find((r) => r.kind === 'stock.hangar')!;
		const html = render(SpaceCenterOverlay, { props: props({ selected: hangar.id }) }).body;
		expect(html).toContain('data-testid="sc-detail"');
		expect(html).toContain('href="/vab"');
		expect(html).toContain('Open the Hangar');
		const pad = rows.find((r) => r.kind === 'stock.launchpad-s')!;
		const padHtml = render(SpaceCenterOverlay, { props: props({ selected: pad.id }) }).body;
		expect(padHtml).toContain('it launches from this pad');
	});

	it('renders the label of a building only where it is on screen', () => {
		const rows = buildingRows(site, reg);
		const html = render(SpaceCenterOverlay, {
			props: props({ labels: { [rows[1]!.id]: { x: 300, y: 200 }, [rows[0]!.id]: null } })
		}).body;
		expect(html).toContain('data-testid="sc-label-stock.hangar"');
		expect(html).not.toContain('data-testid="sc-label-stock.launchpad-s"');
	});
});

describe('build mode', () => {
	it('an invalid ghost shows the reasons canPlace gives', () => {
		const cell = ghostCell({ east: 0, north: 0 }, reg.get('stock.tracking-dish')!, 0);
		const check = checkGhost(LEGACY_SITE, site, reg, 'stock.tracking-dish', cell, 0);
		expect(check.valid).toBe(false);
		expect(check.reasons.join(' ')).toContain('overlaps building legacy-pad');
		const html = render(SpaceCenterOverlay, {
			props: props({
				build: {
					kind: 'stock.tracking-dish',
					label: 'Tracking dish',
					valid: false,
					reasons: check.reasons
				}
			})
		}).body;
		expect(html).toContain('overlaps building legacy-pad');
	});

	it('confirming a valid ghost dispatches place-building; an invalid one dispatches nothing', async () => {
		const sent: Command[] = [];
		const dispatch = async (c: Command) => (sent.push(c), { ok: true as const });
		const def = reg.get('stock.tracking-dish')!;
		const cell = ghostCell({ east: 105, north: -15 }, def, 90);
		const check = checkGhost(LEGACY_SITE, site, reg, def.id, cell, 90);
		expect(check.valid).toBe(true);
		await confirmPlacement(
			{ kind: def.id, cell, rotation: 90, check },
			'legacy',
			() => 'id-1',
			dispatch
		);
		expect(sent).toEqual([
			{ type: 'place-building', site: 'legacy', kind: def.id, cell, rotation: 90, id: 'id-1' }
		]);
		const bad = checkGhost(LEGACY_SITE, site, reg, def.id, { i: 0, j: 0 }, 0);
		expect(
			await confirmPlacement(
				{ kind: def.id, cell: { i: 0, j: 0 }, rotation: 0, check: bad },
				'legacy',
				() => 'x',
				dispatch
			)
		).toBeNull();
		expect(sent).toHaveLength(1);
		expect(nextRotation(270)).toBe(0);
	});

	it('the renderer list carries each building generator and footprint', () => {
		expect(siteViews(site, reg).map((v) => v.generator)).toEqual([
			'launch-pad',
			'hangar',
			'control',
			'office'
		]);
	});
});

describe('labels', () => {
	it('labels that would overlap are stacked; distant ones keep their place', () => {
		const out = spreadLabels({
			a: { x: 300, y: 200 },
			b: { x: 320, y: 210 },
			c: { x: 800, y: 200 },
			d: null
		});
		expect(out.b).toEqual({ x: 320, y: 210 }); // lowest on screen stays
		expect(out.a!.y).toBeLessThanOrEqual(210 - 40);
		expect(out.c).toEqual({ x: 800, y: 200 });
		expect(out.d).toBeNull();
	});

	it('a label moving less than a pixel stays put; a real move lands on whole pixels', () => {
		const prev = { a: { x: 100, y: 50 } };
		expect(steadyLabels({ a: { x: 100.4, y: 49.7 } }, prev).a).toBe(prev.a);
		expect(steadyLabels({ a: { x: 103.6, y: 50.2 } }, prev).a).toEqual({ x: 104, y: 50 });
	});
});

describe('construction and upkeep (plan 096, ADR 0123 point 6)', () => {
	it('a row says what the building is doing and when it is ready', () => {
		expect(statusTextOf({ state: 'active', level: 0 }, 10)).toBe('Level 1 · running');
		expect(statusTextOf({ state: 'building', level: 0, readyDay: 12 }, 10)).toBe(
			'Under construction · ready in 2 days'
		);
		expect(statusTextOf({ state: 'upgrading', level: 1, readyDay: 11 }, 10)).toBe(
			'Level 2 · upgrading to 3 · ready in 1 day'
		);
	});
	it('an active building below its top level offers the next level with its cost and days', () => {
		const rows = buildingRows({ id: 'legacy', buildings: LEGACY_LAYOUT.buildings, roads: [] }, reg);
		const hangar = rows.find((r) => r.kind === 'stock.hangar')!;
		const next = reg.get('stock.hangar')!.levels[1]!;
		expect(hangar.upgrade).toEqual({ level: 1, cost: next.cost, days: next.buildDays });
	});
	it('the next upkeep over the funds needs attention', () => {
		expect(upkeepWarning(1_000, 2_400, 25)).toBe(
			'Upkeep of 2,400 due in 5 days is more than the funds'
		);
		expect(upkeepWarning(5_000, 2_400, 25)).toBeNull();
		expect(upkeepWarning(undefined, 2_400, 25)).toBeNull();
	});
});

describe('the Market panel (plan 097, ADR 0124 point 8)', () => {
	const economy = {
		enabled: true,
		funds: -10,
		science: 0,
		reputation: 0,
		markets: [
			{
				id: 'stock.liquid-fuel',
				label: 'Liquid fuel',
				unit: 'u',
				base: 0.8,
				price: 0.76,
				stock: 6e4,
				history: [0.76]
			},
			{ id: 'stock.data', label: 'Data', unit: 'Mbit', base: 5, price: 5, stock: 0, history: [] }
		],
		storage: [{ site: 'legacy', capacity: 20_000, items: { 'stock.liquid-fuel': 1234.6 } }]
	};
	it('lists price, trend against base and what the site holds', () => {
		expect(marketRows(economy, 'legacy')).toEqual([
			{
				id: 'stock.liquid-fuel',
				label: 'Liquid fuel',
				price: '0.76 / u',
				trend: '−5 %',
				held: 1234
			},
			{ id: 'stock.data', label: 'Data', price: '5.00 / Mbit', trend: null, held: null }
		]);
		expect(marketRows({ ...economy, enabled: false }, 'legacy')).toEqual([]);
	});
	it('a working plant in a world in debt needs attention', () => {
		const site = {
			id: 'legacy',
			roads: [],
			buildings: [
				{
					id: 'p',
					kind: 'stock.propellant-plant',
					cell: { i: 0, j: 0 },
					rotation: 0 as const,
					level: 0,
					state: 'active' as const
				}
			]
		};
		const producers = new Set(['stock.propellant-plant']);
		expect(productionNote(economy, site, producers)).toBe(
			'Production stopped: funds are below zero'
		);
		expect(productionNote({ ...economy, funds: 5 }, site, producers)).toBeNull();
	});
});

describe('a base in the Space Center (plan 128, ADR 0125 point 7)', () => {
	const base = {
		id: 'b',
		roads: [],
		members: [7 as never],
		buildings: [
			{
				id: 'hub',
				kind: 'stock.base-hub',
				cell: { i: -1, j: -1 },
				rotation: 0 as const,
				level: 0,
				state: 'active' as const
			},
			{
				id: 'isru',
				kind: 'stock.isru-plant',
				cell: { i: 5, j: -2 },
				rotation: 0 as const,
				level: 0,
				state: 'active' as const
			}
		]
	};
	const label = (id: string) =>
		id === 'legacy' ? 'space center' : id.replace('stock.', '').replace('-', ' ');
	it('the Flows panel lists the recipe, the drills, the routes and the storage', () => {
		const rows = flowRows(base, {
			buildings: reg,
			recipes: registries.recipes.list(),
			vessels: [
				{ id: 7, parts: [{ definition: 'stock.drill' }, { definition: 'stock.drill' }] }
			] as never,
			drillPerDay: 50,
			economy: {
				enabled: true,
				funds: 1,
				science: 0,
				reputation: 0,
				storage: [{ site: 'b', capacity: 5_000, items: { 'stock.ice': 300 } }],
				routes: [
					{
						id: 'r1',
						from: 'legacy',
						to: 'b',
						commodity: 'stock.liquid-fuel',
						amount: 1_000,
						nextDay: 12
					}
				]
			},
			today: 10,
			label
		});
		expect(rows).toEqual([
			'ISRU plant: 100 ice → 40 liquid fuel + 49 oxidizer a day',
			'Drills (2 on 1 outpost): +100 ice a day',
			'Route r1: 1,000 liquid fuel from space center, next in 2 days',
			'Storage: 300 / 5,000 u'
		]);
	});
	it('the build dock offers a base the off-world kinds only, and finds a free cell', () => {
		const off = kindsFor(reg.list(), false).map((k) => k.id);
		expect(off).toEqual(['stock.base-hub', 'stock.isru-plant', 'stock.storage-module']);
		expect(kindsFor(reg.list(), true).map((k) => k.id)).not.toContain('stock.isru-plant');
		const cell = firstFreeCell(
			{ body: 'stock.cinder', flatRadius: 5_000 },
			base,
			reg,
			'stock.storage-module',
			false
		);
		expect(cell).not.toBeNull();
	});
});
