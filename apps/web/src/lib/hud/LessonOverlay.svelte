<script lang="ts">
	import type { Snapshot } from '@orbital/core';
	import LessonCard from './LessonCard.svelte';
	import { activeLesson } from '../onboarding/lesson-world';
	import { lessonNotice, lessonVab, runningLesson } from '../onboarding/lesson-gate.svelte';
	import {
		NEW_LESSON,
		advanceLesson,
		lessonStart,
		lessonStep,
		observePlace
	} from '../onboarding/lessons';
	import type { Keymap } from '../keybindings';
	import { settings } from '../settings/settings.svelte';

	/**
	 * The running lesson on an in-world page other than Flight (plan 344, ADR 0293 point 2): the
	 * Hangar, the Space Center, the Mission Center and the buildings. It observes the page, the
	 * world's snapshot and the Hangar's design, advances the lesson and shows its card.
	 */
	let {
		place,
		snapshot,
		keymap,
		touch = false,
		onleave
	}: {
		/** The page's route name: `vab`, `space-center`, `mission-center`, … */
		place: string;
		snapshot: Snapshot | null;
		keymap: Keymap;
		touch?: boolean;
		onleave: () => void;
	} = $props();

	const lesson = runningLesson();
	// a Flight lesson counts here only once Flight has set its scene
	const ready = (): boolean =>
		lesson !== null && (lessonStart(lesson) !== 'flight' || activeLesson()?.ready === true);
	const progress = $derived(lesson ? (settings.lessons[lesson.id] ?? NEW_LESSON) : NEW_LESSON);

	$effect(() => {
		if (!lesson || !ready()) return;
		const o = observePlace(place, snapshot, place === 'vab' ? lessonVab.state : null);
		const next = advanceLesson(lesson, progress, o);
		if (next !== progress) settings.setLesson(lesson.id, next);
	});
	$effect(() => {
		// a blocked place's reason stays until the lesson moves on
		void progress.step;
		lessonNotice.clear();
	});
</script>

{#if lesson && ready()}
	<div class="lesson-overlay">
		<LessonCard
			{lesson}
			step={lessonStep(lesson, progress)}
			{progress}
			{keymap}
			{touch}
			notice={lessonNotice.reason}
			{onleave}
		/>
	</div>
{/if}

<style>
	.lesson-overlay {
		position: fixed;
		left: var(--margin-hud, 1rem);
		bottom: var(--margin-hud, 1rem);
		z-index: 41;
	}
</style>
