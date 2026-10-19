/** Lessons after the first orbit (plan 229): the step machine, the setups, the permission filter. */
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { createDebugApi, type DebugApi, type DebugHost } from '../debug/api';
import LessonCard from '../hud/LessonCard.svelte';
import { createKeymap } from '../keybindings';
import { lessonKeymap } from './lesson-gate.svelte';
import {
	LESSONS,
	NEW_LESSON,
	RAISED_ORBIT,
	TARGET_LEAD,
	advanceLesson,
	blockedPlace,
	lessonOf,
	lessonStep,
	observeLesson,
	restartLesson,
	runLessonSetup,
	type Lesson,
	type LessonObservation
} from './lessons';
import type { LessonProgress } from '../settings/settings';

/** A vessel in a 100 km Home orbit doing nothing: no lesson's step or goal holds. */
const idle: LessonObservation = {
	body: 'stock.home',
	throttle: 0,
	altitude: 100_000,
	surfaceSpeed: 2_000,
	landed: false,
	sasMode: 'off',
	rcs: false,
	map: false,
	warp: 1,
	apoapsis: 100_000,
	periapsis: 99_000,
	nodes: 0,
	nodePrograde: 0,
	nodeLeft: null,
	target: null,
	docked: false
};
const at = (o: Partial<LessonObservation>): LessonObservation => ({ ...idle, ...o });

/**
 * Per lesson, observations in order: each completes exactly the step at that index. Each is the
 * cumulative state a player has reached by then.
 */
const RUNS: Record<string, Partial<LessonObservation>[]> = {
	landing: [
		{ body: 'stock.cinder', altitude: 30_000, surfaceSpeed: 260, sasMode: 'retrograde' },
		{
			body: 'stock.cinder',
			altitude: 20_000,
			surfaceSpeed: 200,
			sasMode: 'retrograde',
			throttle: 1
		},
		{ body: 'stock.cinder', altitude: 4_000, surfaceSpeed: 40, sasMode: 'retrograde', throttle: 1 },
		{ body: 'stock.cinder', altitude: 3, surfaceSpeed: 5, landed: true }
	],
	nodes: [
		{ map: true },
		{ map: true, nodes: 1 },
		{ map: true, nodes: 1, nodePrograde: 85 },
		{ apoapsis: RAISED_ORBIT },
		{ apoapsis: RAISED_ORBIT + 70_000, periapsis: RAISED_ORBIT }
	],
	docking: [
		{ target: { key: 'vessel:3', distance: 2_000, relativeSpeed: 5 } },
		{ map: true, target: { key: 'vessel:3', distance: 1_500, relativeSpeed: 5 } },
		{ target: { key: 'vessel:3', distance: 900, relativeSpeed: 0.5 } },
		{ rcs: true, target: { key: 'vessel:3', distance: 800, relativeSpeed: 0.5 } },
		{ rcs: true, target: { key: 'vessel:3', distance: 30, relativeSpeed: 0.3 } },
		{ docked: true, target: null }
	],
	transfer: [
		{ map: true },
		{ map: true, target: { key: 'body:stock.cinder', distance: 1e7, relativeSpeed: 1e3 } },
		{ nodes: 1, nodePrograde: 860, nodeLeft: 860 },
		{ nodes: 1, nodePrograde: 860, nodeLeft: 860, warp: 50 },
		{ nodes: 1, nodePrograde: 860, nodeLeft: 5 },
		{ body: 'stock.cinder' }
	]
};

