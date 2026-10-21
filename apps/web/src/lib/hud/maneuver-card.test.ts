/** The maneuver card (plan 292, ADR 0267): a summary with icon actions, the editor folded. */
import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { ManeuverHud, NodeHud } from '../hud-controller';
import ManeuverPanel, { maneuverCard } from './ManeuverPanel.svelte';

const node = (id: number, over: Partial<NodeHud> = {}): NodeHud => ({
	id,
	time: 1000,
	prograde: 24.7,
	normal: 0,
	radial: 12.3,
	dv: 27.6,
	burnTime: 1.2,
	short: false,
	toNode: 122,
	toBurn: 121,
	state: 'ahead',
	...over
});
const hud = (nodes: NodeHud[]): ManeuverHud => ({
	...nodes[0]!,
	count: nodes.length,
	pointing: false,
	nodes
});
const noop = () => {};
const html = (maneuver: ManeuverHud | null, map = true) =>
	render(ManeuverPanel, {
		props: {
			maneuver,
			map,
			warpUsable: true,
			planned: { body: 'stock.home', apoapsis: 106_700, periapsis: 71_000, period: 5000 },
			onwarp: noop,
			onpoint: noop,
			onremove: noop,
			onedit: noop,
			onshift: noop,
			onalarm: noop
		}
	}).body;

afterEach(() => {
	maneuverCard.open = false;
});

describe('the maneuver card', () => {
	it('folded: the status, the five read-outs and five icon actions, no editor', () => {
		const card = html(hud([node(1)]));
		expect(card).toContain('Burn in 02:01');
		for (const id of ['dv', 'burn', 'planned-ap', 'planned-pe'])
			expect(card).toContain(`data-testid="maneuver-${id}"`);
		expect(card).toContain('Time to the node');
		for (const id of ['warp', 'point', 'alarm', 'remove', 'expand'])
			expect(card).toContain(`data-testid="maneuver-${id}"`);
		expect(card).toContain('aria-expanded="false"');
		expect(card).not.toContain('data-testid="node-prograde"');
		expect(card).not.toContain('Impulsive plan');
	});
	it('open: three axis fields with steppers, the time stepper and the note', () => {
		maneuverCard.open = true;
		const card = html(hud([node(1)]));
		expect(card).toContain('aria-expanded="true"');
		for (const axis of ['prograde', 'normal', 'radial']) {
			expect(card).toContain(`data-testid="node-${axis}"`);
			expect(card).toContain(`data-testid="node-${axis}-minus"`);
			expect(card).toContain(`data-testid="node-${axis}-plus"`);
		}
		expect(card).toContain('value="24.7"');
		expect(card).toContain('data-testid="node-time-step"');
		for (const step of ['1 s', '10 s', '1 min', '10 min', '1 orbit']) expect(card).toContain(step);
		expect(card).toContain('Impulsive plan');
	});
	it('several nodes: an index with previous and next', () => {
		const card = html(hud([node(1), node(2, { toNode: 900, toBurn: 899 })]));
		expect(card).toContain('Node 1/2');
		expect(card).toContain('data-testid="maneuver-next"');
		expect(card).toContain('aria-label="Maneuver node 1 of 2"');
	});
	it('says when no engine is lit or the fuel is short, and when the window passed', () => {
		expect(html(hud([node(1, { burnTime: null, toBurn: null })]))).toContain('No engine lit');
		expect(html(hud([node(1, { short: true })]))).toContain('Not enough fuel');
		expect(html(hud([node(1, { state: 'overdue' })]))).toContain('Overdue');
	});
	it('map view without a node: the hint; flight view without one: nothing', () => {
		expect(html(null, true)).toContain('Click the orbit to plan a burn');
		expect(html(null, false)).not.toContain('panel');
	});
});
