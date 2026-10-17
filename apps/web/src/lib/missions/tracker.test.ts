/** The mission tracker (plan 100, ADR 0151 point 3). */
import { loadPlugins, type Snapshot } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MissionsPanel from './MissionsPanel.svelte';
import { trackerView } from './tracker';

const { registries } = loadPlugins([Stock]);
const missions = registries.missions.list();
const label = (id: string) => registries.objectives.get(id)?.label ?? id;
type Objectives = NonNullable<Snapshot['objectives']>;

describe('mission tracker', () => {
	it('a new world offers the first mission of the main line only', () => {
		const v = trackerView(missions, undefined, label);
		expect(v.active).toEqual([]);
		expect(v.offered.map((m) => m.id)).toEqual(['stock.first-launch']);
		expect(v.offered[0]!.briefing).toContain('one kilometre');
	});

	it("shows each objective's progress from the snapshot, and the debriefing of the last done", () => {
		const objectives: Objectives = [
			{
				id: 'o1',
				source: { kind: 'mission', id: 'stock.first-launch' },
				status: 'done',
				progress: 1,
				leaves: [{ path: '0', objective: 'stock.reach-altitude', status: 'done', progress: 1 }]
			},
			{
				id: 'o2',
				source: { kind: 'mission', id: 'stock.moon-return' },
				status: 'active',
				progress: 0.5,
				leaves: [
					{ path: '0', objective: 'stock.land', status: 'done', progress: 1 },
					{ path: '1', objective: 'stock.return-home', status: 'active', progress: 0.25 }
				]
			}
		] as Objectives;
		const v = trackerView(missions, objectives, label);
		expect(v.active[0]).toEqual({
			id: 'stock.moon-return',
			title: 'Home from the Moon',
			progress: 0.5,
			steps: [
				{ label: label('stock.land'), status: 'done', progress: 1 },
				{ label: label('stock.return-home'), status: 'active', progress: 0.25 }
			]
		});
		expect(v.offered.map((m) => m.id)).toEqual(['stock.space']);
		expect(v.lastDone?.title).toBe('First launch');
		const html = render(MissionsPanel, { props: { view: v, onstart: () => {} } }).body;
		expect(html).toContain('Home from the Moon');
		expect(html).toContain('50%');
		expect(html).toContain('25%');
		expect(html).toContain('mission-start-stock.space');
	});
});
