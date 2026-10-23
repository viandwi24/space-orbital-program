import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@orbital/core';
import {
	flightHref,
	manualText,
	panelOf,
	programGroups,
	programRows,
	programsLabel,
	stopCommand
} from './programs-model';

const snap = (vessels: unknown[]): Snapshot =>
	({ t: 0, vessels, bodies: [] }) as unknown as Snapshot;

describe('programRows', () => {
	it('lists autopilots and scripts with the channels the player holds', () => {
		const rows = programRows(
			snap([
				{ id: 2, name: 'Tug', script: { name: 'Tug script', resumed: true, startedAt: 5 } },
				{
					id: 1,
					name: 'Station',
					override: ['pitch', 'throttle'],
					autopilot: { id: 'autodock.dock', title: 'Auto Dock', phase: 'approach', status: '40 m' }
				},
				{ id: 3, name: 'Debris' }
			])
		);
		expect(rows).toEqual([
			{
				vessel: 1,
				vesselName: 'Station',
				kind: 'autopilot',
				autopilot: 'autodock.dock',
				title: 'Auto Dock',
				detail: 'approach · 40 m',
				manual: ['pitch', 'throttle']
			},
			{
				vessel: 2,
				vesselName: 'Tug',
				kind: 'script',
				autopilot: null,
				title: 'Tug script',
				detail: 'resumed from a save',
				manual: []
			}
		]);
	});

	it('is empty without a snapshot or programs', () => {
		expect(programRows(null)).toEqual([]);
		expect(programRows(snap([{ id: 1, name: 'A' }]))).toEqual([]);
	});

	it('words the channels and the count', () => {
		expect(manualText(['pitch', 'translateZ'])).toBe('pitch, RCS forward');
		expect(programsLabel(1)).toBe('1 program');
		expect(programsLabel(2)).toBe('2 programs');
	});
});

describe('the programs popover (plan 359)', () => {
	const rows = programRows(
		snap([
			{ id: 4, name: 'Zeta', script: { name: 'hop', resumed: false, startedAt: 0 } },
			{
				id: 1,
				name: 'Aurora',
				autopilot: { id: 'guidance.rendezvous', title: 'Rendezvous', phase: 'correct', status: '' }
			},
			{
				id: 2,
				name: 'Beta',
				script: { name: 'keep', resumed: false, startedAt: 0 },
				autopilot: { id: 'quiet.drift', title: 'Drift', phase: '', status: '' }
			}
		])
	);
	const panels = [
		{ id: 'stock.something', title: 'Other', contexts: ['flight'] },
		{ id: 'guidance.panel', title: 'Guidance Computer', contexts: ['flight'] },
		{ id: 'quiet.map', title: 'Map only', contexts: ['map'] }
	];

	it('Open panel: the mod Flight panel for an autopilot, Script for a script, none without one', () => {
		const byTitle = Object.fromEntries(rows.map((r) => [r.title, panelOf(r, panels)?.id ?? null]));
		expect(byTitle).toEqual({
			Rendezvous: 'guidance.panel',
			Drift: null,
			hop: 'host.script',
			keep: 'host.script'
		});
	});

	it('groups by vessel, the active vessel first with no Vessel button', () => {
		const groups = programGroups(rows, 2, panels);
		expect(groups.map((g) => [g.vesselName, g.active, g.rows.map((r) => r.title)])).toEqual([
			['Beta', true, ['Drift', 'keep']],
			['Aurora', false, ['Rendezvous']],
			['Zeta', false, ['hop']]
		]);
	});

	it('Stop disengages an autopilot alone and detaches a script alone (plan 322)', () => {
		const rendezvous = rows.find((r) => r.title === 'Rendezvous')!;
		const hop = rows.find((r) => r.title === 'hop')!;
		expect(stopCommand(rendezvous)).toEqual({ type: 'autopilot-disengage', vessel: 1 });
		expect(stopCommand(hop)).toEqual({
			type: 'script-detach',
			vessel: 4,
			reason: 'stopped from the programs list'
		});
	});

	it('outside Flight, the actions go to Flight with the panel to open', () => {
		expect(flightHref('guidance.panel')).toBe('/flight?panel=guidance.panel');
		expect(flightHref(null)).toBe('/flight');
	});
});
