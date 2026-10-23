/** The Space Center tour (plan 377, ADR 0314): the step machine, each step's condition, its targets. */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlugins } from '@orbital/core';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../builtins';
import {
	QUIET_TOUR,
	SC_TOUR_STEPS,
	START_TOUR,
	TOUR_BUILDING,
	advanceTour,
	backTour,
	nextTour,
	placesTourBuilding,
	skipTour,
	tourBuildingOf,
	tourStep,
	type ScTourObservation,
	type TourProgress
} from './sc-tour';

const at = (o: Partial<ScTourObservation>): ScTourObservation => ({ ...QUIET_TOUR, ...o });
const dish = (state: 'building' | 'active' | 'upgrading' = 'active', level = 0) => ({
	id: 'd1',
	state,
	level
});

/** Observations in order, each the state the player has reached: each completes its own step. */
const RUN: Partial<ScTourObservation>[] = [
	{ orbited: true, zoomed: true },
	{ orbited: true, zoomed: true, buildOpen: true },
	{ buildOpen: true, placing: TOUR_BUILDING },
	{ buildOpen: true, placing: TOUR_BUILDING, building: dish('building') },
	{ buildOpen: true, building: dish('active') },
	{ listOpen: true, building: dish() },
	{ listOpen: true, selected: 'hangar', building: dish() },
	{ place: 'vab', building: dish() },
	{ place: 'space-center', building: dish() },
	{ selected: 'd1', building: dish('upgrading') },
	{ selected: 'd1', removed: true },
	{},
	{}
];

describe('the Space Center tour (plan 377)', () => {
	it('walks every step on its own action, information steps on Next, then is done', () => {
		expect(RUN).toHaveLength(SC_TOUR_STEPS.length);
		let p: TourProgress = START_TOUR;
		expect(advanceTour(p, at({}))).toBe(p);
		RUN.forEach((o, i) => {
			const step = SC_TOUR_STEPS[i]!;
			expect(tourStep(p)?.id).toBe(step.id);
			// the state before this step's action changes nothing
			if (i > 0) expect(advanceTour(p, at(RUN[i - 1]!)), step.id).toBe(p);
			const after = advanceTour(p, at(o));
			if (step.done) {
				expect(after, step.id).toEqual({
					...p,
					step: i + 1,
					...(i + 1 === RUN.length ? { status: 'done' } : {})
				});
				p = after;
			} else {
				// an information step waits for Next
				expect(after).toBe(p);
				p = nextTour(p);
			}
		});
		expect(p.status).toBe('done');
		expect(tourStep(p)).toBeNull();
	});

	it('moves one step per observation, never skipping', () => {
		const all = at({
			orbited: true,
			zoomed: true,
			buildOpen: true,
			placing: TOUR_BUILDING,
			building: dish('active', 1),
			listOpen: true,
			selected: 'd1',
			place: 'vab'
		});
		let p: TourProgress = START_TOUR;
		for (let i = 1; i <= 5; i++) {
			p = advanceTour(p, all);
			expect(p.step).toBe(i);
		}
	});

	it('Back shows the step before for review: it waits for Next, then the tour goes on', () => {
		const p: TourProgress = { ...START_TOUR, step: 3 };
		const back = backTour(p);
		expect(back).toEqual({ ...p, step: 2, review: true });
		// its action is long done, but it does not skip ahead on its own
		expect(advanceTour(back, at({ placing: TOUR_BUILDING }))).toBe(back);
		expect(nextTour(back)).toEqual({ ...p, step: 3, review: false });
		expect(backTour(START_TOUR)).toBe(START_TOUR);
		expect(skipTour(p).status).toBe('skipped');
		expect(advanceTour(skipTour(p), at({ orbited: true, zoomed: true }))).toEqual(skipTour(p));
	});

	it('the Sandbox and Career words differ where money and time do', () => {
		const ready = SC_TOUR_STEPS.find((s) => s.id === 'ready')!;
		expect(ready.text(at({ economy: true }))).toMatch(/warp/);
		expect(ready.text(at({ economy: true }))).toMatch(/gives this building’s cost back/);
		expect(ready.text(at({ economy: false }))).toMatch(/ready at once/);
		expect(ready.point(at({ economy: false }))).toBeNull();
		const demolish = SC_TOUR_STEPS.find((s) => s.id === 'demolish')!;
		expect(demolish.point(at({}))).toBe('sc-demolish');
		expect(demolish.point(at({ confirm: true }))).toBe('sc-remove');
	});

	it('finds the tour building by its id, or by its refund, and sees it go', () => {
		const buildings = [
			{ id: 'h', state: 'active' as const, level: 0 },
			{ id: 't', state: 'building' as const, level: 0, refund: 20_000 }
		];
		expect(tourBuildingOf(START_TOUR, buildings)).toMatchObject({ id: 't', removed: false });
		const kept = { ...START_TOUR, building: 't' };
		expect(tourBuildingOf(kept, buildings).building?.id).toBe('t');
		expect(tourBuildingOf(kept, [buildings[0]!])).toEqual({
			building: null,
			id: 't',
			removed: true
		});
		expect(tourBuildingOf(START_TOUR, [buildings[0]!])).toEqual({
			building: null,
			id: undefined,
			removed: false
		});
	});

	it('only the dish placed at the Pick and Place steps carries the tour flag', () => {
		const pick = { ...START_TOUR, step: SC_TOUR_STEPS.findIndex((s) => s.id === 'pick') };
		const place = { ...START_TOUR, step: SC_TOUR_STEPS.findIndex((s) => s.id === 'place') };
		expect(placesTourBuilding(place, TOUR_BUILDING)).toBe(true);
		expect(placesTourBuilding(pick, TOUR_BUILDING)).toBe(true);
		expect(placesTourBuilding(place, 'stock.hangar')).toBe(false);
		expect(placesTourBuilding({ ...place, building: 'x' }, TOUR_BUILDING)).toBe(false);
		expect(placesTourBuilding(START_TOUR, TOUR_BUILDING)).toBe(false);
		expect(placesTourBuilding(skipTour(place), TOUR_BUILDING)).toBe(false);
		expect(placesTourBuilding(null, TOUR_BUILDING)).toBe(false);
	});
});

