/** Plan 359 (ADR 0302): which buttons the programs popover shows. */
import type { Snapshot } from '@orbital/core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { programGroups, programRows } from '../programs-model';
import ProgramsPopover from './ProgramsPopover.svelte';

const snap = (vessels: unknown[]): Snapshot =>
	({ t: 0, vessels, bodies: [] }) as unknown as Snapshot;
const rows = programRows(
	snap([
		{
			id: 1,
			name: 'Aurora Research Satellite',
			autopilot: { id: 'guidance.rendezvous', title: 'Rendezvous', phase: 'correct', status: '' }
		},
		{ id: 2, name: 'Tug', autopilot: { id: 'quiet.drift', title: 'Drift', phase: '', status: '' } }
	])
);
const panels = [{ id: 'guidance.panel', title: 'Guidance Computer', contexts: ['flight'] }];
const html = (active: number | null) =>
	render(ProgramsPopover, {
		props: {
			open: false,
			anchor: undefined,
			groups: programGroups(rows, active, panels),
			onclose: () => {},
			onpanel: () => {},
			onvessel: () => {},
			onstop: () => {}
		}
	}).body;

describe('the programs popover', () => {
	it('Open panel only where the program has one; Stop on every row', () => {
		const body = html(null);
		expect(body).toContain('data-testid="program-panel-1-autopilot"');
		expect(body).not.toContain('data-testid="program-panel-2-autopilot"');
		expect(body).toContain('data-testid="program-stop-1-autopilot"');
		expect(body).toContain('data-testid="program-stop-2-autopilot"');
	});

	it('Vessel on the other vessels, "Active vessel" on the one flown', () => {
		const body = html(1);
		expect(body).not.toContain('data-testid="program-vessel-1"');
		expect(body).toContain('Active vessel');
		expect(body).toContain('data-testid="program-vessel-2"');
		expect(body.indexOf('Aurora Research Satellite')).toBeLessThan(body.indexOf('Tug'));
	});
});
