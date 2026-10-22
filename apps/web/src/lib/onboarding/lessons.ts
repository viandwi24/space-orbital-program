/**
 * Lessons (plan 229, plan 344, ADR 0293): short, focused scenes from the first launch to docking,
 * grouped by level. A lesson is data: where it starts, its vessel, the debug API calls that set its
 * scene (plan 203, ADR 0200), what it does not let the player use and why, its steps and its goal.
 * The step machine is the first-flight guide's (`tutorial.ts`): a step completes only on its own
 * condition, at most one per observation, and reaching the goal (or the last step) ends the lesson.
 * Nothing here touches the DOM or the sim.
 */
import type {
	BodyDefinition,
	Command,
	EntityId,
	Snapshot,
	VesselDesign,
	VesselSnapshot
} from '@orbital/core';
import type { DebugApi } from '../debug/api';
import type { Content } from '../editor/state';
import { spinVector, surfaceVelocity } from '../speed';
import type { ActionId } from '../keybindings';
import type { LessonProgress } from '../settings/settings';
import { BASIC_LESSONS } from './lessons-basics';
import { FLIGHT_LESSONS } from './lessons-flight';
import { ADVANCED_LESSONS } from './lessons-advanced';
import { FOCUS } from './lesson-kit';

export { FOCUS };

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
	/** Vessels in the world, and how many are debris. */
	vessels: number;
	debris: number;
	/** The Hangar's design, on the Hangar page. */
	vab: VabLessonState | null;
}

/** An observation with nothing going on: the defaults a page fills in from what it knows. */
export const QUIET: LessonObservation = {
	place: 'flight',
	body: '',
	throttle: 0,
	altitude: 0,
	surfaceSpeed: 0,
	landed: false,
	splashed: false,
	sasMode: 'off',
	rcs: false,
	map: false,
	warp: 1,
	apoapsis: null,
	periapsis: null,
	nodes: 0,
	nodePrograde: 0,
	nodeLeft: null,
	target: null,
	docked: false,
	targetPort: false,
	stagesFired: 0,
	parachute: false,
	panels: [],
	openPanel: null,
	autopilot: null,
	autopilotLast: null,
	eva: false,
	walking: false,
	flags: 0,
	scienceStored: 0,
	scienceCredited: 0,
	linkHops: 0,
	joint: 0,
	jointsMoved: 0,
	drive: false,
	vessels: 0,
	debris: 0,
	vab: null
};

/** What the flight page has at hand, once per HUD model. */
export interface LessonInput {
	vessel: Pick<VesselSnapshot, 'soi' | 'position' | 'velocity' | 'surface' | 'ports'> &
		Partial<
			Pick<
				VesselSnapshot,
				'id' | 'parts' | 'splashed' | 'science' | 'autopilot' | 'autopilotLast' | 'target'
			>
		>;
	bodies: readonly Pick<BodyDefinition, 'id' | 'rotationPeriod' | 'rotation'>[];
	throttle: number;
	altitude: number;
	sasMode: string;
	rcs: boolean;
	map: boolean;
	warp: number;
	apoapsis: number | null;
	periapsis: number | null;
	nodes: readonly { prograde: number; dv: number }[];
	target: { key: string; distance: number; relativeSpeed: number } | null;
	stagesFired?: number;
	panels?: readonly string[];
	openPanel?: string | null;
	eva?: { walking: boolean } | null;
	drive?: boolean;
	/** The whole snapshot: flags, debris, science credited and the comms route. */
	snapshot?: Pick<Snapshot, 'vessels'> & Partial<Pick<Snapshot, 'science' | 'network'>>;
}

const moduleOf = (part: { modules?: Record<string, unknown> }, id: string) =>
	part.modules?.[id] as Record<string, unknown> | undefined;

/** Counts and totals that come from the whole snapshot (any page). */
export function observeWorld(
	snapshot: (Pick<Snapshot, 'vessels'> & Partial<Pick<Snapshot, 'science' | 'network'>>) | null,
	vessel?: EntityId
): Pick<LessonObservation, 'flags' | 'vessels' | 'debris' | 'scienceCredited' | 'linkHops'> {
	if (!snapshot) return { flags: 0, vessels: 0, debris: 0, scienceCredited: 0, linkHops: 0 };
	const link =
		vessel === undefined
			? undefined
			: snapshot.network?.vessels.find((v) => Number(v.vessel) === Number(vessel));
	return {
		flags: snapshot.vessels.filter((v) => v.type === 'flag').length,
		vessels: snapshot.vessels.filter((v) => v.type !== 'flag').length,
		debris: snapshot.vessels.filter((v) => v.type === 'debris').length,
		scienceCredited: (snapshot.science ?? []).reduce((s, x) => s + x.credited, 0),
		linkHops: link && link.to !== null ? Math.max(1, link.route.length) : 0
	};
}

