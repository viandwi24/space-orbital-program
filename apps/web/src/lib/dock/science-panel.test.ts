/** The stock science panel in the dock (plan 191, ADR 0194): states, stored results, Run and Transmit. */
import type { PanelInput, Snapshot, VesselSnapshot } from '@orbital/core';
import { PanelScience } from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { commandOf, evaluatePanel, type ShownNode } from './evaluate';

const vessel = {
	id: 7,
	science: {
		situation: 'landed',
		region: 'Highlands',
		experiments: [
			{ part: 3, experiment: 'stock.thermometer', state: 'RUNNING', progress: 0.5 },
			{
				part: 4,
				experiment: 'stock.goo',
				state: 'INVALID',
				reason: 'needs flying low or landed',
				progress: 0
			}
		],
		stored: [
			{ item: '3:1', subject: 'stock.thermometer@home.landed', value: 8, factor: 0.5 },
			{ item: '3:2', subject: 'stock.thermometer@home.flying', value: 10, factor: 0.6 }
		]
	}
} as unknown as VesselSnapshot;
const input: PanelInput = {
	snapshot: { t: 0, vessels: [vessel], bodies: [] } as unknown as Snapshot,
	vessel,
	altitude: 0,
	speed: 0,
	time: 0
};

const flat = (n: ShownNode): ShownNode[] =>
	n.kind === 'section' ? [n, ...n.children.flatMap(flat)] : [n];

describe('the science panel', () => {
	const shown = evaluatePanel(PanelScience, input, new Map());
	if (!shown.ok) throw new Error(shown.error);
	const nodes = flat(shown.nodes);
	const lists = nodes.filter((n) => n.kind === 'list');
	const buttons = nodes.filter((n) => n.kind === 'button');

	it('shows an INVALID experiment with its reason and a stored result with its transmit value', () => {
		expect(lists[0]!.items).toEqual([
			{ name: 'stock.thermometer', value: 'RUNNING 50 %' },
			{ name: 'stock.goo', value: 'INVALID: needs flying low or landed' }
		]);
		expect(lists[1]!.items[1]).toEqual({
			name: 'stock.thermometer@home.flying',
			value: '10 · transmit 60 % = 6'
		});
	});
	it('Run sends the run action and Transmit sends transmit-data for the best result', () => {
		const [run, transmit] = buttons as Array<Extract<ShownNode, { kind: 'button' }>>;
		expect(commandOf(PanelScience, run!.path, input)).toEqual({
			command: { type: 'action', vessel: 7, part: 4, module: 'stock.experiment', action: 'run' }
		});
		expect(commandOf(PanelScience, transmit!.path, input)).toEqual({
			command: { type: 'transmit-data', vessel: 7, item: '3:2' }
		});
	});
	it('without a vessel both buttons are disabled', () => {
		const empty = evaluatePanel(PanelScience, { ...input, vessel: null }, new Map());
		if (!empty.ok) throw new Error(empty.error);
		for (const b of flat(empty.nodes).filter((n) => n.kind === 'button'))
			expect(b.kind === 'button' && b.enabled).toBe(false);
	});
});
