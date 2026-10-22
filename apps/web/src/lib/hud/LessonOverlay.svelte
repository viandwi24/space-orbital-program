<script lang="ts">
	import type { Snapshot } from '@orbital/core';
	import LessonCard from './LessonCard.svelte';
	import GuidePointer from './GuidePointer.svelte';
	import { activeLesson } from '../onboarding/lesson-world';
	import { lessonNotice, lessonVab, runningLesson } from '../onboarding/lesson-gate.svelte';
	import {
		NEW_LESSON,
		advanceLesson,
		lessonStart,
		lessonStep,
		observePlace,
		skipStep
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
	/**
	 * Bottom left (plan 344), beside a page's left column (the Hangar's parts) and above its bottom
	 * tool bar where they would meet. Measured a few times a second: columns open, close and resize.
	 */
	let left = $state<number | null>(null);
	let bottom = $state<number | null>(null);
	let box = $state<HTMLDivElement>();
	$effect(() => {
		const measure = () => {
			const col = document.querySelector('.leftcol')?.getBoundingClientRect();
			const bar = document.querySelector('.bottom')?.getBoundingClientRect();
			const width = box?.getBoundingClientRect().width ?? 272;
			const nextLeft = col && col.width > 0 ? Math.round(col.right + 12) : null;
			const from = nextLeft ?? 16;
			const nextBottom =
				bar && bar.height > 0 && from + width + 12 > bar.left && from < bar.right
					? Math.round(innerHeight - bar.top + 12)
					: null;
			if (nextLeft !== left) left = nextLeft;
			if (nextBottom !== bottom) bottom = nextBottom;
		};
		const first = setTimeout(measure, 0);
		const timer = setInterval(measure, 250);
		return () => {
			clearTimeout(first);
			clearInterval(timer);
		};
	});
	$effect(() => {
		// a blocked place's reason stays until the lesson moves on
		void progress.step;
		lessonNotice.clear();
	});
</script>

{#if lesson && ready()}
	<div
		class="lesson-overlay"
		bind:this={box}
		style:left={left === null ? null : `${left}px`}
		style:bottom={bottom === null ? null : `${bottom}px`}
	>
		<LessonCard
			{lesson}
			step={lessonStep(lesson, progress)}
			{progress}
			{keymap}
			{touch}
			notice={lessonNotice.reason}
			{onleave}
			onskip={() => settings.setLesson(lesson.id, skipStep(lesson, progress))}
		/>
	</div>
	<GuidePointer testid={lessonStep(lesson, progress)?.point ?? null} />
{/if}

<style>
	.lesson-overlay {
		position: fixed;
		left: var(--margin-hud, 1rem);
		/* over the status bar */
		bottom: calc(var(--margin-hud, 1rem) + 2rem);
		z-index: 41;
	}
</style>
