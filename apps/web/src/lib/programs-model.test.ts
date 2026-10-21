import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@orbital/core';
import { manualText, programRows, programsLabel } from './programs-model';

const snap = (vessels: unknown[]): Snapshot => ({ t: 0, vessels, bodies: [] }) as unknown as Snapshot;

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
				title: 'Auto Dock',
				detail: 'approach · 40 m',
				manual: ['pitch', 'throttle']
			},
			{
				vessel: 2,
				vesselName: 'Tug',
				kind: 'script',
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
