/**
 * Lessons (plan 229, plan 344, ADR 0293): short, focused scenes from the first launch to docking,
 * grouped by level. A lesson is data: where it starts, its vessel, the debug API calls that set its
 * scene (plan 203, ADR 0200), what it does not let the player use and why, its steps and its goal.
 * The step machine is the first-flight guide's (`tutorial.ts`): a step completes only on its own
 * condition, at most one per observation, and reaching the goal (or the last step) ends the lesson.
 * Nothing here touches the DOM or the sim.
 */
import {
	LESSON_FOCUS,
	loadPlugins,
	type BodyDefinition,
	type EntityId,
	type LessonDefinition,
	type LessonLevel,
	type LessonObservation,
	type LessonPlace,
	type LessonSetupCall,
	type LessonStep,
	type LessonTargets,
	type Snapshot,
	type VabLessonState,
	type VesselDesign,
	type VesselSnapshot
} from '@orbital/core';
import { BUILTIN_PLUGINS } from '../builtins';
import { modRuntime } from '../mods/runtime';
import type { DebugApi } from '../debug/api';
import { spinVector, surfaceVelocity } from '../speed';
import type { ActionId } from '../keybindings';
import type { LessonProgress } from '../settings/settings';

export type {
	LessonLevel,
	LessonObservation,
	LessonPlace,
	LessonSetupCall,
	LessonStep,
	LessonTargets,
	VabLessonState
};

/** Stands for the lesson vessel's id in a setup call's arguments (`runLessonSetup`). */
export const FOCUS = LESSON_FOCUS as unknown as EntityId;

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
	controlPort: false,
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
	bases: 0,
	baseOffers: [],
	vessels: 0,
	debris: 0,
	vab: null
};

/** What the flight page has at hand, once per HUD model. */
export interface LessonInput {
	vessel: Pick<
		VesselSnapshot,
		'soi' | 'position' | 'velocity' | 'surface' | 'ports' | 'baseOffer'
	> &
		Partial<
			Pick<
				VesselSnapshot,
				| 'id'
				| 'parts'
				| 'splashed'
				| 'science'
				| 'autopilot'
				| 'autopilotLast'
				| 'target'
				| 'controlPart'
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
	snapshot?: Pick<Snapshot, 'vessels'> & Partial<Pick<Snapshot, 'science' | 'network' | 'sites'>>;
}

const moduleOf = (part: { modules?: Record<string, unknown> }, id: string) =>
	part.modules?.[id] as Record<string, unknown> | undefined;

/** Counts and totals that come from the whole snapshot (any page). */
export function observeWorld(
	snapshot:
		(Pick<Snapshot, 'vessels'> & Partial<Pick<Snapshot, 'science' | 'network' | 'sites'>>) | null,
	vessel?: EntityId
): Pick<
	LessonObservation,
	'flags' | 'vessels' | 'debris' | 'scienceCredited' | 'linkHops' | 'bases'
> {
	if (!snapshot)
		return { flags: 0, vessels: 0, debris: 0, scienceCredited: 0, linkHops: 0, bases: 0 };
	const link =
		vessel === undefined
			? undefined
			: snapshot.network?.vessels.find((v) => Number(v.vessel) === Number(vessel));
	return {
		bases: (snapshot.sites ?? []).filter((s) =>
			s.buildings.some((b) => b.kind === 'stock.base-hub')
		).length,
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
		controlPort:
			v.controlPart !== undefined && (v.ports ?? []).some((p) => p.part === v.controlPart),
		drive: input.drive === true,
		baseOffers: Object.keys(v.baseOffer ?? {})
	};
}

/** The observation on a page other than Flight: the place, the world's counts, the Hangar. */
export function observePlace(
	place: string,
	snapshot:
		(Pick<Snapshot, 'vessels'> & Partial<Pick<Snapshot, 'science' | 'network' | 'sites'>>) | null,
	vab: VabLessonState | null = null
): LessonObservation {
	return { ...QUIET, ...observeWorld(snapshot), place, vab };
}

export const LEVELS: readonly { id: LessonLevel; title: string; summary: string }[] = [
	{
		id: 'basics',
		title: 'Basics',
		summary:
			'Launch, build, reach orbit, change it, come home, find your way round the Space Center.'
	},
	{
		id: 'flight',
		title: 'Flight',
		summary:
			'Fly with the Guidance Computer, go to the moon, land, walk, do science, stay in touch.'
	},
	{
		id: 'advanced',
		title: 'Advanced',
		summary: 'Meet and dock in orbit, drive a rover, move robotic parts, keep orbit tidy.'
	}
];

/**
 * A lesson as the app uses it: the registered definition with its progress id (`first-launch` for
 * the game's own `stock.first-launch`), and a design that is a copy.
 */
export type Lesson = Omit<LessonDefinition, 'blocked'> & {
	blocked: {
		actions: Partial<Record<ActionId, string>>;
		places: Partial<Record<LessonPlace, string>>;
	};
};

/** The game's lessons are saved and linked under their id without the plugin prefix. */
export const lessonKey = (registryId: string): string => registryId.replace(/^stock\./, '');

let builtin: ReturnType<typeof loadPlugins>['registries'] | undefined;
const listed = new WeakMap<object, readonly Lesson[]>();

/** The lessons of the booted plugins, in plugin and registration order (the same objects each call). */
export function lessons(): readonly Lesson[] {
	const registries =
		modRuntime().registries ?? (builtin ??= loadPlugins([...BUILTIN_PLUGINS]).registries);
	let list = listed.get(registries);
	if (!list) {
		list = registries.lessons
			.entries()
			.map((e) => ({ ...e.def, id: lessonKey(e.def.id) }) as unknown as Lesson);
		listed.set(registries, list);
	}
	return list;
}

/** The design a Flight lesson starts with: a copy, so a flight never edits the registered one. */
export const lessonDesign = (lesson: Lesson): VesselDesign | undefined =>
	lesson.design === undefined ? undefined : structuredClone(lesson.design);

export const lessonOf = (id: string): Lesson | undefined => lessons().find((l) => l.id === id);

export const lessonsOfLevel = (level: LessonLevel): readonly Lesson[] =>
	lessons().filter((l) => l.level === level);

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

/** Skip the step on show (the card's Skip step): the next one, or done after the last. */
export function skipStep(lesson: Lesson, progress: LessonProgress): LessonProgress {
	if (progress.status === 'done') return progress;
	const next = progress.step + 1;
	return next >= lesson.steps.length
		? { status: 'done', step: lesson.steps.length }
		: { status: 'active', step: next };
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
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withFocus(v, focus)]));
	return value;
}

/** Runs the lesson's setup calls in order; the first refusal stops it with its reason. */
export async function runLessonSetup(
	lesson: Lesson,
	api: DebugApi
): Promise<{ ok: true } | { ok: false; reason: string }> {
	for (const call of lesson.setup) {
		const fn = (api as unknown as Record<string, (...args: unknown[]) => unknown>)[call.fn];
		if (typeof fn !== 'function') return { ok: false, reason: `${call.fn}: not a debug API call` };
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
