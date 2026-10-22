/**
 * The throwaway world a lesson runs in (plan 229): a Sandbox world with a fixed seed, marked with
 * the lesson so the Worlds list never shows it, entered in place of the player's world and removed
 * when the lesson ends. The player's active world comes back on leaving. Sandbox allows the debug
 * API, which sets the lesson's scene (ADR 0200, 0213).
 */
import { resolve } from '$app/paths';
import { LEGACY_WORLD_ID, homeBodyOf } from '@orbital/core';
import type { WorldCatalog } from '../worlds/catalog';
import { createWorldInfo } from '../worlds/world-model';
import { activeWorldId, setActiveWorld, type Worlds } from '../worlds/worlds';
import { lessonStart, type Lesson } from './lessons';

/** `localStorage` key of the player's Hangar draft (`storage.ts`), kept aside during a Hangar lesson. */
const DRAFT_KEY = 'orbital.design';

/** `localStorage` key of the running lesson. */
export const LESSON_KEY = 'orbital.lesson';
/** Every lesson world has this seed, so a lesson looks the same each time. */
export const LESSON_SEED = 229;

export interface LessonSession {
	lesson: string;
	world: string;
	/** The world that was active before the lesson; it comes back on leaving. */
	previous: string;
	/** The scene was set (the setup ran once). */
	ready: boolean;
	/** The player's Hangar draft, put back when the lesson ends (a Hangar lesson starts empty). */
	draft?: string | null;
}

export function lessonSession(): LessonSession | null {
	try {
		const raw = localStorage.getItem(LESSON_KEY);
		if (raw === null) return null;
		const s = JSON.parse(raw) as Partial<LessonSession>;
		return typeof s.lesson === 'string' &&
			typeof s.world === 'string' &&
			typeof s.previous === 'string'
			? {
					lesson: s.lesson,
					world: s.world,
					previous: s.previous,
					ready: s.ready === true,
					...(s.draft !== undefined ? { draft: s.draft } : {})
				}
			: null;
	} catch {
		return null;
	}
}

/** Puts `next` in the draft's place (null removes it) and returns what was there. */
function swapDraft(next: string | null): string | null {
	try {
		const was = localStorage.getItem(DRAFT_KEY);
		if (next === null) localStorage.removeItem(DRAFT_KEY);
		else localStorage.setItem(DRAFT_KEY, next);
		return was;
	} catch {
		return null;
	}
}

function saveSession(s: LessonSession | null): void {
	try {
		if (s === null) localStorage.removeItem(LESSON_KEY);
		else localStorage.setItem(LESSON_KEY, JSON.stringify(s));
	} catch {
		// private mode: the lesson lasts for this page only
	}
}

/** The lesson running in the active world, or null outside a lesson. */
export function activeLesson(): LessonSession | null {
	const s = lessonSession();
	return s && s.world === activeWorldId() ? s : null;
}

export function markLessonReady(): void {
	const s = lessonSession();
	if (s) saveSession({ ...s, ready: true });
}

/** Removes every lesson world but `keep` (a lesson that ended without Leave leaves one behind). */
export async function sweepLessonWorlds(worlds: Worlds, keep?: string): Promise<void> {
	for (const r of await worlds.lessonWorlds()) if (r.id !== keep) await worlds.remove(r.id);
}

/**
 * Starts `lesson`: a new lesson world, entered in place of the player's, then Flight. The flight
 * takes the lesson's design and sets the scene through the debug API.
 */
export async function startLesson(
	worlds: Worlds,
	lesson: Lesson,
	catalog: WorldCatalog,
	env: { newId(): string; now(): number },
	go: (url: string) => void | Promise<void>
): Promise<void> {
	const running = lessonSession();
	const previous = running ? running.previous : activeWorldId();
	await sweepLessonWorlds(worlds);
	const system = catalog.systems.find((s) => s.id === 'stock') ?? catalog.systems[0];
	if (!system) throw new Error('No star system is loaded.');
	const sandbox = catalog.presets.find((p) => p.id === 'stock.sandbox') ?? catalog.presets[0];
	if (!sandbox) throw new Error('No world preset is loaded.');
	const result = createWorldInfo(
		{
			id: env.newId(),
			seed: LESSON_SEED,
			preset: sandbox.id,
			rules: {},
			start: { kind: 'day-one' },
			gravityModel: 'patched',
			systemId: system.id,
			systemVersion: system.version,
			variant: 'default',
			home: homeBodyOf(system.bodies)?.id
		},
		catalog,
		system.calendar,
		env.now()
	);
	if (!result.ok) throw new Error(`The lesson cannot start: ${result.reason}.`);
	const record = await worlds.create(
		result.world,
		`Lesson: ${lesson.title}`,
		catalog.mods,
		undefined,
		{
			lesson: lesson.id
		}
	);
	const start = lessonStart(lesson);
	// a Hangar lesson starts from an empty Hangar; the player's draft comes back at the end
	let draft = running?.draft;
	if (start === 'vab') {
		const was = swapDraft(null);
		if (draft === undefined) draft = was;
	}
	saveSession({
		lesson: lesson.id,
		world: record.id,
		previous,
		ready: false,
		...(draft !== undefined ? { draft } : {})
	});
	setActiveWorld(record.id);
	await go(
		start === 'vab'
			? resolve('/(world)/vab')
			: start === 'space-center'
				? resolve('/(world)/space-center')
				: resolve('/(world)/flight')
	);
}

/**
 * Ends the lesson session: the player's world is active again. The lesson world itself is removed
 * by `sweepLessonWorlds` once the page has left it (leaving the world saves it first).
 */
export function endLessonSession(): void {
	const s = lessonSession();
	saveSession(null);
	if (s && s.draft !== undefined) swapDraft(s.draft);
	if (s) setActiveWorld(s.previous || LEGACY_WORLD_ID);
}

/** Outside the world: ends a session left running (a quit from the pause menu) and removes lesson worlds. */
export async function leaveLesson(worlds: Worlds): Promise<void> {
	endLessonSession();
	await sweepLessonWorlds(worlds);
}