/** The observation of `input` (pure; the flight page calls it on every HUD model). */
export function observeLesson(input: LessonInput): LessonObservation {
	const v = input.vessel;
	const body = input.bodies.find((b) => String(b.id) === String(v.soi));
	const ground =
		v.surface || !body
			? { x: 0, y: 0, z: 0 }
			: surfaceVelocity(v.position, v.velocity, spinVector(body));
	const first = input.nodes[0];
	const parts = v.parts ?? [];
	const chute = parts.some((p) => {
		const status = moduleOf(p, 'stock.parachute')?.status;
		return status === 'semi' || status === 'full';
	});
	const travel = parts.flatMap((p) => {
		const value = moduleOf(p, 'stock.robotic')?.value;
		return typeof value === 'number' ? [Math.abs(value)] : [];
	});
	const last = v.autopilotLast;
	return {
		...QUIET,
		...observeWorld(input.snapshot ?? null, v.id),
		place: 'flight',
		body: String(v.soi),
		throttle: input.throttle,
		altitude: input.altitude,
		surfaceSpeed: Math.hypot(ground.x, ground.y, ground.z),
		landed: v.surface === true,
		splashed: v.splashed === true,
		sasMode: input.sasMode,
		rcs: input.rcs,
		map: input.map,
		warp: input.warp,
		apoapsis: input.apoapsis,
		periapsis: input.periapsis,
		nodes: input.nodes.length,
		nodePrograde: first?.prograde ?? 0,
		nodeLeft: first ? first.dv : null,
		target: input.target,
		docked: (v.ports ?? []).some((p) => !p.free),
		stagesFired: input.stagesFired ?? 0,
		parachute: chute,
		panels: input.panels ?? [],
		openPanel: input.openPanel ?? null,
		autopilot: v.autopilot?.id ?? null,
		autopilotLast: last ? { id: last.id, outcome: last.outcome } : null,
		eva: input.eva != null,
		walking: input.eva?.walking === true,
		scienceStored: v.science?.stored?.length ?? 0,
		joint: Math.max(0, ...travel),
		jointsMoved: travel.filter((t) => t > 20).length,
		targetPort: v.target?.kind === 'vessel' && v.target.part !== undefined,
		drive: input.drive === true
	};
}

/** The observation on a page other than Flight: the place, the world's counts, the Hangar. */
export function observePlace(
	place: string,
	snapshot: (Pick<Snapshot, 'vessels'> & Partial<Pick<Snapshot, 'science' | 'network'>>) | null,
	vab: VabLessonState | null = null
): LessonObservation {
	return { ...QUIET, ...observeWorld(snapshot), place, vab };
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
	actions?: readonly ActionId[];
	targets?: LessonTargets;
	done(o: LessonObservation): boolean;
}


/** One call of the debug API that sets the scene: the function's name and its arguments. */
export type LessonSetupCall = {
	[K in keyof DebugApi]: { fn: K; args: Parameters<DebugApi[K]> };
}[keyof DebugApi];

/** The in-world pages a lesson can close (the (world) route names). */
export type LessonPlace =
	| 'vab'
	| 'launch'
	| 'rnd'
	| 'administration'
	| 'astronauts'
	| 'mods'
	| 'test-stand'
	| 'space-center'
	| 'mission-center';

export type LessonLevel = 'basics' | 'flight' | 'advanced';

export const LEVELS: readonly { id: LessonLevel; title: string; summary: string }[] = [
	{
		id: 'basics',
		title: 'Basics',
		summary: 'Launch, build, reach orbit, change it, come home, find your way round the Space Center.'
	},
	{
		id: 'flight',
		title: 'Flight',
		summary: 'Fly with the Guidance Computer, go to the moon, land, walk, do science, stay in touch.'
	},
	{
		id: 'advanced',
		title: 'Advanced',
		summary: 'Meet and dock in orbit, drive a rover, move robotic parts, keep orbit tidy.'
	}
];

