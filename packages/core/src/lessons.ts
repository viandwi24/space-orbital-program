/**
 * Lessons (plan 344, ADR 0293; the registry: plan 379, ADR 0355): short, focused scenes from the
 * first launch to docking. A lesson is data: where it starts, its vessel, the debug API calls that
 * set its scene (plan 203, ADR 0200), what it does not let the player use and why, its steps and
 * its goal. A plugin registers lessons with `ctx.lessons`; the game's lessons are stock's. Nothing
 * here touches the DOM or the sim: the app's observation of a flight is what a step reads.
 */
import * as z from 'zod';
import { DEFINITION_ID_PATTERN } from './ids.ts';
import type { Command, VesselDesign } from './protocol.ts';

/** What the Hangar shows a lesson about its design (ADR 0293 point 3). */
export interface VabLessonState {
	parts: number;
	command: boolean;
	engine: boolean;
	tank: boolean;
	/** Fins and control surfaces. */
	fins: number;
	parachute: boolean;
	/** A part was placed with symmetry (2 or more copies). */
	symmetry: boolean;
	/** The pre-flight checks show nothing that blocks a launch or is no-go. */
	checksClear: boolean;
	/** The Blueprint Library is open. */
	library: boolean;
}

/** What a lesson reads, once per HUD model in Flight and per snapshot elsewhere. */
export interface LessonObservation {
	/** The in-world page: `flight`, `vab`, `space-center`, `mission-center`, … */
	place: string;
	/** Body of the sphere the vessel is in. */
	body: string;
	throttle: number;
	/** Height above the ground, m. */
	altitude: number;
	/** Speed relative to the ground, m/s. */
	surfaceSpeed: number;
	/** On the ground and at rest. */
	landed: boolean;
	/** In the water. */
	splashed: boolean;
	sasMode: string;
	rcs: boolean;
	map: boolean;
	/** Time warp factor now. */
	warp: number;
	apoapsis: number | null;
	periapsis: number | null;
	/** Planned maneuver nodes. */
	nodes: number;
	/** The first node's planned prograde Δv, m/s (0 without a node). */
	nodePrograde: number;
	/** Δv left on the first node, m/s; null without a node. */
	nodeLeft: number | null;
	/** `body:<id>` or `vessel:<id>` of the target, with its distance and relative speed. */
	target: { key: string; distance: number; relativeSpeed: number } | null;
	/** A docking port of the vessel is joined. */
	docked: boolean;
	/** The target is a docking port (not just a vessel). */
	targetPort: boolean;
	/** The vessel is controlled from one of its docking ports. */
	controlPort: boolean;
	/** Stages fired since the flight began. */
	stagesFired: number;
	/** A parachute is open (semi or full). */
	parachute: boolean;
	/** Dock panels on the rail, and the open one. */
	panels: readonly string[];
	openPanel: string | null;
	/** The running autopilot's id, and the last one's id and outcome. */
	autopilot: string | null;
	autopilotLast: { id: string; outcome: string } | null;
	/** A crew member is outside in a suit, and walking. */
	eva: boolean;
	walking: boolean;
	/** Flags standing in the world. */
	flags: number;
	/** Science results stored aboard, and science credited to the world so far. */
	scienceStored: number;
	scienceCredited: number;
	/** Hops on the vessel's comms route (0: no link). */
	linkHops: number;
	/** The largest robotic joint travel aboard, degrees (or metres for a piston). */
	joint: number;
	/** Robotic joints moved more than 20 from zero. */
	jointsMoved: number;
	/** Drive mode (rovers). */
	drive: boolean;
	/** Bases standing in the world (sites with a base hub; plan 386), and the base offers the focused vessel has: `found`, `join`, `refuel`. */
	bases: number;
	baseOffers: readonly string[];
	/** Vessels in the world, and how many are debris. */
	vessels: number;
	debris: number;
	/** The Hangar's design, on the Hangar page. */
	vab: VabLessonState | null;
}

/** Things a step tells the player to use; a test checks each exists (ADR 0293 point 5). */
export interface LessonTargets {
	/** `data-testid`s in the app's source; a trailing `*` matches a prefix (`crew-eva-*`). */
	testids?: readonly string[];
	/** Dock panel ids: the host's or a built-in mod's. */
	panels?: readonly string[];
	/** Sim commands the step leads to. */
	commands?: readonly Command['type'][];
}

export interface LessonStep {
	id: string;
	title: string;
	/** `{key:action}` stands for the key bound to that action (`stepText`). */
	text: string;
	touchText?: string;
	/** Keybinding action ids the step talks about. */
	actions?: readonly string[];
	targets?: LessonTargets;
	/** The test id of the control the step talks about: the guide highlights it (plan 344). */
	point?: string;
	done(o: LessonObservation): boolean;
}

/** One call of the app's debug API that sets the scene: the function's name and its arguments. */
export interface LessonSetupCall {
	fn: string;
	args: readonly unknown[];
}

export const LESSON_PLACES = [
	'vab',
	'launch',
	'rnd',
	'administration',
	'astronauts',
	'mods',
	'test-stand',
	'space-center',
	'mission-center'
] as const;
/** The in-world pages a lesson can close (the (world) route names). */
export type LessonPlace = (typeof LESSON_PLACES)[number];

export const LESSON_LEVELS = ['basics', 'flight', 'advanced'] as const;
export type LessonLevel = (typeof LESSON_LEVELS)[number];

export interface LessonDefinition {
	/** `<plugin>.<name>`. The game's own (`stock.first-launch`) are saved under the name without `stock.`. */
	id: string;
	level: LessonLevel;
	title: string;
	summary: string;
	/** Where the lesson opens (ADR 0293 point 2); Flight when absent. */
	start?: 'flight' | 'vab' | 'space-center';
	/** The vessel a Flight lesson starts with; it is placed by `setup`. */
	design?: VesselDesign;
	/** Debug API calls in order, after the flight starts. `LESSON_FOCUS` stands for the lesson vessel. */
	setup: readonly LessonSetupCall[];
	/** Actions and pages the lesson does not offer, each with the reason shown when tried. */
	blocked: {
		actions: Partial<Record<string, string>>;
		places: Partial<Record<LessonPlace, string>>;
	};
	steps: readonly LessonStep[];
	/** Reaching it ends the lesson, whatever step is showing; without one, the last step does. */
	goal?(o: LessonObservation): boolean;
	debrief: string;
	/** "Try it in your world": what to do next outside the lesson. */
	hint: string;
}

/** Stands for the lesson vessel's id in a setup call's arguments. */
export const LESSON_FOCUS = '$focus';

const fn = z.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', 'a function');

export const lessonDefinitionSchema = z.object({
	id: z.string().regex(DEFINITION_ID_PATTERN),
	level: z.enum(LESSON_LEVELS),
	title: z.string().min(1),
	summary: z.string().min(1),
	start: z.enum(['flight', 'vab', 'space-center']).optional(),
	design: z.custom<VesselDesign>((v) => typeof v === 'object' && v !== null).optional(),
	setup: z.array(z.object({ fn: z.string().min(1), args: z.array(z.unknown()) })),
	blocked: z.object({
		actions: z.record(z.string(), z.string()),
		places: z.record(z.string(), z.string())
	}),
	steps: z
		.array(
			z.object({
				id: z.string().min(1),
				title: z.string().min(1),
				text: z.string().min(1),
				done: fn
			})
		)
		.min(1),
	goal: fn.optional(),
	debrief: z.string(),
	hint: z.string()
});
