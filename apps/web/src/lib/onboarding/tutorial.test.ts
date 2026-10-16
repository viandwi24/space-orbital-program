import { describe, expect, it } from 'vitest';
import type { TutorialProgress } from '../settings/settings';
import {
	PENDING,
	TARGET_ORBIT,
	TUTORIAL_STEPS,
	advance,
	currentStep,
	skip,
	type FlightObservation,
	type Observation
} from './tutorial';

const flight = (patch: Partial<FlightObservation> = {}): Observation => ({
	scene: 'flight',
	flight: {
		throttle: 0,
		stagesFired: 0,
		altitude: 0,
		sasOn: false,
		sasMode: 'off',
		map: false,
		apoapsis: null,
		periapsis: null,
		...patch
	}
});
const vab = (command: boolean, engine: boolean, tank: boolean): Observation => ({
	scene: 'vab',
	vab: { command, engine, tank }
});

/** The observation that completes step `i`. */
const completing: Record<string, Observation> = {
	build: vab(true, true, true),
	launch: flight(),
	throttle: flight({ throttle: 1 }),
	stage: flight({ stagesFired: 1 }),
	climb: flight({ sasOn: true, altitude: 9_000 }),
	turn: flight({ sasMode: 'prograde' }),
	apoapsis: flight({ apoapsis: TARGET_ORBIT }),
	map: flight({ map: true }),
	circularise: flight({ periapsis: TARGET_ORBIT })
};

describe('tutorial steps', () => {
	it('cover build, launch, stage, turn, SAS, map and orbit in order, each with text and a condition', () => {
		expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
			'build',
			'launch',
			'throttle',
			'stage',
			'climb',
			'turn',
			'apoapsis',
			'map',
			'circularise'
		]);
		for (const s of TUTORIAL_STEPS) {
			expect(s.title.length).toBeGreaterThan(3);
			expect(s.text.length).toBeGreaterThan(20);
			expect(Object.keys(completing)).toContain(s.id);
		}
	});

	it('a full run advances one step per observation and finishes as done', () => {
		let p: TutorialProgress = PENDING;
		for (const [i, step] of TUTORIAL_STEPS.entries()) {
			expect(currentStep(p, step.scene)?.id).toBe(step.id);
			p = advance(p, completing[step.id]!);
			expect(p.step).toBe(i + 1);
		}
		expect(p.status).toBe('done');
		expect(currentStep(p, 'flight')).toBeNull();
	});

	it('does not advance on the wrong condition and does not skip ahead', () => {
		const at = (id: string): TutorialProgress => ({
			status: 'active',
			step: TUTORIAL_STEPS.findIndex((s) => s.id === id)
		});
		// Everything done at once: only the current step completes.
		const everything = flight({
			throttle: 1,
			stagesFired: 2,
			altitude: 20_000,
			sasOn: true,
			sasMode: 'prograde',
			map: true,
			apoapsis: 80_000,
			periapsis: 75_000
		});
		const p = advance(at('throttle'), everything);
		expect(p.step).toBe(at('stage').step);
		// Conditions are exact.
		expect(advance(at('throttle'), flight({ throttle: 0.5 }))).toEqual(at('throttle'));
		expect(advance(at('climb'), flight({ sasOn: true, altitude: 5_000 }))).toEqual(at('climb'));
		expect(advance(at('climb'), flight({ sasOn: false, altitude: 20_000 }))).toEqual(at('climb'));
		expect(advance(at('apoapsis'), flight({ apoapsis: TARGET_ORBIT - 1 }))).toEqual(at('apoapsis'));
		expect(advance(at('circularise'), flight({ periapsis: null }))).toEqual(at('circularise'));
		expect(advance(at('build'), vab(true, true, false))).toEqual(at('build'));
	});

	it('a VAB observation does not advance a flight step and vice versa', () => {
		expect(advance({ status: 'active', step: 2 }, vab(true, true, true))).toEqual({
			status: 'active',
			step: 2
		});
		expect(currentStep({ status: 'active', step: 2 }, 'vab')).toBeNull();
		expect(currentStep({ status: 'active', step: 0 }, 'flight')?.id).toBe('throttle');
	});

	it('reaching the flight page finishes the VAB steps (a player who loads a save)', () => {
		const p = advance(PENDING, flight());
		expect(TUTORIAL_STEPS[p.step]?.id).toBe('throttle');
	});

	it('skip persists and a skipped or finished tutorial never shows or advances again', () => {
		const skipped = skip({ status: 'active', step: 4 });
		expect(skipped.status).toBe('skipped');
		expect(currentStep(skipped, 'flight')).toBeNull();
		expect(advance(skipped, completing.climb!)).toBe(skipped);
		const done: TutorialProgress = { status: 'done', step: TUTORIAL_STEPS.length };
		expect(skip(done)).toBe(done);
		expect(advance(done, flight({ throttle: 1 }))).toBe(done);
		expect(currentStep(PENDING, 'vab')?.id).toBe('build');
	});

	it('a step index past the end is treated as done', () => {
		expect(advance({ status: 'active', step: 99 }, flight())).toEqual({
			status: 'done',
			step: TUTORIAL_STEPS.length
		});
		expect(currentStep({ status: 'active', step: 99 }, 'flight')).toBeNull();
	});
});