export interface Lesson {
	id: string;
	level: LessonLevel;
	title: string;
	summary: string;
	/** Where the lesson opens (ADR 0293 point 2); Flight when absent. */
	start?: 'flight' | 'vab' | 'space-center';
	/** The vessel a Flight lesson starts with; it is placed by `setup`. */
	design?(content: Content): VesselDesign;
	/**
	 * Debug API calls in order, after the flight starts; a function when a call carries a design
	 * built from the content. `FOCUS` stands for the lesson vessel.
	 */
	setup: readonly LessonSetupCall[] | ((content: Content) => readonly LessonSetupCall[]);
	/** Actions and pages the lesson does not offer, each with the reason shown when tried. */
	blocked: {
		actions: Partial<Record<ActionId, string>>;
		places: Partial<Record<LessonPlace, string>>;
	};
	steps: readonly LessonStep[];
	/** Reaching it ends the lesson, whatever step is showing; without one, the last step does. */
	goal?(o: LessonObservation): boolean;
	debrief: string;
	/** "Try it in your world": what to do next outside the lesson. */
	hint: string;
}

export const LESSONS: readonly Lesson[] = [...BASIC_LESSONS, ...FLIGHT_LESSONS, ...ADVANCED_LESSONS];

export const lessonOf = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

export const lessonsOfLevel = (level: LessonLevel): readonly Lesson[] =>
	LESSONS.filter((l) => l.level === level);

export const NEW_LESSON: LessonProgress = { status: 'new', step: 0 };

/** The step to show, or null when the lesson is over. */
export function lessonStep(lesson: Lesson, progress: LessonProgress): LessonStep | null {
	if (progress.status === 'done') return null;
	return lesson.steps[progress.step] ?? null;
}

/**
 * The progress after `o`: the goal ends the lesson; otherwise the current step completes only on its
 * own condition, one per observation. Returns the same object when nothing changed.
 */
export function advanceLesson(
	lesson: Lesson,
	progress: LessonProgress,
	o: LessonObservation
): LessonProgress {
	if (progress.status === 'done') return progress;
	if (lesson.goal?.(o)) return { status: 'done', step: lesson.steps.length };
	const step = lesson.steps[progress.step];
	if (!step) return { status: 'done', step: lesson.steps.length };
	if (step.done(o)) {
		const next = progress.step + 1;
		return next >= lesson.steps.length
			? { status: 'done', step: lesson.steps.length }
			: { status: 'active', step: next };
	}
	return progress.status === 'active' ? progress : { status: 'active', step: progress.step };
}

/** A restart: back to the first step. */
export const restartLesson = (): LessonProgress => ({ status: 'active', step: 0 });

/** "2 of 5" for the card. */
export const lessonLabel = (lesson: Lesson, progress: LessonProgress): string =>
	progress.status === 'done' ? 'Done' : `${progress.step + 1} of ${lesson.steps.length}`;

/** `value` with every `FOCUS` replaced by `focus` (deep, plain data only). */
function withFocus(value: unknown, focus: EntityId | null): unknown {
	if (value === FOCUS) return focus;
	if (Array.isArray(value)) return value.map((v) => withFocus(v, focus));
	if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
		return Object.fromEntries(
			Object.entries(value).map(([k, v]) => [k, withFocus(v, focus)])
		);
	return value;
}

/** The lesson's setup calls for `content`. */
export const setupOf = (lesson: Lesson, content: Content): readonly LessonSetupCall[] =>
	typeof lesson.setup === 'function' ? lesson.setup(content) : lesson.setup;

/** Runs the lesson's setup calls in order; the first refusal stops it with its reason. */
export async function runLessonSetup(
	lesson: Lesson,
	api: DebugApi,
	content: Content
): Promise<{ ok: true } | { ok: false; reason: string }> {
	for (const call of setupOf(lesson, content)) {
		const fn = api[call.fn] as (...args: unknown[]) => unknown;
		const args = JSON.stringify(call.args).includes(String(FOCUS))
			? (withFocus(call.args, api.vessel()?.id ?? null) as unknown[])
			: (call.args as unknown[]);
		const result = (await fn.apply(api, args)) as { ok: boolean; reason?: string } | undefined;
		if (result && result.ok === false) {
			return { ok: false, reason: `${call.fn}: ${result.reason ?? 'refused'}` };
		}
	}
	return { ok: true };
}

/** The reason a lesson does not offer `action`, or null. */
export const blockedAction = (lesson: Lesson, action: ActionId): string | null =>
	lesson.blocked.actions[action] ?? null;

/** The reason a lesson closes the in-world page at `path` (`/vab`, `/base/launch`), or null. */
export function blockedPlace(lesson: Lesson, path: string): string | null {
	const name = path
		.split(/[?#]/)[0]!
		.split('/')
		.filter((p) => p !== '')
		.at(-1) as LessonPlace;
	return lesson.blocked.places[name] ?? null;
}

/** The page a lesson opens on, as a (world) route. */
export const lessonStart = (lesson: Lesson): 'flight' | 'vab' | 'space-center' =>
	lesson.start ?? 'flight';
