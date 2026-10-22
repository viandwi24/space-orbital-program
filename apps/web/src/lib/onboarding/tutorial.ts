/**
 * The first-flight tutorial (plan 023, ADR 0059): build, launch, stage, gravity turn, SAS, map,
 * orbit. A pure step machine. The pages feed it an `Observation` of what the player has done; a
 * step completes only when its own condition holds, never earlier, and the progress persists
 * (`settings.ts`). Nothing here touches the DOM or the sim.
 */
import type { TutorialProgress } from '../settings/settings';
import type { ActionId, Keymap } from '../keybindings';

export type TutorialScene = 'vab' | 'flight';

/** What the VAB sees in the design, by catalogue category. */
export interface VabObservation {
	command: boolean;
	engine: boolean;
	tank: boolean;
}

export interface FlightObservation {
	/** Vessel throttle, 0..1. */
	throttle: number;
	stagesFired: number;
	/** Height above the ground, m. */
	altitude: number;
	sasOn: boolean;
	/** Active SAS mode id (`prograde`, ...), or `off`. */
	sasMode: string;
	/** The map view is open now. */
	map: boolean;
	/** Orbit of the body being orbited: apoapsis and periapsis altitude in m, null on a hyperbola or without an orbit. */
	apoapsis: number | null;
	periapsis: number | null;
}

export type Observation =
	{ scene: 'vab'; vab: VabObservation } | { scene: 'flight'; flight: FlightObservation };

export interface TutorialStep {
	id: string;
	scene: TutorialScene;
	title: string;
	/** `{key:action}` stands for the key now bound to that action (`stepText`; ADR 0061). */
	text: string;
	/** The same step for touch controls (plan 053); the text above when absent. */
	touchText?: string;
	/** Actions whose keys show as key caps next to the text. */
	actions?: readonly ActionId[];
	done(o: Observation): boolean;
}

/** The step's text for the keys in force; unknown placeholders are left as written (a test pins that none exist). */
export function stepText(
	step: Pick<TutorialStep, 'text' | 'touchText'>,
	keymap: Keymap,
	touch = false
): string {
	const text = touch ? (step.touchText ?? step.text) : step.text;
	return text.replace(/\{key:([A-Za-z]+)\}/g, (whole, id: string) => {
		const label = keymap.label(id as ActionId);
		return label === '' ? whole : label;
	});
}

/** Key caps of a step for the keys in force (none on touch). */
export function stepKeys(
	step: Pick<TutorialStep, 'actions'>,
	keymap: Keymap,
	touch = false
): string[] {
	if (touch) return [];
	return (step.actions ?? []).flatMap((a) => keymap.labels(a).slice(0, 1));
}

/** Above this height the atmosphere no longer shapes the orbit; the tutorial's orbit target, m. */
export const TARGET_ORBIT = 70_000;

const flight = (o: Observation): FlightObservation | null =>
	o.scene === 'flight' ? o.flight : null;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
	{
		id: 'build',
		scene: 'vab',
		title: 'Build a rocket',
		text: 'Pick parts on the left and click a ring on the vessel to attach them: a command pod on top, a fuel tank under it, an engine at the bottom.',
		done: (o) => o.scene === 'vab' && o.vab.command && o.vab.engine && o.vab.tank
	},
	{
		id: 'launch',
		scene: 'vab',
		title: 'Launch it',
		text: 'The Pre-flight checks on the right should show no red items. Press Launch in the menu bar at the top right, then Launch from pad. The Library has a Two-stage starter that reaches orbit.',
		done: (o) => o.scene === 'flight'
	},
	{
		id: 'throttle',
		scene: 'flight',
		title: 'Throttle up',
		text: 'Press {key:throttleFull} for full throttle. {key:throttleUp} and {key:throttleDown} change it gradually; {key:throttleCut} cuts it.',
		touchText: 'Drag the throttle slider up, or tap Full. Tap Cut to close it again.',
		actions: ['throttleFull'],
		done: (o) => (flight(o)?.throttle ?? 0) > 0.5
	},
	{
		id: 'stage',
		scene: 'flight',
		title: 'Light the engine',
		text: 'Press {key:stage} to fire the first stage. It fires the next stage every time; the stage stack on the right shows what is left.',
		touchText:
			'Tap Stage to fire the first stage. It fires the next stage every time; the stage stack on the right shows what is left.',
		actions: ['stage'],
		done: (o) => (flight(o)?.stagesFired ?? 0) >= 1
	},
	{
		id: 'climb',
		scene: 'flight',
		title: 'Hold it steady',
		text: 'Press {key:sasToggle} to switch on the stability assist (SAS) so the rocket holds its heading. Climb straight up until about 10 km.',
		touchText:
			'Tap SAS to switch on the stability assist so the rocket holds its heading. Climb straight up until about 10 km.',
		actions: ['sasToggle'],
		done: (o) => flight(o)?.sasOn === true && (flight(o)?.altitude ?? 0) > 8_000
	},
	{
		id: 'turn',
		scene: 'flight',
		title: 'Follow the arc',
		text: 'Tilt the nose a few degrees towards heading 090 (east) with {key:pitchPlus}, {key:pitchMinus}, {key:yawMinus} and {key:yawPlus}, then press {key:sasPrograde}: SAS keeps the nose on the prograde marker (the yellow ring on the navball) and the rocket follows its own arc.',
		touchText:
			'Tilt the nose a few degrees towards heading 090 (east) with the steering pad, then tap the prograde button beside the navball: SAS keeps the nose on the prograde marker (the yellow ring on the navball) and the rocket follows its own arc.',
		actions: ['sasPrograde'],
		done: (o) => flight(o)?.sasMode === 'prograde'
	},
	{
		id: 'apoapsis',
		scene: 'flight',
		title: 'Raise the apoapsis',
		text: 'Burn until Ap (the top of your orbit, in the Orbit panel on the left) passes 70 km. Press {key:stage} to drop an empty stage. {key:throttleCut} cuts the engine.',
		touchText:
			'Burn until Ap (the top of your orbit, in the Orbit panel on the left) passes 70 km. Tap Stage to drop an empty stage. Tap Cut to cut the engine.',
		actions: ['throttleCut'],
		done: (o) => (flight(o)?.apoapsis ?? 0) >= TARGET_ORBIT
	},
	{
		id: 'map',
		scene: 'flight',
		title: 'Open the map',
		text: 'Press {key:map}. The map shows your orbit with Ap and Pe markers. Press {key:map} again to come back.',
		touchText:
			'Tap Map. The map shows your orbit with Ap and Pe markers. Tap it again to come back.',
		actions: ['map'],
		done: (o) => flight(o)?.map === true
	},
	{
		id: 'circularise',
		scene: 'flight',
		title: 'Circularise',
		text: 'Coast up to the Ap marker (the {key:warpDown} and {key:warpUp} keys warp time), then burn with SAS on prograde until Pe is above 70 km too.',
		touchText:
			'Coast up to the Ap marker (the warp buttons speed up time), then burn with SAS on prograde until Pe is above 70 km too.',
		actions: ['warpDown', 'warpUp'],
		done: (o) => (flight(o)?.periapsis ?? -Infinity) >= TARGET_ORBIT
	}
];

