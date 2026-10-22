/**
 * Lessons (plans 229, 344, ADR 0293): the step machines, the vessels against the stock catalogue
 * and the Hangar's checks, the setups, the step targets and keys, the permission filter, the card.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadPlugins, resolveVesselDesign, type VesselDesign } from '@orbital/core';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import { BUILTIN_PLUGINS } from '../builtins';
import { createDebugApi, type DebugApi, type DebugHost } from '../debug/api';
import type { ContentLookups } from '../delta-v';
import { HOST_PANELS } from '../dock/dock-model';
import { checkDesign } from '../editor/checks';
import { stabilityOf } from '../editor/stability';
import { designStats } from '../editor/stats';
import LessonCard from '../hud/LessonCard.svelte';
import { ACTIONS, createKeymap, type ActionId } from '../keybindings';
import type { LessonProgress } from '../settings/settings';
import { lessonKeymap } from './lesson-gate.svelte';
import { FOCUS, RAISED_ORBIT, TARGET_LEAD } from './lesson-kit';
import {
	LESSONS,
	LEVELS,
	NEW_LESSON,
	QUIET,
	advanceLesson,
	blockedPlace,
	lessonOf,
	lessonStart,
	lessonStep,
	lessonsOfLevel,
	observeLesson,
	observePlace,
	restartLesson,
	runLessonSetup,
	setupOf,
	type Lesson,
	type LessonObservation,
	type VabLessonState
} from './lessons';
import { stepText } from './tutorial';

const { registries } = loadPlugins([...BUILTIN_PLUGINS]);
const content: ContentLookups = {
	parts: registries.parts,
	modules: registries.modules,
	resources: registries.resources
};
const home = registries.bodies.get('stock.home')!;
const g = (6.6743e-11 * home.mass) / (home.radius * home.radius);

/** Nothing going on: no lesson's first step or goal holds. */
const idle: LessonObservation = { ...QUIET, body: 'stock.home' };
const at = (o: Partial<LessonObservation>): LessonObservation => ({ ...idle, ...o });
const V: VabLessonState = {
	parts: 0,
	command: false,
	engine: false,
	tank: false,
	fins: 0,
	parachute: false,
	symmetry: false,
	checksClear: false,
	library: false
};
const vab = (v: Partial<VabLessonState>): Partial<LessonObservation> => ({
	place: 'vab',
	vab: { ...V, ...v }
});
const station = (distance: number, relativeSpeed: number) => ({
	target: { key: 'vessel:3', distance, relativeSpeed }
});

/**
 * Per lesson, observations in order: each completes exactly the step at that index. Each is the
 * cumulative state a player has reached by then.
 */
