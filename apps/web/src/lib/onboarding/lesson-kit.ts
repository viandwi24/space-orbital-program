/**
 * Shared pieces of the lessons (plan 344): the focus placeholder, the scene's numbers, the closed
 * places and steps several lessons use. Runtime values the level files need live here, not in
 * `lessons.ts`, which imports the level files.
 */
import type { EntityId } from '@orbital/core';
import type { Lesson, LessonPlace, LessonSetupCall, LessonStep } from './lessons';

/** Stands for the lesson vessel's id in a setup call's arguments (`runLessonSetup`). */
export const FOCUS = '$focus' as unknown as EntityId;

/** Radius of the stock home planet, m. */
export const HOME_RADIUS = 600_000;
/** Top of Home's air, m: the orbit lessons' line. */
export const HOME_AIR = 70_000;
/** The parking orbit the orbit lessons start in, m. */
export const PARKING = 100_000;
/** The docking target leads by this much along the orbit, m (Auto Dock starts within 250 m). */
export const TARGET_LEAD = 200;
/** The rendezvous target leads by this much along the orbit, m. */
export const RENDEZVOUS_LEAD = 20_000;
/** The maneuver-node lesson's target orbit, m. */
export const RAISED_ORBIT = 250_000;

/** Lights the lesson vessel's first stage (its engine) once it is in place. */
export const LIGHT: LessonSetupCall = { fn: 'send', args: [{ type: 'stage', vessel: FOCUS }] };
/** The lesson vessel in a circular parking orbit round Home. */
export const IN_PARKING_ORBIT: LessonSetupCall = {
	fn: 'setOrbit',
	args: [{ body: 'stock.home', apoapsis: PARKING, periapsis: PARKING }]
};

const REASONS: Record<LessonPlace, string> = {
	vab: 'The Hangar is closed during this lesson: fly the vessel the lesson gives you.',
	launch: 'Launching is closed during a lesson: leave it to fly your own rockets.',
	rnd: 'Research is closed during this lesson.',
	administration: 'Administration is closed during this lesson.',
	astronauts: 'The Astronaut Complex is closed during this lesson.',
	mods: 'Mods cannot change during a lesson.',
	'test-stand': 'The Test Stand is closed during this lesson.',
	'space-center': 'The Space Center waits until this lesson is over.',
	'mission-center': 'The Mission Center waits until this lesson is over.'
};

/** Every building but Flight closed, except `open`. The Space Center and Mission Center stay open. */
export function closedPlaces(...open: LessonPlace[]): Lesson['blocked']['places'] {
	const shut = (Object.keys(REASONS) as LessonPlace[]).filter(
		(p) => p !== 'space-center' && p !== 'mission-center' && !open.includes(p)
	);
	return Object.fromEntries(shut.map((p) => [p, REASONS[p]]));
}

/** Add a dock panel from the Panel library: done once it is on the rail. */
export function addPanelStep(id: string, panel: string, name: string, why: string): LessonStep {
	return {
		id,
		title: `Add the ${name}`,
		text: `Open the Panel library (the + at the bottom of the dock on the left) and add the ${name}. ${why}`,
		targets: { testids: ['dock-library'], panels: [panel] },
		done: (o) => o.panels.includes(panel)
	};
}

/** Stage to light the engine (lesson vessels start with their engines cold). */
export function lightStep(why: string): LessonStep {
	return {
		id: 'light',
		title: 'Light the engine',
		text: `Press {key:stage}: the first stage lights the engine with the throttle closed. ${why}`,
		touchText: `Tap Stage: the first stage lights the engine with the throttle closed. ${why}`,
		actions: ['stage'],
		done: (o) => o.stagesFired >= 1
	};
}
