/** Plan 330, ADR 0285: the select node and a mod panel's own UI frame. */
import { describe, expect, it } from 'vitest';
import type { PanelDefinition, PanelInput, VesselSnapshot } from '@orbital/core';
import { commandOf, evaluatePanel } from './evaluate';
import { frameInput, frameMessage, modFrameDocument, MOD_FRAME_BOOTSTRAP } from './mod-frame';

const vessel = { id: 7, name: 'Ferry' } as unknown as VesselSnapshot;
const input = {
	snapshot: { t: 5, vessels: [vessel], bodies: [] },
	vessel,
	altitude: 100,
	speed: 2,
	time: 5
} as unknown as PanelInput;

const panel: Pick<PanelDefinition, 'view'> = {
	view: {
		kind: 'section',
		children: [
			{
				kind: 'select',
				label: 'Speed',
				options: [
					{ value: 'careful', label: 'Careful' },
					{ value: 'normal', label: 'Normal' }
				],
				value: () => 'normal',
				command: (i, value) =>
					i.vessel
						? {
								type: 'autopilot-settings',
								vessel: i.vessel.id,
								autopilot: 'm.a',
								settings: { speed: value }
							}
						: null
			}
		]
	}
};

describe('mod panels (plan 330)', () => {
	it('a select shows its options and value and gives its command with the chosen value', () => {
		const r = evaluatePanel(panel, input, new Map());
		expect(r.ok && r.nodes.kind === 'section' && r.nodes.children[0]).toEqual({
			kind: 'select',
			label: 'Speed',
			options: [
				{ value: 'careful', label: 'Careful' },
				{ value: 'normal', label: 'Normal' }
			],
			value: 'normal',
			path: 'v.0'
		});
		expect(commandOf(panel, 'v.0', input, 'careful')).toEqual({
			command: {
				type: 'autopilot-settings',
				vessel: 7,
				autopilot: 'm.a',
				settings: { speed: 'careful' }
			}
		});
	});

	it('the frame document allows its one bootstrap by hash and nothing from the network', async () => {
		const doc = await modFrameDocument();
		expect(doc).toContain("script-src 'sha256-");
		expect(doc).toContain("connect-src 'none'");
		expect(doc).toContain(MOD_FRAME_BOOTSTRAP);
		expect(MOD_FRAME_BOOTSTRAP).not.toMatch(/<\/script/i);
	});

	it('only well-formed frame messages pass; the input is plain data', () => {
		expect(frameMessage({ kind: 'command', command: { type: 'stage', vessel: 7 } })).toEqual({
			kind: 'command',
			command: { type: 'stage', vessel: 7 }
		});
		expect(frameMessage({ kind: 'command', command: 'stage' })).toBeNull();
		expect(frameMessage({ kind: 'resize', height: 5000 })).toEqual({ kind: 'resize', height: 600 });
		expect(frameMessage({ kind: 'nope' })).toBeNull();
		expect(frameMessage(null)).toBeNull();
		expect(frameInput(input)).toEqual({
			time: 5,
			altitude: 100,
			speed: 2,
			vessel,
			targetVessel: null
		});
	});
});