export const PENDING: TutorialProgress = { status: 'pending', step: 0 };

/** The first step that happens in flight; reaching the flight page completes the VAB steps. */
const FIRST_FLIGHT = TUTORIAL_STEPS.findIndex((s) => s.scene === 'flight');

/** The step to show on `scene`, or null when the tutorial is over or the step belongs to the other page. */
export function currentStep(progress: TutorialProgress, scene: TutorialScene): TutorialStep | null {
	if (progress.status === 'done' || progress.status === 'skipped') return null;
	const step = TUTORIAL_STEPS[progress.step];
	if (!step) return null;
	if (scene === 'flight' && step.scene === 'vab') return TUTORIAL_STEPS[FIRST_FLIGHT] ?? null;
	return step.scene === scene ? step : null;
}

/**
 * The progress after `o`. At most one step completes per observation, so a player always sees each
 * card at least once. Being in flight finishes the VAB steps (a player who loads a save goes straight
 * to the flight hints), and a fresh launch on the pad restarts them. Returns the same object when nothing changed.
 */
export function advance(progress: TutorialProgress, o: Observation): TutorialProgress {
	if (progress.status === 'done' || progress.status === 'skipped') return progress;
	let step = progress.step;
	if (o.scene === 'flight' && TUTORIAL_STEPS[step]?.scene === 'vab') step = FIRST_FLIGHT;
	// A vessel standing on the pad with nothing fired is a new launch: the flight hints start over
	// (after a crash, a revert or a different rocket), but a step the player is on is never undone in flight.
	if (
		o.scene === 'flight' &&
		step > FIRST_FLIGHT &&
		step < TUTORIAL_STEPS.length &&
		o.flight.stagesFired === 0 &&
		o.flight.altitude < 100 &&
		o.flight.throttle === 0 &&
		o.flight.sasMode === 'off'
	)
		step = FIRST_FLIGHT;
	// A rocket that already has an orbit above the atmosphere has done what the guide teaches.
	if (o.scene === 'flight' && (o.flight.periapsis ?? -Infinity) >= TARGET_ORBIT)
		return { status: 'done', step: TUTORIAL_STEPS.length };
	const current = TUTORIAL_STEPS[step];
	if (!current) return { status: 'done', step: TUTORIAL_STEPS.length };
	if (current.scene === o.scene && current.done(o)) {
		const next = step + 1;
		return next >= TUTORIAL_STEPS.length
			? { status: 'done', step: TUTORIAL_STEPS.length }
			: { status: 'active', step: next };
	}
	return step === progress.step ? progress : { status: 'active', step };
}

export const skip = (progress: TutorialProgress): TutorialProgress =>
	progress.status === 'done' ? progress : { status: 'skipped', step: progress.step };

/** "3 of 9" for the card. */
export const stepLabel = (progress: TutorialProgress, scene: TutorialScene): string => {
	const step = currentStep(progress, scene);
	return step ? `${TUTORIAL_STEPS.indexOf(step) + 1} of ${TUTORIAL_STEPS.length}` : '';
};
