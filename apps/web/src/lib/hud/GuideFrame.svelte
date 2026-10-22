<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../ui/Icon.svelte';
	import { guideUi } from '../onboarding/guide-ui.svelte';

	/**
	 * The guide card's frame (plan 344): the eyebrow with the step counter and a minimise button,
	 * the content, the foot. Minimised it is a small pill ("Lesson 4/9") that opens it again.
	 * Shared by the first-flight guide and the lessons.
	 */
	let {
		label,
		count,
		pill,
		testid,
		ariaLabel,
		open = false,
		children,
		foot
	}: {
		/** The eyebrow: what guides ("First flight", "Lesson · Landing"). */
		label: string;
		/** "4 of 9". */
		count: string;
		/** The minimised pill's text: "Lesson 4/9". */
		pill: string;
		testid: string;
		ariaLabel: string;
		/** Shown open whatever the choice (a wait for Begin, a notice, the debrief). */
		open?: boolean;
		children: Snippet;
		foot: Snippet;
	} = $props();
	const small = $derived(guideUi.minimised && !open);
</script>

{#if small}
	<button
		type="button"
		class="pill"
		aria-label="Open the guide: {ariaLabel}, {count}"
		data-testid="guide-pill"
		onclick={() => guideUi.setMinimised(false)}
		><span class="dot" aria-hidden="true"></span>{pill}<Icon name="chevron" size={12} /></button
	>
{:else}
	<aside class="card" aria-live="polite" aria-label={ariaLabel} data-testid={testid}>
		<p class="eyebrow">
			<span class="label">{label}</span><span class="num">{count}</span>
			{#if !open}
				<button
					type="button"
					class="min"
					aria-label="Minimise the guide"
					data-tip="Minimise"
					data-testid="guide-minimise"
					onclick={() => guideUi.setMinimised(true)}>–</button
				>
			{/if}
		</p>
		{@render children()}
		<div class="foot">{@render foot()}</div>
	</aside>
{/if}

<style>
	.card {
		width: 17rem;
		max-width: calc(100vw - 2rem);
		padding: var(--s-2) var(--s-3) var(--s-2);
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
		align-items: center;
		gap: var(--s-2);
		margin: 0 0 var(--s-1);
		font-size: var(--t-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--c-accent);
	}
	.label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.num {
		flex: none;
		font-variant-numeric: tabular-nums;
	}
	.min {
		flex: none;
		width: 1.25rem;
		height: 1.25rem;
		margin: 0 calc(-1 * var(--s-1)) 0 0;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm, 4px);
		background: transparent;
		color: var(--text-muted);
		font-size: var(--t-md);
		line-height: 1;
		cursor: pointer;
	}
	.min:hover,
	.min:focus-visible {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.foot {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: var(--s-2);
		margin-top: var(--s-1);
	}
	.foot :global(.btn) {
		min-height: 0;
		padding-block: var(--s-1);
		font-size: var(--t-xs);
	}
	.pill {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		padding: var(--s-1) var(--s-3);
		border: 1px solid var(--border-subtle);
		border-radius: 999px;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		color: var(--text-primary);
		font-size: var(--t-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		pointer-events: auto;
		cursor: pointer;
	}
	.pill :global(svg) {
		transform: rotate(-90deg);
		color: var(--text-muted);
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--accent-text);
	}
</style>