describe('lessons (plan 229)', () => {
	it('ships the four lessons, each with steps, a debrief and a hint', () => {
		expect(LESSONS.map((l) => l.id)).toEqual(['landing', 'nodes', 'docking', 'transfer']);
		for (const l of LESSONS) {
			expect(l.steps.length).toBeGreaterThanOrEqual(4);
			expect(new Set(l.steps.map((s) => s.id)).size).toBe(l.steps.length);
			expect(l.debrief).not.toBe('');
			expect(l.hint).not.toBe('');
			expect(lessonOf(l.id)).toBe(l);
		}
	});

	it.each(LESSONS.map((l) => [l.id, l] as const))(
		'%s: each step completes only on its own observation, in order, then the lesson is done',
		(id, lesson) => {
			const run = RUNS[id]!;
			expect(run).toHaveLength(lesson.steps.length);
			let p: LessonProgress = restartLesson();
			// nothing done yet: the first step stays
			expect(advanceLesson(lesson, p, idle)).toBe(p);
			run.forEach((o, i) => {
				expect(lessonStep(lesson, p)?.id).toBe(lesson.steps[i]!.id);
				// an observation before this step's condition holds changes nothing
				if (i > 0) expect(advanceLesson(lesson, p, at(run[i - 1]!))).toBe(p);
				p = advanceLesson(lesson, p, at(o));
				if (i < run.length - 1) expect(p).toEqual({ status: 'active', step: i + 1 });
			});
			expect(p).toEqual({ status: 'done', step: lesson.steps.length });
			expect(lessonStep(lesson, p)).toBeNull();
			// done is kept, whatever comes next; a restart starts over
			expect(advanceLesson(lesson, p, idle)).toBe(p);
			expect(restartLesson()).toEqual({ status: 'active', step: 0 });
		}
	);

	it('never skips a step: an observation that meets every step moves one at a time', () => {
		const nodes = lessonOf('nodes')!;
		// every step's condition but not the goal (Ap too high)
		const all = at({
			map: true,
			nodes: 1,
			nodePrograde: 85,
			apoapsis: 400_000,
			periapsis: RAISED_ORBIT
		});
		let p: LessonProgress = NEW_LESSON;
		for (let i = 1; i < nodes.steps.length; i++) {
			p = advanceLesson(nodes, p, all);
			expect(p).toEqual({ status: 'active', step: i });
		}
	});

	it('reaching the goal ends the lesson at once (the landing at rest from debug.setLocation)', () => {
		const landing = lessonOf('landing')!;
		const p = advanceLesson(
			landing,
			restartLesson(),
			at({ body: 'stock.cinder', landed: true, surfaceSpeed: 0, altitude: 2 })
		);
		expect(p).toEqual({ status: 'done', step: landing.steps.length });
		// landed on Home is not the lesson's goal
		expect(
			advanceLesson(landing, restartLesson(), at({ landed: true, surfaceSpeed: 0 })).status
		).toBe('active');
	});

	it('observes the flight: surface speed, landing, nodes, target and a joined port', () => {
		const vessel = {
			soi: 'stock.cinder' as never,
			position: { x: 210_000, y: 0, z: 0 },
			velocity: { x: 0, y: 0, z: 0 },
			ports: [
				{
					part: 1 as never,
					size: 1.25,
					free: false,
					position: { x: 0, y: 0, z: 0 },
					direction: { x: 0, y: 1, z: 0 }
				}
			]
		};
		const o = observeLesson({
			vessel: vessel as never,
			bodies: [{ id: 'stock.cinder' as never, rotationPeriod: 1e12 }],
			throttle: 0.5,
			altitude: 10_000,
			sasMode: 'retrograde',
			rcs: true,
			map: false,
			warp: 1,
			apoapsis: null,
			periapsis: null,
			nodes: [{ prograde: 120, dv: 30 }],
			target: null
		});
		expect(o).toMatchObject({
			body: 'stock.cinder',
			landed: false,
			nodes: 1,
			nodePrograde: 120,
			nodeLeft: 30,
			docked: true,
			rcs: true
		});
		expect(o.surfaceSpeed).toBeLessThan(1e-3);
		expect(
			observeLesson({
				vessel: { ...vessel, surface: true, ports: [] } as never,
				bodies: [],
				nodes: [],
				target: null,
				throttle: 0,
				altitude: 0,
				sasMode: 'off',
				rcs: false,
				map: false,
				warp: 1,
				apoapsis: null,
				periapsis: null
			})
		).toMatchObject({ landed: true, surfaceSpeed: 0, docked: false, nodeLeft: null });
	});
});

