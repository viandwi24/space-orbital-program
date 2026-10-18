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
	steadyLabels
} from './model';
import SpaceCenterOverlay from './SpaceCenterOverlay.svelte';

const { registries } = loadPlugins([Stock]);
const reg = registries.buildings;
const site = { id: 'legacy', buildings: LEGACY_LAYOUT.buildings, roads: LEGACY_LAYOUT.roads };

const props = (over: Record<string, unknown> = {}) => ({
	worldName: 'Moon program',
	rows: buildingRows(site, reg),
	labels: {},
	selected: null,
	onselect: () => {},
	buildKinds: reg.list().map((b) => ({ id: b.id, label: b.label })),
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
		expect(html).toContain('Moon program');
		// a lab opens R&D since plan 105
		expect(actionOf(['lab'])).toEqual({ kind: 'link', href: '/rnd', label: 'Open R&D' });
		// the test stand opens since plan 130
		expect(actionOf(['test-stand'])).toEqual({
			kind: 'link',
			href: '/test-stand',
			label: 'Open the test stand'
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
		expect(upkeepWarning(1_000, 2_400, 25)).toBe('Upkeep of 2,400 due in 5 days is more than the funds');
		expect(upkeepWarning(5_000, 2_400, 25)).toBeNull();
		expect(upkeepWarning(undefined, 2_400, 25)).toBeNull();
	});
});