const RUNS: Record<string, Partial<LessonObservation>[]> = {
	'first-launch': [
		{ throttle: 1 },
		{ throttle: 1, stagesFired: 1 },
		{ throttle: 1, stagesFired: 1, sasMode: 'hold', altitude: 2_000, apoapsis: 4_000 },
		{ stagesFired: 1, sasMode: 'hold', altitude: 9_000, apoapsis: 20_000 },
		{ stagesFired: 2, altitude: 20_000, apoapsis: 20_000 },
		{ stagesFired: 3, altitude: 3_000, parachute: true },
		{ stagesFired: 3, landed: true, parachute: true }
	],
	hangar: [
		vab({ library: true }),
		vab({ command: true, parts: 1 }),
		vab({ command: true, tank: true, engine: true, parts: 3 }),
		vab({ command: true, tank: true, engine: true, parts: 7, fins: 4, symmetry: true }),
		vab({ command: true, tank: true, engine: true, parts: 8, fins: 4, symmetry: true, parachute: true }),
		vab({
			command: true,
			tank: true,
			engine: true,
			parts: 8,
			fins: 4,
			symmetry: true,
			parachute: true,
			checksClear: true
		})
	],
	orbit: [
		{ stagesFired: 1, throttle: 1, sasMode: 'hold', altitude: 100 },
		{ stagesFired: 1, throttle: 1, sasMode: 'prograde', altitude: 3_000 },
		{ stagesFired: 2, throttle: 1, sasMode: 'prograde', altitude: 30_000, apoapsis: 40_000, periapsis: -500_000 },
		{ stagesFired: 2, apoapsis: 80_000, periapsis: -200_000 },
		{ stagesFired: 2, apoapsis: 82_000, periapsis: 71_000 }
	],
	nodes: [
		{ map: true },
		{ map: true, nodes: 1 },
		{ map: true, nodes: 1, nodePrograde: 85 },
		{ apoapsis: RAISED_ORBIT, periapsis: 100_000 },
		{ apoapsis: RAISED_ORBIT + 70_000, periapsis: RAISED_ORBIT }
	],
	reentry: [
		{ sasMode: 'retrograde', stagesFired: 1, altitude: 100_000, apoapsis: 100_000, periapsis: 100_000 },
		{ sasMode: 'retrograde', stagesFired: 1, altitude: 100_000, apoapsis: 100_000, periapsis: 25_000 },
		{ sasMode: 'retrograde', stagesFired: 2, altitude: 90_000, apoapsis: 100_000, periapsis: 25_000 },
		{ sasMode: 'retrograde', stagesFired: 2, altitude: 40_000 },
		{ stagesFired: 3, altitude: 3_000, parachute: true },
		{ stagesFired: 3, splashed: true, parachute: true }
	],
	'space-center': [
		{ place: 'administration' },
		{ place: 'rnd' },
		{ place: 'astronauts' },
		{ place: 'mission-center' },
		{ place: 'vab' }
	],
	'ascent-guidance': [
		{ panels: ['guidance.panel'] },
		{ panels: ['guidance.panel'], openPanel: 'guidance.panel' },
		{ panels: ['guidance.panel'], openPanel: 'guidance.panel', autopilot: 'guidance.ascent' },
		{ apoapsis: 80_000, periapsis: 76_000 }
	],
	transfer: [
		{ map: true },
		{ map: true, target: { key: 'body:stock.cinder', distance: 1e7, relativeSpeed: 1e3 } },
		{ nodes: 1, nodePrograde: 860, nodeLeft: 860 },
		{ nodes: 1, nodePrograde: 860, nodeLeft: 860, warp: 50 },
		{ nodes: 1, nodePrograde: 860, nodeLeft: 5 },
		{ body: 'stock.cinder' }
	],
	landing: [
		{ body: 'stock.cinder', altitude: 30_000, surfaceSpeed: 260, sasMode: 'retrograde' },
		{ body: 'stock.cinder', altitude: 20_000, surfaceSpeed: 200, sasMode: 'retrograde', throttle: 1 },
		{ body: 'stock.cinder', altitude: 4_000, surfaceSpeed: 40, sasMode: 'retrograde', throttle: 1 },
		{ body: 'stock.cinder', altitude: 3, surfaceSpeed: 5, landed: true }
	],
	'eva-flag': [
		{ body: 'stock.cinder', landed: true, openPanel: 'host.crew' },
		{ body: 'stock.cinder', eva: true },
		{ body: 'stock.cinder', eva: true, walking: true },
		{ body: 'stock.cinder', eva: true, flags: 1 },
		{ body: 'stock.cinder', landed: true, flags: 1 }
	],
	science: [
		{ panels: ['stock.science'] },
		{ panels: ['stock.science'], scienceStored: 1 },
		{ panels: ['stock.science'], scienceCredited: 4 }
	],
	comms: [
		{ openPanel: 'host.comms' },
		{ openPanel: 'host.comms', linkHops: 1 },
		{ openPanel: 'host.comms', linkHops: 1, warp: 10 },
		{ openPanel: 'host.comms', linkHops: 2, warp: 10 }
	],
	rendezvous: [
		station(20_000, 0.1),
		{ map: true, ...station(20_000, 0.1) },
		{ panels: ['guidance.panel'], ...station(20_000, 0.1) },
		{ panels: ['guidance.panel'], autopilot: 'guidance.rendezvous', ...station(15_000, 50) },
		{ panels: ['guidance.panel'], ...station(150, 0.3) }
	],
	docking: [
		{ targetPort: true, ...station(TARGET_LEAD, 0.1) },
		{ targetPort: true, rcs: true, ...station(TARGET_LEAD, 0.1) },
		{ targetPort: true, rcs: true, sasMode: 'target', ...station(TARGET_LEAD, 0.1) },
		{ targetPort: true, rcs: true, sasMode: 'target', ...station(15, 0.4) },
		{ docked: true }
	],
	autodock: [
		{ panels: ['autodock.panel'] },
		{ panels: ['autodock.panel'], targetPort: true },
		{ panels: ['autodock.panel'], targetPort: true, autopilot: 'autodock.dock' },
		{ docked: true }
	],
	rover: [
		{ landed: true, drive: true },
		{ landed: true, drive: true, surfaceSpeed: 6 },
		{ landed: true, drive: true, surfaceSpeed: 0.2 }
	],
	robotics: [
		{ landed: true, openPanel: 'host.parts' },
		{ landed: true, joint: 45, jointsMoved: 1 },
		{ landed: true, joint: 45, jointsMoved: 2 }
	],
	'mission-center': [
		{ place: 'mission-center', vessels: 2, debris: 1 },
		{ place: 'mission-center', vessels: 1, debris: 0 },
		{ place: 'flight', vessels: 1, debris: 0 }
	]
};

