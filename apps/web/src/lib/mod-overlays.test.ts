/** Plan 347, ADR 0296: the page's overlay host merges published and page-side shapes. */
import { describe, expect, it } from 'vitest';
import {
	entityId,
	type OverlayDefinition,
	type OverlayShape,
	type PanelInput,
	type Snapshot
} from '@orbital/core';
import { createOverlayHost, overlayOn } from './mod-overlays';

const dot = (vessel?: number): OverlayShape => ({
	kind: 'marker',
	body: 'stock.home',
	frame: 'body-fixed',
	color: '#ff0000',
	position: { x: 1, y: 0, z: 0 },
	style: 'dot',
	...(vessel !== undefined ? { vessel: entityId(vessel) } : {})
});
const snapshot = {
	t: 0,
	vessels: [],
	bodies: [],
	overlays: { 'a.sim': { shapes: [dot(1), dot(2)] } }
} as unknown as Snapshot;
const input = { snapshot } as unknown as PanelInput;

describe('overlay host', () => {
	it('shows the toggled-on overlays, the flown vessel only, page draws at their rate', () => {
		let calls = 0;
		const defs: OverlayDefinition[] = [
			{ id: 'a.sim', title: 'Sim', defaultOn: true },
			{ id: 'a.page', title: 'Page', defaultOn: true, rate: 2, draw: () => (calls++, [dot()]) },
			{ id: 'a.off', title: 'Off', defaultOn: false, draw: () => [dot()] }
		];
		const host = createOverlayHost(defs);
		const at = (ms: number, toggles = {}) =>
			host.layers(ms, snapshot, () => input, entityId(1), toggles);
		expect(at(0).map((l) => [l.id, l.shapes.length])).toEqual([
			['a.sim', 1],
			['a.page', 1]
		]);
		at(100);
		expect(calls).toBe(1); // 2 Hz: the second call is too soon
		at(600);
		expect(calls).toBe(2);
		expect(at(700, { 'a.sim': false, 'a.off': true }).map((l) => l.id)).toEqual([
			'a.page',
			'a.off'
		]);
		expect(overlayOn(defs[2]!, { 'a.off': true })).toBe(true);
	});

	it('a throwing draw draws nothing and is reported once', () => {
		const told: string[] = [];
		const host = createOverlayHost(
			[
				{
					id: 'a.bad',
					title: 'Bad',
					defaultOn: true,
					rate: 30,
					draw: () => {
						throw new Error('boom');
					}
				}
			],
			(id, m) => told.push(`${id}: ${m}`)
		);
		expect(host.layers(0, snapshot, () => input, null, {})).toEqual([]);
		host.layers(1000, snapshot, () => input, null, {});
		expect(told).toEqual(['a.bad: boom']);
	});
});
