<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import GuideFrame from './GuideFrame.svelte';
	import { stepKeys, stepText, type TutorialStep } from '../onboarding/tutorial';
	import { settings } from '../settings/settings.svelte';

	/**
	 * The current first-flight hint (plan 023): one card at a time, skippable; compact, and minimised
	 * to a pill on request (plan 344).
	 */
	let {
		step,
		label,
		touch = false,
		onskip
	}: { step: TutorialStep; label: string; touch?: boolean; onskip: () => void } = $props();
	const keys = $derived(stepKeys(step, settings.keymap, touch));
</script>

<GuideFrame
	label="First flight"
	count={label}
	pill="First flight {label.replace(' of ', '/')}"
	testid="tutorial-card"
	ariaLabel="First flight guide"
>
	<h2>{step.title}</h2>
	<p class="text">{stepText(step, settings.keymap, touch)}</p>
	{#if keys.length > 0}
		<p class="keys" aria-hidden="true">
			{#each keys as k (k)}<Kbd>{k}</Kbd>{/each}
		</p>
	{/if}
	{#snippet foot()}
		<Button variant="ghost" onclick={onskip} data-testid="tutorial-skip">Skip the guide</Button>
	{/snippet}
</GuideFrame>

<style>
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
	.keys {
		display: flex;
		gap: var(--s-1);
		margin: var(--s-2) 0 0;
	}
</style>
