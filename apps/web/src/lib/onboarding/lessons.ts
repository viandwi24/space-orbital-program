/**
 * Lessons after the first orbit (plan 229): landing, maneuver nodes, rendezvous and docking, and a
 * transfer. A lesson is data: a design, the debug API calls that set its scene (plan 203, ADR
 * 0200), what it does not let the player use and why, its steps and its goal. The step machine is
 * the first-flight guide's (`tutorial.ts`): a step completes only on its own condition, at most one
 * per observation, and reaching the goal ends the lesson. Nothing here touches the DOM or the sim.
 */
import { partId, type BodyDefinition, type VesselDesign, type VesselSnapshot } from '@orbital/core';
import type { DebugApi } from '../debug/api';
import { spinVector, surfaceVelocity } from '../speed';
import type { ActionId } from '../keybindings';
import type { LessonProgress } from '../settings/settings';

/** What a lesson reads from the flight, once per HUD model. */
export interface LessonObservation {
	/** Body of the sphere the vessel is in. */
	body: string;
	throttle: number;
	/** Height above the ground, m. */
	altitude: number;
	/** Speed relative to the ground, m/s. */
	surfaceSpeed: number;
	/** On the ground and at rest. */
	landed: boolean;
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
	/** The vessel docked since the lesson began. */
	docked: boolean;
}

/** What the flight page has at hand, once per HUD model. */
export interface LessonInput {
	vessel: Pick<VesselSnapshot, 'soi' | 'position' | 'velocity' | 'surface' | 'ports'>;
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
	return {
		body: String(v.soi),
		throttle: input.throttle,
		altitude: input.altitude,
		surfaceSpeed: Math.hypot(ground.x, ground.y, ground.z),
		landed: v.surface === true,
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
		docked: (v.ports ?? []).some((p) => !p.free)
	};
}

export interface LessonStep {
	id: string;
	title: string;
	/** `{key:action}` stands for the key bound to that action (`stepText`). */
	text: string;
	touchText?: string;
	actions?: readonly ActionId[];
	done(o: LessonObservation): boolean;
}

/** One call of the debug API that sets the scene: the function's name and its arguments. */
export type LessonSetupCall = {
	[K in keyof DebugApi]: { fn: K; args: Parameters<DebugApi[K]> };
}[keyof DebugApi];

/** The in-world pages a lesson can close (the (world) route names). */
export type LessonPlace =
	'vab' | 'launch' | 'rnd' | 'administration' | 'astronauts' | 'mods' | 'test-stand';

export interface Lesson {
	id: string;
	title: string;
	summary: string;
	/** The vessel the lesson starts with; it is placed by `setup`. */
	design(): VesselDesign;
	/** Debug API calls in order, after the flight starts. `focus` stands for the lesson vessel. */
	setup: readonly LessonSetupCall[];
	/** Actions and pages the lesson does not offer, each with the reason shown when tried. */
	blocked: {
		actions: Partial<Record<ActionId, string>>;
		places: Partial<Record<LessonPlace, string>>;
	};
	steps: readonly LessonStep[];
	/** Reaching it ends the lesson, whatever step is showing. */
	goal(o: LessonObservation): boolean;
	debrief: string;
	/** "Try it in your world": what to do next outside the lesson. */
	hint: string;
}

const part = (
	index: number,
	id: string,
	parent: number | null,
	node = 'top',
	parentNode = 'bottom'
) => ({
	index,
	part: partId(id),
	parent: parent === null ? null : { index: parent, parentNode, node }
});

/** A chain of stacked parts, top to bottom. */
const stack = (name: string, ids: readonly string[]): VesselDesign => ({
	formatVersion: 3,
	name,
	parts: ids.map((id, i) => part(i, id, i === 0 ? null : i - 1)),
	stages: []
});

const radialRcs = (from: number, parent: number) =>
	[0, 1, 2, 3].map((k) => ({
		index: from + k,
		part: partId('stock.rcs-block'),
		parent: {
			index: parent,
			parentNode: 'surface',
			node: 'radial',
			radial: { angle: (k * Math.PI) / 2, y: 0 }
		}
	}));

export const LANDER = (): VesselDesign => ({
	...stack('Lesson lander', [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-small',
		'stock.engine-lv',
		'stock.landing-legs'
	]),
	stages: [[3, 4]]
});

