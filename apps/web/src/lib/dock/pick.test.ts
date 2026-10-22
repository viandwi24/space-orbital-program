/** Plan 366, ADR 0307: a panel's `pick` node arms a map pick; the next map click runs its command. */
import { describe, expect, it } from 'vitest';
import type { PanelDefinition, PanelInput } from '@orbital/core';
import { evaluatePanel, isPick, pickCommand } from './evaluate';
import { pickTool } from './pick-tool.svelte';

const panel: Pick<PanelDefinition, 'view'> = {
	view: {
		kind: 'section',
		children: [
			{
				kind: 'pick',
				label: 'Pick target',
				hint: 'Click the ground',
				command: (_i, p) => ({ type: 'mod-key', key: 'm.pick', data: { body: p.body, y: p.direction.y } })
			}
		]
	}
};
const input = { snapshot: { t: 0, vessels: [], bodies: [] }, vessel: null, altitude: null, speed: null, time: 0 } as unknown as PanelInput;

describe('pick node', () => {
	it('shows as a button with its hint; its command gets the pick', () => {
		const r = evaluatePanel(panel, input, new Map());
		if (!r.ok || r.nodes.kind !== 'section') throw new Error('not shown');
		expect(r.nodes.children[0]).toMatchObject({ kind: 'button', label: 'Pick target', enabled: true, pick: 'Click the ground', path: 'v.0' });
		expect(isPick(panel, 'v.0')).toBe(true);
		expect(pickCommand(panel, 'v.0', input, { body: 'stock.home', direction: { x: 0, y: 1, z: 0 } })).toEqual({
			command: { type: 'mod-key', key: 'm.pick', data: { body: 'stock.home', y: 1 } }
		});
	});

	it('the tool: armed once, a click takes it, a second press or a miss cancels', () => {
		const got: unknown[] = [];
		let opened = 0;
		const off = pickTool.onArm(() => opened++);
		const arm = () => pickTool.toggle({ key: 'p/v.0', hint: 'h', run: (p) => got.push(p) });
		arm();
		expect(opened).toBe(1);
		expect(pickTool.take({ body: 'b', direction: { x: 1, y: 0, z: 0 } })).toBe(true);
		expect(got).toHaveLength(1);
		expect(pickTool.take({ body: 'b', direction: { x: 1, y: 0, z: 0 } })).toBe(false); // not armed
		arm();
		arm(); // the same button again: cancelled
		expect(pickTool.armed).toBeNull();
		arm();
		expect(pickTool.take(null)).toBe(true); // a click off every body cancels
		expect(got).toHaveLength(1);
		off();
	});
});
