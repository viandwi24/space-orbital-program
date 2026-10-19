<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { stepKeys, stepText, type TutorialStep } from '../onboarding/tutorial';
	import { settings } from '../settings/settings.svelte';

	/** The current first-flight hint (plan 023): one card at a time, skippable. */
	let {
		step,
		label,
		touch = false,
		onskip
	}: { step: TutorialStep; label: string; touch?: boolean; onskip: () => void } = $props();
	const keys = $derived(stepKeys(step, settings.keymap, touch));
</script>

<aside class="card" aria-live="polite" aria-label="First flight guide" data-testid="tutorial-card">
	<p class="eyebrow"><span>First flight</span><span class="num">{label}</span></p>
	<h2>{step.title}</h2>
	<p class="text">{stepText(step, settings.keymap, touch)}</p>
	{#if keys.length > 0}
		<p class="keys" aria-hidden="true">
			{#each keys as k (k)}<Kbd>{k}</Kbd>{/each}
		</p>
	{/if}
	<div class="foot">
		<Button variant="ghost" onclick={onskip} data-testid="tutorial-skip">Skip the guide</Button>
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
	.keys {
		display: flex;
		gap: var(--s-1);
		margin: var(--s-2) 0 0;
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		margin-top: var(--s-2);
	}
</style>