export const ORBITER = (): VesselDesign => ({
	...stack('Lesson orbiter', [
		'stock.command-pod',
		'stock.reaction-wheel',
		'stock.tank-medium',
		'stock.engine-lv'
	]),
	stages: [[3]]
});

/** A port on the nose, monopropellant with four RCS blocks, and a small engine for the rendezvous. */
export const CHASER = (): VesselDesign => ({
	formatVersion: 3,
	name: 'Lesson chaser',
	parts: [
		part(0, 'stock.command-pod', null),
		part(1, 'stock.docking-port', 0, 'bottom', 'top'),
		part(2, 'stock.reaction-wheel', 0),
		part(3, 'stock.monoprop-tank', 2),
		part(4, 'stock.tank-small', 3),
		part(5, 'stock.engine-lv', 4),
		...radialRcs(6, 3)
	],
	stages: [[5]]
});

export const TARGET_PROBE = (): VesselDesign => ({
	formatVersion: 3,
	name: 'Lesson target',
	parts: [
		part(0, 'stock.probe-core', null),
		part(1, 'stock.docking-port', 0, 'bottom', 'top'),
		part(2, 'stock.reaction-wheel', 0)
	],
	stages: []
});

/** Radius of the stock home planet, m: the docking lesson's 2 km lead in mean anomaly. */
const HOME_RADIUS = 600_000;
const PARKING = 100_000;
/** The docking target leads by this much along the orbit, m. */
export const TARGET_LEAD = 2_000;
/** The maneuver-node lesson's target orbit, m. */
export const RAISED_ORBIT = 250_000;

const CLOSED_PLACES: Lesson['blocked']['places'] = {
	vab: 'The Hangar is closed during a lesson: fly the vessel the lesson gives you.',
	launch: 'Launching is closed during a lesson: leave it to fly your own rockets.',
	rnd: 'Research is closed during a lesson.',
	administration: 'Administration is closed during a lesson.',
	astronauts: 'The Astronaut Complex is closed during a lesson.',
	mods: 'Mods cannot change during a lesson.',
	'test-stand': 'The Test Stand is closed during a lesson.'
};

