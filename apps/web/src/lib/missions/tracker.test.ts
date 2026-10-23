/** The mission tracker (plan 100, ADR 0151 point 3). */
import { loadPlugins, type Snapshot } from '@orbital/core';
import Sol from '@orbital/mod-sol';
import Stock from '@orbital/mod-stock';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import MissionsPanel from './MissionsPanel.svelte';
import { firstMission, missionWorldOf, trackerView } from './tracker';

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

	it('the onboarding hand-off starts the first mission once, in a world that never started one (ADR 0328)', () => {
		expect(firstMission(missions, undefined)).toBe('stock.first-launch');
		expect(firstMission(missions, [])).toBe('stock.first-launch');
		const started: Objectives = [
			{
				id: 'o1',
				source: { kind: 'mission', id: 'stock.first-launch' },
				status: 'active',
				progress: 0,
				leaves: []
			}
		];
		expect(firstMission(missions, started)).toBeNull();
		// a contract does not count as the mission line
		expect(
			firstMission(missions, [
				{ ...started[0]!, source: { kind: 'contract', id: 'x' }, status: 'done', progress: 1 }
			])
		).toBe('stock.first-launch');
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

describe('the main line in the world it is read in (system audit D3)', () => {
	const done = (ids: string[]): Objectives =>
		ids.map((id, i) => ({
			id: `o${i}`,
			source: { kind: 'mission', id },
			status: 'done',
			progress: 1,
			leaves: []
		})) as unknown as Objectives;

	it('a Sol world names the Earth, the Moon and its air; the line ends after the Moon', () => {
		const sol = loadPlugins([Stock, Sol], {
			system: { id: 'sol', variant: 'rescaled' }
		}).registries;
		const world = missionWorldOf(sol.bodies.list(), 'sol.earth')!;
		expect(world.moon).toBe('sol.moon');
		const space = trackerView(missions, done(['stock.first-launch']), label, world);
		expect(space.offered[0]!.briefing).toBe(
			`Climb above the atmosphere: ${Math.round(world.air / 1000)} km over Earth.`
		);
		const flyby = trackerView(
			missions,
			done(['stock.first-launch', 'stock.space', 'stock.orbit']),
			label,
			world
		);
		expect(flyby.offered[0]!.briefing).toContain("Moon's sphere of influence");
		const after = trackerView(
			missions,
			done([
				'stock.first-launch',
				'stock.space',
				'stock.orbit',
				'stock.moon-flyby',
				'stock.moon-landing',
				'stock.moon-return'
			]),
			label,
			world
		);
		expect(after.offered).toEqual([]);
	});

	it('a stock world reads as before: 70 km over Home, then Cinder', () => {
		const world = missionWorldOf(registries.bodies.list(), 'stock.home')!;
		const space = trackerView(missions, done(['stock.first-launch']), label, world);
		expect(space.offered[0]!.briefing).toBe('Climb above the atmosphere: 70 km over Home.');
		const after = trackerView(
			missions,
			done([
				'stock.first-launch',
				'stock.space',
				'stock.orbit',
				'stock.moon-flyby',
				'stock.moon-landing',
				'stock.moon-return'
			]),
			label,
			world
		);
		expect(after.offered.map((m) => m.id)).toEqual(['stock.ochre-flyby']);
	});
});
