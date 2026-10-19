<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { stepKeys, stepText } from '../onboarding/tutorial';
	import { lessonLabel, type Lesson, type LessonStep } from '../onboarding/lessons';
	import type { Keymap } from '../keybindings';
	import type { LessonProgress } from '../settings/settings';

	/**
	 * A lesson's card in flight (plan 229): the step to do now, or the debrief once it is done; a
	 * blocked control's reason underneath; Leave goes back to the Lessons page.
	 */
	let {
		lesson,
		step,
		progress,
		keymap,
		touch = false,
		notice = null,
		onleave
	}: {
		lesson: Lesson;
		step: LessonStep | null;
		progress: LessonProgress;
		/** The keys in force (the player's, with the lesson's filter). */
		keymap: Keymap;
		touch?: boolean;
		notice?: string | null;
		onleave: () => void;
	} = $props();
	const keys = $derived(step ? stepKeys(step, keymap, touch) : []);
	const done = $derived(progress.status === 'done');
</script>

<aside class="card" aria-live="polite" aria-label="Lesson" data-testid="lesson-card">
	<p class="eyebrow">
		<span>Lesson · {lesson.title}</span><span class="num">{lessonLabel(lesson, progress)}</span>
	</p>
	{#if done}
		<h2 data-testid="lesson-debrief">Lesson complete</h2>
		<p class="text">{lesson.debrief}</p>
		<p class="text hint">{lesson.hint}</p>
	{:else if step}
		<h2 data-testid="lesson-step-{step.id}">{step.title}</h2>
		<p class="text">{stepText(step, keymap, touch)}</p>
		{#if keys.length > 0}
			<p class="keys" aria-hidden="true">
				{#each keys as k (k)}<Kbd>{k}</Kbd>{/each}
			</p>
		{/if}
	{/if}
	{#if notice}
		<p class="notice" role="status" data-testid="lesson-notice">{notice}</p>
	{/if}
	<div class="foot">
		<Button variant={done ? 'primary' : 'ghost'} onclick={onleave} data-testid="lesson-leave"
			>{done ? 'Back to lessons' : 'Leave the lesson'}</Button
		>
	</div>
</aside>

<style>
	.card {
		width: 18rem;
		padding: var(--s-3) var(--s-4);
		box-sizing: border-box;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-left: 3px solid var(--accent-text);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		pointer-events: auto;
	}
	.eyebrow {
		display: flex;
		justify-content: space-between;
		gap: var(--s-2);
		margin: 0 0 var(--s-1);
		font-size: var(--t-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--c-accent);
	}
	h2 {
		margin: 0 0 var(--s-1);
		font-size: var(--t-md);
		font-weight: 600;
	}
	.text {
		margin: 0;
		font-size: var(--t-sm);
		line-height: 1.4;
		color: var(--text);
	}
	.hint {
		margin-top: var(--s-2);
		color: var(--text-muted);
	}
	.keys {
		display: flex;
		gap: var(--s-1);
		margin: var(--s-2) 0 0;
	}
	.notice {
		margin: var(--s-2) 0 0;
		padding-top: var(--s-2);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--t-xs);
		line-height: 1.35;
		color: var(--text-muted);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--s-2);
	}
</style>
