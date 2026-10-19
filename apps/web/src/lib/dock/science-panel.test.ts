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
		expect(lists[0]!.items.map(({ name, value }) => ({ name, value }))).toEqual([
			{ name: 'stock.thermometer', value: 'RUNNING 50 %' },
			{ name: 'stock.goo', value: 'INVALID: needs flying low or landed' }
		]);
		expect(lists[1]!.items[1]).toMatchObject({
			name: 'stock.thermometer@home.flying',
			value: '10 · transmit 60 % = 6'
		});
	});
	it('plan 231: Run on a chosen experiment, Transmit and Discard on a chosen result', () => {
		const list = (k: number) => lists[k] as Extract<ShownNode, { kind: 'list' }>;
		// a running experiment cannot be started again; the other one runs on its own button
		const [running, goo] = list(0).items;
		expect(running!.actions).toEqual([expect.objectContaining({ label: 'Run', enabled: false })]);
		expect(goo!.actions![0]).toMatchObject({ label: 'Run', enabled: true });
		expect(commandOf(PanelScience, goo!.actions![0]!.path, input)).toEqual({
			command: { type: 'action', vessel: 7, part: 4, module: 'stock.experiment', action: 'run' }
		});
		// the first stored result, not the best: its own Transmit and Discard
		const first = list(1).items[0]!;
		expect(first.actions!.map((a) => a.label)).toEqual(['Transmit', 'Discard']);
		expect(commandOf(PanelScience, first.actions![0]!.path, input)).toEqual({
			command: { type: 'transmit-data', vessel: 7, item: '3:1' }
		});
		expect(commandOf(PanelScience, first.actions![1]!.path, input)).toEqual({
			command: { type: 'delete-data', vessel: 7, item: '3:1' }
		});
		// a row that is gone gives no command
		expect(commandOf(PanelScience, `${first.actions![0]!.path.split(':')[0]}:9:0`, input)).toEqual({
			command: null
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
