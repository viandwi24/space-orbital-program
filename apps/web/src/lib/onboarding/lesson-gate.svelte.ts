/**
 * Scene permissions of a lesson (plan 229): a filter in front of key handling and in-world
 * navigation, never a change to the sim. A blocked try sets the notice, which the lesson card and
 * the world layout show with its reason.
 */
import type { ActionId, Keymap } from '../keybindings';
import { blockedAction, blockedPlace, lessonOf, type Lesson } from './lessons';
import { activeLesson } from './lesson-world';

/** How long a "not in this lesson" notice stays, ms. */
export const NOTICE_MS = 6_000;

class LessonNotice {
	reason = $state<string | null>(null);
	#timer: ReturnType<typeof setTimeout> | null = null;

	show(reason: string): void {
		this.reason = reason;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.reason = null;
			this.#timer = null;
		}, NOTICE_MS);
	}

	clear(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		this.reason = null;
	}
}

export const lessonNotice = new LessonNotice();

/** The lesson running in the active world, if any. */
export function runningLesson(): Lesson | null {
	const s = activeLesson();
	return s ? (lessonOf(s.lesson) ?? null) : null;
}

/**
 * `base` with the lesson's blocked actions taken out: their keys trigger nothing (held axes too),
 * and pressing one reports its reason through `onblocked`.
 */
export function lessonKeymap(
	base: Keymap,
	lesson: Lesson,
	onblocked: (reason: string) => void
): Keymap {
	const reasonOf = (id: ActionId): string | null => blockedAction(lesson, id);
	return {
		profile: base.profile,
		keys: (id) => (reasonOf(id) === null ? base.keys(id) : []),
		actionFor(scope, key) {
			const id = base.actionFor(scope, key);
			if (id === null) return null;
			const reason = reasonOf(id);
			if (reason === null) return id;
			onblocked(reason);
			return null;
		},
		label: (id) => base.label(id),
		labels: (id) => base.labels(id)
	};
}

/** The reason the running lesson closes `path`, or null (outside a lesson: always null). */
export function placeBlocked(path: string): string | null {
	const lesson = runningLesson();
	return lesson ? blockedPlace(lesson, path) : null;
}
