/** The catalogue size filter (plan 275, ADR 0256): only the parts with a joint of the chosen class. */
import { loadPlugins, nodeSize } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import Catalogue from '../vab/Catalogue.svelte';
import { categoriesOf } from './categories';
import { SIZE_CLASS_LABELS, matchesSize, offeredSizes, partSizeClasses } from './size-class';

const { registries } = loadPlugins([Stock]);
const parts = registries.parts.list();
const ids = (size: number | null) => parts.filter((p) => matchesSize(p, size)).map((p) => p.id);

describe('the size filter', () => {
	it('names the seven classes from XS to XXL', () => {
		expect(SIZE_CLASS_LABELS.map(([l]) => l)).toEqual(['XS', 'S', 'SM', 'M', 'L', 'XL', 'XXL']);
		expect(SIZE_CLASS_LABELS.map(([, s]) => s)).toEqual([0.625, 1.25, 1.875, 2.5, 3.75, 5, 7.5]);
	});

	it('keeps every part with no filter', () => {
		expect(ids(null)).toHaveLength(parts.length);
	});

	it('keeps only parts with a joint of the chosen class, for every class', () => {
		for (const [, size] of SIZE_CLASS_LABELS) {
			const kept = parts.filter((p) => matchesSize(p, size));
			expect(kept.length, `${size} m`).toBeGreaterThan(0);
			for (const p of kept) {
				const joints = Object.keys(p.attach ?? {}).map((n) => nodeSize(p, n));
				expect(
					joints.some((s) => s !== undefined && Math.abs(s - size) < 1e-3),
					p.id
				).toBe(true);
			}
			for (const p of parts.filter((q) => !matchesSize(q, size))) {
				const joints = Object.keys(p.attach ?? {}).map((n) => nodeSize(p, n));
				expect(
					joints.some((s) => s !== undefined && Math.abs(s - size) < 1e-3),
					p.id
				).toBe(false);
			}
		}
	});

	it('puts the round 0.625 m tank in XS, the 7.5 m tanks in XXL and an adapter in both its classes', () => {
		expect(ids(0.625)).toContain('stock.tank-0625');
		expect(ids(0.625)).not.toContain('stock.tank-7500');
		expect(ids(7.5)).toContain('stock.tank-7500');
		expect(ids(7.5)).not.toContain('stock.tank-0625');
		expect(partSizeClasses(registries.parts.get('stock.adapter-5000-7500')!)).toEqual([5, 7.5]);
		expect(ids(5)).toContain('stock.adapter-5000-7500');
		expect(ids(7.5)).toContain('stock.adapter-5000-7500');
	});

	it('the new tank shapes and separators are in their classes', () => {
		expect(ids(1.25)).toEqual(
			expect.arrayContaining(['stock.tank-toroid', 'stock.tank-sphere', 'stock.separator-1250'])
		);
		expect(ids(3.75)).toContain('stock.tank-adapter-3750-1875');
		expect(ids(1.875)).toContain('stock.tank-adapter-3750-1875');
	});

	it('a part without a sized joint (a radial panel) shows under no class', () => {
		expect(
			SIZE_CLASS_LABELS.some(([, s]) => matchesSize(registries.parts.get('stock.strut')!, s))
		).toBe(false);
	});

	it('offers only the classes the parts have, with counts', () => {
		const offered = offeredSizes(parts);
		expect(offered.map((s) => s.label)).toEqual(['XS', 'S', 'SM', 'M', 'L', 'XL', 'XXL']);
		expect(offered.every((s) => s.count > 0)).toBe(true);
		expect(offeredSizes([registries.parts.get('stock.tank-7500')!]).map((s) => s.label)).toEqual([
			'XXL'
		]);
	});

	it('the Hangar catalogue shows the size chips', () => {
		const html = render(Catalogue, {
			props: {
				parts,
				icons: {},
				armed: null,
				facts: () => [],
				modules: registries.modules,
				categories: categoriesOf(registries.categories.list()),
				onarm: () => {}
			}
		}).body;
		expect(html).toContain('aria-label="Size class"');
		for (const [label] of SIZE_CLASS_LABELS) expect(html).toContain(`>${label}</button>`);
	});
});
