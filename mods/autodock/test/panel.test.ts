/** Plan 330: Auto Dock's panel options and its alignment display. */
import { describe, expect, test } from 'bun:test';
import {
	createVesselPilot,
	entityId,
	partId,
	type PanelCanvas,
	type PanelInput,
	type PanelNode,
	type VesselSnapshot
} from '@orbital/sdk';
import { AutoDockPanel } from '../src/index.ts';
import { drawAlignment } from '../src/display.ts';

const q0 = { x: 0, y: 0, z: 0, w: 1 };
const port = (part: number, dir: number) => ({
	part: entityId(part),
	size: 1.25,
	free: true,
	position: { x: 0, y: 0, z: 0 },
	direction: { x: 0, y: dir, z: 0 },
	orientation: q0
});
const chaser = {
	id: entityId(1),
	name: 'Chaser',
	mode: 'flight',
	soi: 'home',
	position: { x: 0, y: 0, z: 0 },
	velocity: { x: 0, y: 0, z: 0 },
	orientation: q0,
	parts: [
		{
			id: entityId(11),
			definition: partId('test.port'),
			position: { x: 0, y: 0, z: 0 },
			orientation: q0,
			modules: {}
		}
	],
	nextStage: 0,
	controlPart: entityId(11),
	ports: [port(11, 1)],
	autopilotSettings: { 'autodock.dock': { speed: 'careful' } },
	target: {
		kind: 'vessel',
		id: entityId(2),
		part: entityId(21),
		name: 'Station',
		position: { x: 2, y: 30, z: 1 },
		velocity: { x: 0, y: -0.3, z: 0 },
		distance: 30.1,
		relativeSpeed: 0.3,
		approach: null
	}
} as unknown as VesselSnapshot;
const station = {
	...chaser,
	id: entityId(2),
	name: 'Station',
	target: undefined,
	controlPart: undefined,
	ports: [port(21, -1)]
} as unknown as VesselSnapshot;
const input = {
	snapshot: { t: 1, vessels: [chaser, station], bodies: [] },
	vessel: chaser,
	altitude: 1,
	speed: 1,
	time: 1
} as unknown as PanelInput;

const nodes = (n: PanelNode): PanelNode[] =>
	n.kind === 'section' ? n.children.flatMap(nodes) : [n];

describe('Auto Dock panel (plan 330)', () => {
	test('the options read the stored settings and set them with autopilot-settings', () => {
		const selects = nodes(AutoDockPanel.view).filter((n) => n.kind === 'select');
		expect(selects.map((s) => s.label)).toEqual(['Speed', 'Start the approach at']);
		const speed = selects[0]!;
		if (speed.kind !== 'select') throw new Error('not a select');
		expect(speed.value(input)).toBe('careful');
		expect(speed.command(input, 'fast')).toEqual({
			type: 'autopilot-settings',
			vessel: entityId(1),
			autopilot: 'autodock.dock',
			settings: { speed: 'fast' }
		});
	});

	test('the alignment display draws with and without a docking geometry', () => {
		const calls: string[] = [];
		const canvas = new Proxy({ width: 260, height: 220 } as PanelCanvas, {
			get: (t, k) =>
				k in t
					? t[k as keyof PanelCanvas]
					: (...args: unknown[]) => calls.push(`${String(k)} ${args.join(',')}`)
		});
		drawAlignment(canvas, null, 'off');
		expect(calls.some((c) => c.includes('Control from a port'))).toBe(true);
		calls.length = 0;
		drawAlignment(
			canvas,
			createVesselPilot(input.snapshot, entityId(1), () => undefined),
			'approach'
		);
		expect(calls.some((c) => c.startsWith('fillText DST 30'))).toBe(true);
		expect(calls.some((c) => c.startsWith('fillText APPROACH'))).toBe(true);
	});
});