function svelteSources(dir: string): string {
	return readdirSync(dir)
		.map((name) => join(dir, name))
		.map((path) =>
			statSync(path).isDirectory()
				? svelteSources(path)
				: path.endsWith('.svelte')
					? readFileSync(path, 'utf8')
					: ''
		)
		.join('\n');
}

describe('every tour step points at something that exists (plan 377)', () => {
	const ui = svelteSources(join(__dirname, '..', '..'));
	const { registries } = loadPlugins([...BUILTIN_PLUGINS]);
	/** A test id in the source: as written, in a table, or as `sc-build-{card.id}` with a real building. */
	const exists = (id: string): boolean =>
		new RegExp(`testid=["{\`']*${id.replace(/[.]/g, '\\.')}["\`'}]`).test(ui) ||
		ui.includes(`: '${id}'`) ||
		(id.startsWith('sc-build-') &&
			ui.includes('data-testid="sc-build-{card.id}"') &&
			registries.buildings.has(id.slice('sc-build-'.length)));
	const states: Partial<ScTourObservation>[] = [
		{},
		{ economy: true },
		{ buildOpen: true },
		{ selected: 'd1' },
		{ confirm: true },
		{ economy: true, selected: 'd1', buildOpen: true, confirm: true }
	];

	it.each(SC_TOUR_STEPS.map((s) => [s.id, s] as const))('%s', (_, step) => {
		for (const o of states) {
			const id = step.point(at(o));
			if (id !== null) expect(exists(id), `${step.id}: ${id}`).toBe(true);
			expect(step.text(at(o)).length).toBeGreaterThan(20);
		}
	});

	it('the tour building is a stock building that fits the home site', () => {
		const def = registries.buildings.get(TOUR_BUILDING);
		expect(def?.placement).toBe('home');
		expect(def?.levels.length).toBeGreaterThan(1);
	});
});