describe('lessons (plans 229, 344)', () => {
	it('ships the lessons by level, keeping the plan 229 ids, each with steps, a debrief and a hint', () => {
		const ids = LESSONS.map((l) => l.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toEqual(expect.arrayContaining(['landing', 'nodes', 'docking', 'transfer']));
		expect(LESSONS.length).toBeGreaterThanOrEqual(15);
		// by level, in the page's order
		expect(LEVELS.map((l) => l.id)).toEqual(['basics', 'flight', 'advanced']);
		expect(LEVELS.flatMap((l) => lessonsOfLevel(l.id))).toEqual(LESSONS);
		for (const level of LEVELS) expect(lessonsOfLevel(level.id).length).toBeGreaterThanOrEqual(4);
		expect(LESSONS[0]!.id).toBe('first-launch');
		for (const l of LESSONS) {
			expect(l.steps.length, l.id).toBeGreaterThanOrEqual(3);
			expect(new Set(l.steps.map((s) => s.id)).size, l.id).toBe(l.steps.length);
			expect(l.debrief, l.id).not.toBe('');
			expect(l.hint, l.id).not.toBe('');
			expect(lessonOf(l.id)).toBe(l);
			// a Flight lesson flies a vessel; the others open a page with none
			expect(lessonStart(l) === 'flight', l.id).toBe(l.design !== undefined);
		}
	});

	it.each(LESSONS.map((l) => [l.id, l] as const))(
		'%s: each step completes only on its own observation, in order, then the lesson is done',
		(id, lesson) => {
			const run = RUNS[id]!;
			expect(run, id).toHaveLength(lesson.steps.length);
			let p: LessonProgress = restartLesson();
			// nothing done yet: the first step stays
			expect(advanceLesson(lesson, p, idle)).toBe(p);
			run.forEach((o, i) => {
				expect(lessonStep(lesson, p)?.id).toBe(lesson.steps[i]!.id);
				// an observation before this step's condition holds changes nothing
				if (i > 0) expect(advanceLesson(lesson, p, at(run[i - 1]!)), `${id} ${i}`).toBe(p);
				p = advanceLesson(lesson, p, at(o));
				if (i < run.length - 1) expect(p, `${id} ${i}`).toEqual({ status: 'active', step: i + 1 });
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

	it('a lesson without a goal is not done by standing on the pad', () => {
		const first = lessonOf('first-launch')!;
		expect(first.goal).toBeUndefined();
		const pad = at({ landed: true, altitude: 0 });
		expect(advanceLesson(first, restartLesson(), pad)).toEqual({ status: 'active', step: 0 });
	});

	it('observes the flight: surface speed, landing, nodes, target, port, parachute, joints, the world', () => {
		const vessel = {
			id: 7 as never,
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
			],
			parts: [
				{ modules: { 'stock.parachute': { status: 'full' } } },
				{ modules: { 'stock.robotic': { value: 45 } } },
				{ modules: { 'stock.robotic': { value: -25 } } },
				{ modules: { 'stock.robotic': { value: 5 } } }
			],
			target: { kind: 'vessel', id: 3, part: 9 },
			autopilot: { id: 'autodock.dock' },
			autopilotLast: { id: 'guidance.rendezvous', outcome: 'done' },
			science: { situation: null, region: '', experiments: [], stored: [{}, {}] }
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
			target: null,
			stagesFired: 2,
			panels: ['guidance.panel'],
			openPanel: 'host.crew',
			eva: { walking: true },
			drive: true,
			snapshot: {
				vessels: [
					{ id: 7, type: 'ship' },
					{ id: 8, type: 'debris' },
					{ id: 9, type: 'flag' }
				] as never,
				science: [{ id: 's', count: 1, produced: 5, credited: 3, cap: 10 }],
				network: {
					stations: [],
					vessels: [{ vessel: 7, to: 'ks', route: ['relay', 'ks'] }]
				} as never
			}
		});
		expect(o).toMatchObject({
			place: 'flight',
			body: 'stock.cinder',
			landed: false,
			nodes: 1,
			nodePrograde: 120,
			nodeLeft: 30,
			docked: true,
			rcs: true,
			stagesFired: 2,
			parachute: true,
			joint: 45,
			jointsMoved: 2,
			targetPort: true,
			autopilot: 'autodock.dock',
			autopilotLast: { id: 'guidance.rendezvous', outcome: 'done' },
			panels: ['guidance.panel'],
			openPanel: 'host.crew',
			eva: true,
			walking: true,
			drive: true,
			scienceStored: 2,
			scienceCredited: 3,
			vessels: 2,
			debris: 1,
			flags: 1,
			linkHops: 2
		});
		expect(o.surfaceSpeed).toBeLessThan(1e-3);
		expect(
			observeLesson({
				vessel: { ...vessel, surface: true, ports: [], parts: [], target: undefined } as never,
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
		).toMatchObject({
			landed: true,
			surfaceSpeed: 0,
			docked: false,
			nodeLeft: null,
			parachute: false,
			targetPort: false,
			eva: false,
			linkHops: 0
		});
	});

	it('observes a page: its name, the world counts and the Hangar', () => {
		const o = observePlace('vab', { vessels: [{ type: 'debris' }] as never }, { ...V, parts: 2 });
		expect(o).toMatchObject({ place: 'vab', debris: 1, vessels: 1, vab: { parts: 2 } });
		expect(observePlace('space-center', null)).toMatchObject({ place: 'space-center', vab: null });
	});
});

/** The lessons that fly from the pad (no placement in their setup). */
const fromPad = (l: Lesson): boolean =>
	!setupOf(l, content).some((c) => c.fn === 'setOrbit' || c.fn === 'setLocation');

/** Δv each lesson's vessel needs with a margin, m/s: the ascent counts the first stage at sea level. */
const NEEDS: Record<string, number> = {
	'first-launch': 1_000,
	orbit: 3_400 * 1.15,
	'ascent-guidance': 3_400 * 1.15,
	nodes: 400,
	reentry: 200,
	transfer: 1_300,
	landing: 700,
	comms: 0,
	rendezvous: 500,
	docking: 100,
	autodock: 100,
	'mission-center': 100
};

/** Check ids a lesson's vessel may raise, and why. */
const ALLOWED: Record<string, string[]> = {
	// a vacuum engine has a sea-level thrust-to-weight below 1: these never lift off from Home
	space: ['low-twr', 'marginal-twr'],
	// a rover drives and an arm stands: no engine, no stages
	ground: ['no-engine', 'no-stages', 'low-twr', 'marginal-twr', 'empty-stage']
};

describe('lesson vessels (plan 344, ADR 0293 point 6)', () => {
	const flying = LESSONS.filter((l) => l.design);

	it.each(flying.map((l) => [l.id, l] as const))(
		'%s: resolves, passes the pre-flight checks and carries enough delta-v',
		(id, lesson) => {
			const design = lesson.design!(content);
			const resolved = resolveVesselDesign(design, content.parts);
			expect(resolved.ok, JSON.stringify(resolved.ok ? '' : resolved.errors)).toBe(true);
			const sl = designStats(design, content, 'sea-level', g);
			const vac = designStats(design, content, 'vacuum', g);
			const pad = fromPad(lesson);
			const engines = design.stages.length > 0;
			const allowed = !engines ? ALLOWED.ground! : pad ? [] : ALLOWED.space!;
			const checks = checkDesign({ design, loose: [] }, content, sl, stabilityOf(design, content));
			const blocking = checks.filter(
				(c) => (c.severity === 'error' || c.level === 'no-go') && !allowed.includes(c.id)
			);
			expect(
				blocking.map((c) => `${c.id}: ${c.text}`),
				id
			).toEqual([]);
			// no part on a node of another size
			expect(checks.find((c) => c.id === 'size-mismatch'), id).toBeUndefined();
			if (pad && engines) expect(sl.liftoffTwr ?? 0, id).toBeGreaterThan(1.2);
			const dv = pad
				? (sl.rows[0]?.dv ?? 0) + vac.rows.slice(1).reduce((s, r) => s + r.dv, 0)
				: vac.totalDv;
			if (NEEDS[id] !== undefined) expect(dv, id).toBeGreaterThanOrEqual(NEEDS[id]!);
		}
	);

	it('crewed vessels that come home carry a parachute and a heat shield; docking ones RCS and monopropellant', () => {
		const has = (d: VesselDesign, part: string) => d.parts.some((p) => String(p.part).includes(part));
		for (const id of ['first-launch', 'orbit', 'ascent-guidance', 'nodes', 'reentry', 'transfer', 'docking', 'rendezvous', 'autodock']) {
			const d = lessonOf(id)!.design!(content);
			expect(has(d, 'parachute'), id).toBe(true);
			expect(has(d, 'heat-shield'), id).toBe(true);
			expect(has(d, 'decoupler'), id).toBe(true);
		}
		for (const id of ['docking', 'rendezvous', 'autodock']) {
			const d = lessonOf(id)!.design!(content);
			expect(has(d, 'rcs'), id).toBe(true);
			expect(has(d, 'monoprop'), id).toBe(true);
			expect(has(d, 'docking-port'), id).toBe(true);
		}
	});

	it('setups place designs that resolve and pass their checks (targets need no engine)', () => {
		for (const l of LESSONS) {
			for (const call of setupOf(l, content)) {
				if (call.fn !== 'setOrbit') continue;
				const design = call.args[1]?.design;
				if (!design) continue;
				const resolved = resolveVesselDesign(design, content.parts);
				expect(resolved.ok, l.id).toBe(true);
				const sl = designStats(design, content, 'sea-level', g);
				const checks = checkDesign({ design, loose: [] }, content, sl, stabilityOf(design, content));
				expect(checks.find((c) => c.id === 'size-mismatch'), l.id).toBeUndefined();
			}
		}
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
		'%s calls only debug API functions; only Flight lessons have a setup',
		(_, lesson) => {
			const setup = setupOf(lesson, content);
			expect(Array.isArray(setup)).toBe(true);
			if (lessonStart(lesson) !== 'flight') expect(setup).toHaveLength(0);
			for (const call of setup) expect(DEBUG_FUNCTIONS).toContain(call.fn);
		}
	);

	it('runs the calls in order, puts the vessel in focus for FOCUS, and stops at the first refusal', async () => {
		const calls: string[] = [];
		const fake = new Proxy({} as DebugApi, {
			get: (_t, name) =>
				name === 'vessel'
					? () => ({ id: 42 })
					: async (...args: unknown[]) => {
							calls.push(`${String(name)}:${JSON.stringify(args)}`);
							return calls.length === 3 ? { ok: false, reason: 'no vessel in focus' } : { ok: true };
						}
		});
		const docking = lessonOf('docking')!;
		const r = await runLessonSetup(docking, fake, content);
		expect(r).toEqual({ ok: false, reason: 'setOrbit: no vessel in focus' });
		expect(calls).toHaveLength(3);
		// the engine is lit on the vessel in focus, then the target spawns ahead by the lead
		expect(calls[1]).toBe('send:[{"type":"stage","vessel":42}]');
		expect(calls[1]).not.toContain(String(FOCUS));
		expect(calls[2]).toContain('"design"');
		expect(calls[2]).toContain(String(TARGET_LEAD / 700_000));
		calls.length = 0;
		expect(await runLessonSetup(lessonOf('nodes')!, fake, content)).toEqual({ ok: true });
	});
});

/** Every `.svelte` file under `dir`, read. */
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

describe('step targets exist (ADR 0293 point 5)', () => {
	const ui = svelteSources(join(__dirname, '..', '..'));
	const protocol = readFileSync(
		join(__dirname, '..', '..', '..', '..', '..', 'packages', 'core', 'src', 'protocol.ts'),
		'utf8'
	);
	const panels = new Set<string>([...HOST_PANELS, ...registries.panels.list().map((p) => p.id)]);
	const ids = new Set<string>(ACTIONS.map((a) => a.id));
	const keymaps = [createKeymap({}, 'classic'), createKeymap({}, 'ksp')];

	it.each(LESSONS.map((l) => [l.id, l] as const))(
		'%s: its test ids, panels, commands and keys exist',
		(_, lesson) => {
			for (const step of lesson.steps) {
				const where = `${lesson.id}/${step.id}`;
				for (const testid of step.targets?.testids ?? []) {
					const id = testid.replace(/\*$/, '');
					const found = testid.endsWith('*')
						? new RegExp(`testid=["{\`'(]*${id}[{$]`).test(ui)
						: new RegExp(`testid=["{\`']*${id}["\`'}]`).test(ui);
					expect(found, `${where}: test id ${testid}`).toBe(true);
				}
				for (const panel of step.targets?.panels ?? [])
					expect(panels.has(panel), `${where}: panel ${panel}`).toBe(true);
				for (const command of step.targets?.commands ?? [])
					expect(protocol.includes(`type: '${command}'`), `${where}: command ${command}`).toBe(true);
				for (const action of step.actions ?? [])
					expect(ids.has(action), `${where}: action ${action}`).toBe(true);
				for (const text of [step.text, step.touchText ?? '']) {
					for (const m of text.matchAll(/\{key:([A-Za-z0-9]+)\}/g))
						expect(ids.has(m[1]!), `${where}: {key:${m[1]}}`).toBe(true);
					// every key is bound in both profiles
					for (const keymap of keymaps)
						expect(stepText(step, keymap), `${where} (${keymap.profile})`).not.toMatch(/\{key:/);
				}
			}
		}
	);

	it('a step that names a dock panel to add says where the Panel library is', () => {
		for (const l of LESSONS)
			for (const s of l.steps)
				if (s.id === 'panel' && s.targets?.testids?.includes('dock-library'))
					expect(s.text, `${l.id}`).toMatch(/Panel library/);
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

	it('closes launching always, the Hangar unless the lesson is there, never Flight', () => {
		for (const l of LESSONS as readonly Lesson[]) {
			expect(blockedPlace(l, '/base/launch?x=1'), l.id).toMatch(/Launching is closed/);
			expect(blockedPlace(l, '/flight'), l.id).toBeNull();
			const hangar = l.id === 'hangar' || l.id === 'space-center';
			expect(blockedPlace(l, '/vab') === null, l.id).toBe(hangar);
			// the lesson's own page is open
			expect(blockedPlace(l, `/${lessonStart(l)}`), l.id).toBeNull();
		}
		expect(blockedPlace(lessonOf('mission-center')!, '/mission-center')).toBeNull();
		expect(blockedPlace(lessonOf('space-center')!, '/administration')).toBeNull();
		expect(blockedPlace(lessonOf('nodes')!, '/administration')).toMatch(/closed/);
	});

	it('a lesson that blocks staging never asks for a stage key', () => {
		for (const l of LESSONS) {
			if (!l.blocked.actions.stage) continue;
			for (const s of l.steps) {
				expect(s.actions ?? [], `${l.id}/${s.id}`).not.toContain('stage' as ActionId);
				expect(s.text, `${l.id}/${s.id}`).not.toContain('{key:stage}');
			}
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
		const h = html({ status: 'active', step: 1 }, 'Staging now would drop the service module.');
		expect(h).toContain('Lesson · Maneuver nodes');
		expect(h).toContain('2 of 5');
		expect(h).toContain('data-testid="lesson-step-node"');
		expect(h).toContain('Add a node');
		expect(h).toMatch(/data-testid="lesson-notice"[^>]*>Staging now would drop the service module\./);
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
