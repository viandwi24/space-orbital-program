/** Plan 315: shells and what they hold, and when a shell is drawn see-through or open. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import type { ContentLookups } from '../delta-v';
import { openModules, seeThroughOf, shellsOf } from './inside';
import { blueprintDesign } from '../blueprint-registry';

const { registries } = loadPlugins([Stock]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const build = (id: string) => blueprintDesign(id, registries.blueprints.list());
const indexOf = (d: ReturnType<typeof build>, part: string) =>
	d.parts.find((p) => p.part === part)!.index;

describe('seeing inside (plan 315)', () => {
	it('Kronos V: the petals hold the Selene lander', () => {
		const d = build('kronos-selene');
		const shells = shellsOf(d, content.parts, content);
		const inside = shells.get(indexOf(d, 'stock.payload-petals'))!;
		expect(inside).toContain(indexOf(d, 'stock.lander-descent'));
		expect(inside).toContain(indexOf(d, 'stock.lander-ascent'));
		// not the stages under it or the pod above
		expect(inside).not.toContain(indexOf(d, 'stock.pod-3'));
		expect(inside).not.toContain(indexOf(d, 'stock.tank-3750'));
	});

	it('Wayfarer Shuttle: the orbiter bay holds the docked module (plan 356)', () => {
		const d = build('wayfarer-shuttle');
		const shells = shellsOf(d, content.parts, content);
		const inside = shells.get(indexOf(d, 'stock.orbiter-bay'))!;
		for (const part of [
			'stock.docking-port-side',
			'stock.crew-cabin',
			'stock.probe-core',
			'stock.airlock'
		])
			expect(inside, part).toContain(indexOf(d, part));
	});

	it('a shell is see-through on hover, while a part inside is hovered, or with Show payload; not when open', () => {
		const shells = new Map([[5, [6, 7]]]);
		const none = new Set<number>();
		expect([...seeThroughOf(shells, { hover: 5, open: none, showPayload: false })]).toEqual([5]);
		expect([...seeThroughOf(shells, { hover: 7, open: none, showPayload: false })]).toEqual([5]);
		expect([...seeThroughOf(shells, { hover: 1, open: none, showPayload: false })]).toEqual([]);
		expect([...seeThroughOf(shells, { hover: null, open: none, showPayload: true })]).toEqual([5]);
		expect([...seeThroughOf(shells, { hover: 5, open: new Set([5]), showPayload: true })]).toEqual(
			[]
		);
	});

	it('parts that open: bays and petals by their doors, a fairing by hiding its shell, a telescope door', () => {
		expect(openModules(content.parts.get('stock.payload-petals'))).toEqual({
			'stock.bay': { open: true }
		});
		expect(openModules(content.parts.get('stock.fairing-base'))).toEqual({
			'stock.fairing': { shown: false }
		});
		expect(openModules(content.parts.get('stock.telescope'))).toEqual({
			'stock.animate': { open: true }
		});
		expect(openModules(content.parts.get('stock.tank-small'))).toBeNull();
	});
});
