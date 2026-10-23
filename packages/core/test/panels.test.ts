/** Dock panels as a registry (plan 112, ADR 0149). */
import { describe, expect, test } from 'bun:test';
import { loadPlugins, panelDefinitionSchema, sortPanels, type Plugin } from '../src/index.ts';

const panel = {
	id: 'mod.alt',
	title: 'Altitude',
	icon: 'orbit',
	order: 600,
	contexts: ['flight'],
	view: {
		kind: 'section',
		children: [
			{ kind: 'readout', label: 'Altitude', value: () => 1 },
			{ kind: 'sparkline', label: 'Speed', value: () => 2, samples: 30 },
			{ kind: 'switch', label: 'SAS', value: () => true, command: () => null }
		]
	}
};

describe('panel definitions', () => {
	test('a panel with nested nodes and a canvas parses', () => {
		expect(panelDefinitionSchema.safeParse(panel).success).toBe(true);
		expect(
			panelDefinitionSchema.safeParse({ ...panel, canvas: { height: 80, draw: () => {} } }).success
		).toBe(true);
	});

	test('a selector that is not a function, an unknown node, no context or a bad id are refused', () => {
		for (const bad of [
			{ ...panel, view: { kind: 'readout', label: 'A', value: 3 } },
			{ ...panel, view: { kind: 'html', html: '<b>' } },
			{ ...panel, view: { kind: 'section', children: [{ kind: 'button', label: 'B' }] } },
			{ ...panel, contexts: [] },
			{ ...panel, contexts: ['hangar'] },
			{ ...panel, id: 'alt' },
			{ ...panel, canvas: { height: 0, draw: () => {} } },
			{ ...panel, view: { kind: 'sparkline', label: 'S', value: () => 1, samples: 1 } }
		])
			expect(panelDefinitionSchema.safeParse(bad).success).toBe(false);
	});

	test('tabs, progress, number fields, notices, button tones and one-column sections parse (ADR 0287)', () => {
		const view = {
			kind: 'tabs',
			label: 'Programs',
			active: () => 'a',
			tabs: [
				{
					id: 'a',
					label: 'A',
					badge: () => 'ON',
					children: [
						{ kind: 'progress', label: 'Done', value: () => 0.5, text: () => 'half' },
						{
							kind: 'number',
							label: 'Alt',
							unit: 'km',
							min: 70,
							max: 500,
							step: 5,
							value: () => 80,
							command: () => null
						},
						{ kind: 'notice', text: () => 'why', tone: () => 'warn' },
						{ kind: 'button', label: 'Go', tone: 'primary', command: () => null }
					]
				},
				{ id: 'b', label: 'B', children: [{ kind: 'section', columns: 1, children: [] }] }
			]
		};
		expect(panelDefinitionSchema.safeParse({ ...panel, view }).success).toBe(true);
		for (const bad of [
			{ ...view, tabs: [] },
			{ ...view, tabs: [view.tabs[1], view.tabs[1]] },
			{ kind: 'number', label: 'N', min: 5, max: 1, value: () => 1, command: () => null },
			{ kind: 'button', label: 'B', tone: 'loud', command: () => null },
			{ kind: 'section', columns: 3, children: [] },
			{ kind: 'notice', text: 'static' }
		])
			expect(panelDefinitionSchema.safeParse({ ...panel, view: bad }).success).toBe(false);
	});

	test('rail order: ascending, ties in registration order', () => {
		expect(
			sortPanels([
				{ id: 'a', order: 2 },
				{ id: 'b', order: 1 },
				{ id: 'c', order: 2 }
			]).map((p) => p.id)
		).toEqual(['b', 'a', 'c']);
	});

	test('a plugin registers a panel and the report lists it', () => {
		const plugin: Plugin = {
			meta: { id: 'mod', version: '1.0.0', api: '^0.1' },
			depends: [],
			optional: [],
			setup(ctx) {
				ctx.panels.register(panel as never);
			}
		};
		const { registries, report } = loadPlugins([plugin]);
		expect(registries.panels.get('mod.alt')?.title).toBe('Altitude');
		expect(report.registered.panel).toEqual([{ id: 'mod.alt', by: 'mod' }]);
	});
});
