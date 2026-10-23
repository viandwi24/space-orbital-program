import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { allBlueprints } from './blueprints';
import { checklistOf, expectedItems, gapsOf } from './blueprint-checklist';
import { createEditor } from './state';
import { emptyDesign } from '../design';

const { registries } = loadPlugins([Stock]);
const cards = allBlueprints(registries.blueprints.list());
const content = { parts: registries.parts, modules: registries.modules };

describe('the blueprint checklist (plan 312)', () => {
	it('reads the capabilities from the modules of the parts', () => {
		const moon = cards.find((c) => c.goal === 'moon')!;
		const design = moon.build(content);
		const items = checklistOf(design, registries.parts, moon);
		expect(items.map((i) => i.id)).toEqual([
			'rcs',
			'antenna',
			'power',
			'parachute',
			'life-support',
			'heat-shield'
		]);
		// an empty design has none of them
		const none = checklistOf(createEditor(emptyDesign(), content).design, registries.parts, moon);
		expect(none.every((i) => !i.present)).toBe(true);
	});

	it('expects what the trip calls for', () => {
		expect(expectedItems({ goal: 'moon', crew: 2 })).toEqual(
			expect.arrayContaining([
				'rcs',
				'antenna',
				'power',
				'parachute',
				'life-support',
				'heat-shield'
			])
		);
		expect(expectedItems({ goal: 'orbit', crew: 0 })).toEqual(['antenna', 'power']);
		expect(expectedItems({ goal: 'orbit', crew: 1 })).toEqual(['parachute', 'heat-shield']);
		expect(expectedItems({ goal: 'station', crew: 0 })).not.toContain('parachute');
	});

	it('names the gaps: expected and missing', () => {
		const items = checklistOf(emptyDesign(), registries.parts, { goal: 'orbit', crew: 1 });
		expect(gapsOf(items).map((i) => i.id)).toEqual(['parachute', 'heat-shield']);
		const full = items.map((i) => ({ ...i, present: true }));
		expect(gapsOf(full)).toEqual([]);
	});
});