describe('lesson setups use only the debug API (plan 203)', () => {
	const host: DebugHost = {
		snapshot: () => null,
		vessel: () => null,
		send: async () => ({ ok: true }),
		onSnapshot: () => () => {},
		bodies: () => [],
		home: () => 'stock.home'
	};
	const api = createDebugApi(host);
	const DEBUG_FUNCTIONS = Object.keys(api).filter(
		(k) => typeof (api as unknown as Record<string, unknown>)[k] === 'function'
	);

	it.each(LESSONS.map((l) => [l.id, l] as const))(
		'%s calls only debug API functions',
		(_, lesson) => {
			expect(lesson.setup.length).toBeGreaterThan(0);
			for (const call of lesson.setup) expect(DEBUG_FUNCTIONS).toContain(call.fn);
		}
	);

	it('runs the calls in order and stops at the first refusal with its reason', async () => {
		const calls: string[] = [];
		const fake = new Proxy({} as DebugApi, {
			get:
				(_t, name) =>
				async (...args: unknown[]) => {
					calls.push(`${String(name)}:${JSON.stringify(args)}`);
					return calls.length === 2 ? { ok: false, reason: 'no vessel in focus' } : { ok: true };
				}
		});
		const docking = lessonOf('docking')!;
		const r = await runLessonSetup(docking, fake);
		expect(r).toEqual({ ok: false, reason: 'setOrbit: no vessel in focus' });
		expect(calls).toHaveLength(2);
		// the second call spawns the target ahead by the lead, with its own design
		expect(calls[1]).toContain('"design"');
		expect(calls[1]).toContain(String(TARGET_LEAD / 700_000));
		expect(await runLessonSetup(lessonOf('nodes')!, fake)).toEqual({ ok: true });
	});
});

describe('scene permissions', () => {
	const landing = lessonOf('landing')!;

	it('blocked actions resolve to nothing, held keys too, and report their reason', () => {
		const base = createKeymap({}, 'classic');
		const reasons: string[] = [];
		const keymap = lessonKeymap(base, landing, (r) => reasons.push(r));
		const mapKey = base.keys('map')[0]!;
		expect(base.actionFor('flight', mapKey)).toBe('map');
		expect(keymap.actionFor('flight', mapKey)).toBeNull();
		expect(reasons).toEqual([landing.blocked.actions.map]);
		expect(keymap.keys('warpUp')).toEqual([]);
		// everything else is untouched
		const stage = base.keys('stage')[0]!;
		expect(keymap.actionFor('flight', stage)).toBe('stage');
		expect(keymap.keys('throttleFull')).toEqual(base.keys('throttleFull'));
		expect(keymap.label('map')).toBe(base.label('map'));
	});

	it('closes the Hangar and the other buildings, never Flight or the Space Center', () => {
		for (const l of LESSONS as readonly Lesson[]) {
			expect(blockedPlace(l, '/vab')).toMatch(/Hangar is closed/);
			expect(blockedPlace(l, '/base/launch?x=1')).toMatch(/Launching is closed/);
			expect(blockedPlace(l, '/flight')).toBeNull();
			expect(blockedPlace(l, '/space-center')).toBeNull();
			expect(blockedPlace(l, '/mission-center')).toBeNull();
		}
	});
});

describe('the lesson card', () => {
	const nodes = lessonOf('nodes')!;
	const html = (progress: LessonProgress, notice: string | null = null) =>
		render(LessonCard, {
			props: {
				lesson: nodes,
				step: lessonStep(nodes, progress),
				progress,
				keymap: createKeymap({}, 'classic'),
				notice,
				onleave: () => {}
			}
		}).body;

	it('shows the step, its label and a blocked control’s reason', () => {
		const h = html({ status: 'active', step: 1 }, 'This vessel has one stage.');
		expect(h).toContain('Lesson · Maneuver nodes');
		expect(h).toContain('2 of 5');
		expect(h).toContain('data-testid="lesson-step-node"');
		expect(h).toContain('Add a node');
		expect(h).toMatch(/data-testid="lesson-notice"[^>]*>This vessel has one stage\./);
		expect(h).toContain('Leave the lesson');
	});

	it('shows the debrief and the hint once done', () => {
		const h = html({ status: 'done', step: nodes.steps.length });
		expect(h).toContain('data-testid="lesson-debrief"');
		expect(h).toContain(nodes.debrief);
		expect(h).toContain(nodes.hint);
		expect(h).toContain('Back to lessons');
	});
});
