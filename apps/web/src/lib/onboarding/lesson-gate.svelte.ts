/**
 * Scene permissions of a lesson (plan 229): a filter in front of key handling and in-world
 * navigation, never a change to the sim. A blocked try sets the notice, which the lesson card and
 * the world layout show with its reason.
 */
import type { ActionId, Keymap } from '../keybindings';
import { blockedAction, blockedPlace, lessonOf, type Lesson, type VabLessonState } from './lessons';
import { activeLesson } from './lesson-world';

/**
 * The last "not in this lesson" reason. It stays until the lesson moves on a step or the page
 * changes, so a player (or a slow test page) never misses it.
 */
class LessonNotice {
	reason = $state<string | null>(null);

	show(reason: string): void {
		this.reason = reason;
	}

	clear(): void {
		this.reason = null;
	}
}

export const lessonNotice = new LessonNotice();

/** The Hangar's design as a lesson sees it (ADR 0293 point 3); null away from the Hangar. */
class LessonVab {
	state = $state.raw<VabLessonState | null>(null);
}

export const lessonVab = new LessonVab();

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