export const LESSONS: readonly Lesson[] = [
	{
		id: 'landing',
		title: 'Landing',
		summary:
			'From a 30 km arc over Cinder: point retrograde, burn late, and touch down under 3 m/s.',
		design: LANDER,
		setup: [
			{
				fn: 'setLocation',
				args: [
					{
						kind: 'air',
						body: 'stock.cinder' as never,
						latitude: 0,
						longitude: 0,
						altitude: 30_000,
						speed: 250,
						heading: Math.PI / 2,
						climb: -0.2
					}
				]
			}
		],
		blocked: {
			actions: {
				map: 'This lesson is about the ground: the map stays closed. Watch the radar altitude instead.',
				warpUp: 'No time warp while landing: every second counts.'
			},
			places: CLOSED_PLACES
		},
		steps: [
			{
				id: 'retrograde',
				title: 'Point retrograde',
				text: 'You are falling towards Cinder. Press {key:sasRetrograde}: SAS turns the engine to face the way you are moving, so a burn slows you down.',
				touchText:
					'You are falling towards Cinder. Tap the retrograde button beside the navball: SAS turns the engine to face the way you are moving.',
				actions: ['sasRetrograde'],
				done: (o) => o.sasMode === 'retrograde'
			},
			{
				id: 'brake',
				title: 'Brake',
				text: 'Press {key:throttleFull} and burn. Cinder has no air, so only the engine slows you. Watch the speed fall.',
				touchText: 'Tap Full and burn. Cinder has no air, so only the engine slows you.',
				actions: ['throttleFull'],
				done: (o) => o.throttle > 0.5
			},
			{
				id: 'slow',
				title: 'Slow before the ground',
				text: 'Get below 50 m/s before 5 km. Ease off with {key:throttleDown} as the speed drops, and press {key:gear} to lower the legs.',
				touchText:
					'Get below 50 m/s before 5 km. Ease the throttle down as the speed drops, and lower the legs.',
				actions: ['gear'],
				done: (o) => o.surfaceSpeed < 50 && o.altitude < 5_000
			},
			{
				id: 'touchdown',
				title: 'Touch down',
				text: 'Hold a gentle descent and touch down under 3 m/s. Cut the throttle with {key:throttleCut} once you stand.',
				touchText: 'Hold a gentle descent and touch down under 3 m/s. Tap Cut once you stand.',
				actions: ['throttleCut'],
				done: (o) => o.landed
			}
		],
		goal: (o) => o.landed && o.body === 'stock.cinder' && o.surfaceSpeed < 3,
		debrief:
			'You landed. The burn that ends just as you touch the ground is called a suicide burn: it wastes the least fuel, and leaves the least room for error.',
		hint: 'In your world, fly to Cinder with a lander that has legs and a few hundred m/s to spare.'
	},
	{
		id: 'nodes',
		title: 'Maneuver nodes',
		summary:
			'From a 100 km orbit: plan a burn with a node, type its Δv, raise the apoapsis and circularise at 250 km.',
		design: ORBITER,
		setup: [
			{ fn: 'setOrbit', args: [{ body: 'stock.home', apoapsis: PARKING, periapsis: PARKING }] }
		],
		blocked: {
			actions: { stage: 'This vessel has one stage: there is nothing to drop in this lesson.' },
			places: CLOSED_PLACES
		},
		steps: [
			{
				id: 'map',
				title: 'Open the map',
				text: 'Press {key:map}. Your orbit is the line around Home, with its Ap and Pe markers.',
				touchText: 'Tap Map. Your orbit is the line around Home, with its Ap and Pe markers.',
				actions: ['map'],
				done: (o) => o.map
			},
			{
				id: 'node',
				title: 'Add a node',
				text: 'Click your orbit line ahead of the vessel and choose Add node. A node is a burn you plan before you fly it.',
				done: (o) => o.nodes >= 1
			},
			{
				id: 'dv',
				title: 'Type the Δv',
				text: 'In the node panel, type a prograde Δv of about 85 m/s. The dashed line shows the orbit after the burn: its Ap rises to about 250 km.',
				done: (o) => o.nodePrograde >= 50
			},
			{
				id: 'burn',
				title: 'Fly the node',
				text: 'Press {key:sasManeuver} to point at the node, warp up to it with {key:warpUp}, and burn when the countdown reaches half the burn time, until the node has no Δv left.',
				actions: ['sasManeuver', 'warpUp'],
				done: (o) => (o.apoapsis ?? 0) >= RAISED_ORBIT - 10_000
			},
			{
				id: 'circularise',
				title: 'Circularise',
				text: 'At the new Ap, add a second node and type the prograde Δv that lifts Pe to the same height. Fly it the same way.',
				done: (o) => (o.periapsis ?? -Infinity) >= RAISED_ORBIT - 10_000
			}
		],
		goal: (o) =>
			(o.periapsis ?? -Infinity) >= RAISED_ORBIT - 10_000 &&
			(o.apoapsis ?? Infinity) <= RAISED_ORBIT + 60_000,
		debrief:
			'Two burns half an orbit apart move you from one circle to another: a Hohmann transfer. A node lets you see the result before you spend the fuel.',
		hint: 'In your world, plan every orbit change with a node first, and trust the burn timer.'
	},
	{
		id: 'docking',
		title: 'Rendezvous and docking',
		summary:
			'A target probe 2 km ahead: find the closest approach, match velocity, then dock on RCS.',
		design: CHASER,
		setup: [
			{ fn: 'setOrbit', args: [{ body: 'stock.home', apoapsis: PARKING, periapsis: PARKING }] },
			{
				fn: 'setOrbit',
				args: [
					{
						body: 'stock.home',
						apoapsis: PARKING,
						periapsis: PARKING,
						m0: TARGET_LEAD / (HOME_RADIUS + PARKING)
					},
					{ design: TARGET_PROBE() }
				]
			}
		],
		blocked: {
			actions: {
				warpUp: 'No time warp near another vessel in this lesson: approach in real time.'
			},
			places: CLOSED_PLACES
		},
		steps: [
			{
				id: 'target',
				title: 'Target the probe',
				text: 'Press {key:targetNext} until the target is Lesson target. The target card shows its distance and relative speed.',
				actions: ['targetNext'],
				done: (o) => o.target?.key.startsWith('vessel:') === true
			},
			{
				id: 'approach',
				title: 'Find the closest approach',
				text: 'Open the map with {key:map}. The closest approach markers show where your orbits come nearest; you want them within a few hundred metres.',
				actions: ['map'],
				done: (o) => o.map
			},
			{
				id: 'match',
				title: 'Match velocity',
				text: 'Point retrograde to the target with {key:sasAntiTarget} and burn gently until the relative speed is under 1 m/s.',
				actions: ['sasAntiTarget'],
				done: (o) => o.target !== null && o.target.relativeSpeed < 1
			},
			{
				id: 'rcs',
				title: 'Switch on RCS',
				text: 'Press {key:rcsToggle}. RCS thrusters push the vessel without turning it, for the last metres.',
				actions: ['rcsToggle'],
				done: (o) => o.rcs
			},
			{
				id: 'close',
				title: 'Close in',
				text: 'Point at the target with {key:sasTarget} and translate forward with {key:translateForward}. Keep the closing speed under 1 m/s until 50 m.',
				actions: ['sasTarget', 'translateForward'],
				done: (o) => o.target !== null && o.target.distance < 50
			},
			{
				id: 'dock',
				title: 'Dock',
				text: 'Line up the ports and drift in at 0.2 to 0.5 m/s. The ports capture on contact.',
				done: (o) => o.docked
			}
		],
		goal: (o) => o.docked,
		debrief:
			'Docked. Rendezvous is two orbits brought together; docking is the last few metres, slow and straight. Once you know how, the Guidance Computer can fly it: its Rendezvous panel brings you from anywhere in orbit to 150 m of the target, and Auto Dock does the last metres.',
		hint: 'In your world, launch a target first, then a second vessel with a docking port and RCS. Target it, stage, and press Engage in the Rendezvous panel; with "Dock when close" on and a port targeted, it hands over to Auto Dock.'
	},
	{
		id: 'transfer',
		title: 'Transfer to Cinder',
		summary:
			'From a parking orbit: wait for the window, place a node at it, warp, burn, and change sphere of influence.',
		design: ORBITER,
		setup: [
			{ fn: 'setOrbit', args: [{ body: 'stock.home', apoapsis: PARKING, periapsis: PARKING }] }
		],
		blocked: {
			actions: { stage: 'This vessel has one stage: there is nothing to drop in this lesson.' },
			places: CLOSED_PLACES
		},
		steps: [
			{
				id: 'map',
				title: 'Open the map',
				text: 'Press {key:map} and find Cinder, the moon, on its own orbit around Home.',
				touchText: 'Tap Map and find Cinder, the moon, on its own orbit around Home.',
				actions: ['map'],
				done: (o) => o.map
			},
			{
				id: 'target',
				title: 'Target Cinder',
				text: 'Press {key:targetNext} until Cinder is the target. Upcoming in the Mission Center shows the next transfer window.',
				actions: ['targetNext'],
				done: (o) => o.target?.key === 'body:stock.cinder'
			},
			{
				id: 'node',
				title: 'Place the node at the window',
				text: 'Add a node where the window is and type about 860 m/s prograde. Move it along your orbit until the dashed line meets Cinder.',
				done: (o) => o.nodes >= 1 && o.nodePrograde >= 500
			},
			{
				id: 'warp',
				title: 'Warp to the node',
				text: 'Press {key:warpUp} to speed up time. Warp stops before the node.',
				actions: ['warpUp'],
				done: (o) => o.warp > 1
			},
			{
				id: 'burn',
				title: 'Burn',
				text: 'Point at the node with {key:sasManeuver} and burn until the node has no Δv left.',
				actions: ['sasManeuver'],
				done: (o) => o.nodeLeft !== null && o.nodeLeft < 20
			},
			{
				id: 'soi',
				title: "Enter Cinder's sphere",
				text: 'Warp ahead. When the vessel enters Cinder’s sphere of influence, the orbit is drawn around Cinder.',
				done: (o) => o.body === 'stock.cinder'
			}
		],
		goal: (o) => o.body === 'stock.cinder',
		debrief:
			'You left Home’s sphere for Cinder’s. Every transfer is the same idea: burn at the window so your new orbit meets the destination.',
		hint: 'In your world, plan the transfer burn with a node at the window shown in Upcoming.'
	}
];

export const lessonOf = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

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
	if (lesson.goal(o)) return { status: 'done', step: lesson.steps.length };
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

/** Runs the lesson's setup calls in order; the first refusal stops it with its reason. */
export async function runLessonSetup(
	lesson: Lesson,
	api: DebugApi
): Promise<{ ok: true } | { ok: false; reason: string }> {
	for (const call of lesson.setup) {
		const fn = api[call.fn] as (...args: unknown[]) => unknown;
		const result = (await fn.apply(api, call.args as unknown[])) as
			{ ok: boolean; reason?: string } | undefined;
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
