import { describe, expect, it } from 'vitest';
import {
	DEFAULT_QUERY,
	familyMembers,
	familyOf,
	groupByCategory,
	idList,
	parseViewerQuery,
	shownParts,
	viewerQueryString
} from './part-viewer';

describe('part viewer query (plan 301)', () => {
	it('reads the example link', () => {
		const q = parseViewerQuery('?part=stock.rcs-block&compare=stock.tank-small,stock.tank-medium');
		expect(q.part).toBe('stock.rcs-block');
		expect(q.compare).toEqual(['stock.tank-small', 'stock.tank-medium']);
		expect(q.detail).toBe('high');
		expect(shownParts(q)).toEqual(['stock.tank-small', 'stock.tank-medium']);
	});

	it('gives the defaults for an empty or broken address', () => {
		expect(parseViewerQuery('')).toEqual(DEFAULT_QUERY);
		const q = parseViewerQuery('detail=ultra&deploy=7&art=nope&bg=pink&nodes=0');
		expect(q.detail).toBe('high');
		expect(q.deploy).toBe(1);
		expect(q.art).toBe(0);
		expect(q.bg).toBe('dark');
		expect(q.nodes).toBe(false);
	});

	it('round-trips a view and keeps foreign keys', () => {
		const view = {
			...DEFAULT_QUERY,
			part: 'stock.chute',
			compare: ['a.x', 'a.y'],
			detail: 'low' as const,
			nodes: true,
			shape: true,
			wire: true,
			deploy: 0.5,
			art: -0.25,
			fire: true,
			bg: 'light' as const
		};
		const s = viewerQueryString(view, { renderer: 'webgl' });
		expect(s).toContain('compare=a.x,a.y');
		expect(s).toContain('renderer=webgl');
		expect(parseViewerQuery(s)).toEqual(view);
		expect(viewerQueryString(DEFAULT_QUERY)).toBe('');
	});

	it('drops empty and repeated ids', () => {
		expect(idList(' a , ,b,a ')).toEqual(['a', 'b']);
		expect(idList(null)).toEqual([]);
		expect(shownParts({ part: null, compare: [] })).toEqual([]);
	});
});

describe('part viewer grouping (plan 301)', () => {
	it('names families by the first word of the id', () => {
		expect(familyOf('stock.tank-small')).toBe('tank');
		expect(familyOf('stock.rcs-block-5')).toBe('rcs');
		expect(familyOf('plain')).toBe('plain');
		const ids = ['stock.tank-small', 'stock.rcs-pair', 'stock.tank-large', 'mod.tank-x'];
		expect(familyMembers('stock.tank-small', ids)).toEqual([
			'stock.tank-small',
			'stock.tank-large'
		]);
		expect(familyMembers('stock.solo', ids)).toEqual(['stock.solo']);
	});

	it('groups by category in rail order and leaves out empty categories', () => {
		const parts = [
			{ id: 'a', c: 'stock.tanks' },
			{ id: 'b', c: 'stock.command' },
			{ id: 'c', c: 'mod.weird' },
			{ id: 'd', c: 'stock.tanks' }
		];
		const groups = groupByCategory(parts, (p) => p.c, [
			{ id: 'stock.command', label: 'Command' },
			{ id: 'stock.aero', label: 'Aero' },
			{ id: 'stock.tanks', label: 'Tanks' }
		]);
		expect(groups.map((g) => [g.label, g.parts.map((p) => p.id)])).toEqual([
			['Command', ['b']],
			['Tanks', ['a', 'd']],
			['mod.weird', ['c']]
		]);
	});
});
