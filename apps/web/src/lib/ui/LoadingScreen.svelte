<script lang="ts">
	import { GAME_NAME } from '../public/about';

	/**
	 * Full-screen loading state (plan 023; refs style since plan 089): the wordmark, what the page is
	 * waiting for, a moving bar. The world's loading (plan 340) adds its list of steps and a bar that
	 * fills with the step's progress.
	 */
	let {
		step,
		overlay = false,
		steps = [],
		fraction = null,
		detail = '',
		report = null
	}: {
		step: string;
		/** Covers a page that is already mounted (the flight canvas). */ overlay?: boolean;
		/** Every step with whether it is done, under way or still to come. */
		steps?: ReadonlyArray<{ label: string; state: 'done' | 'now' | 'todo' }>;
		/** Share of the step done, 0 to 1; null for the moving bar. */
		fraction?: number | null;
		/** A line under the step: what is left of it (plan 370: pipelines ready of asked for). */
		detail?: string;
		/** The load report's text, for its Copy button (plan 370); null hides the button. */
		report?: (() => string | null) | null;
	} = $props();

	let copied = $state('');
	async function copy(): Promise<void> {
		const text = report?.();
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			copied = 'Copied';
		} catch {
			copied = 'The browser did not allow copying';
		}
	}
</script>

<div class="loading" class:overlay role="status" aria-live="polite" data-testid="loading-screen">
	<svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
		<ellipse
			cx="12"
			cy="12"
			rx="10"
			ry="4"
			transform="rotate(-24 12 12)"
			fill="none"
			stroke="currentColor"
			stroke-width="1.4"
		/>
		<circle cx="12" cy="12" r="3.2" fill="currentColor" />
	</svg>
	<p class="name">{GAME_NAME}</p>
	<div class="bar" class:fill={fraction !== null} aria-hidden="true">
		<span style:width={fraction !== null ? `${Math.round(fraction * 100)}%` : undefined}></span>
	</div>
	<p class="step">{step}</p>
	{#if detail}<p class="detail" data-testid="loading-detail">{detail}</p>{/if}
	{#if steps.length > 0}
		<ol class="steps" data-testid="loading-steps">
			{#each steps as s (s.label)}
				<li class={s.state}>{s.label}</li>
			{/each}
		</ol>
	{/if}
	{#if report}
		<button type="button" class="copy" onclick={() => void copy()} data-testid="loading-copy-report"
			>Copy load report</button
		>
		{#if copied}<p class="detail" role="status">{copied}</p>{/if}
	{/if}
</div>

<style>
	.loading {
		display: grid;
		justify-items: center;
		align-content: center;
		gap: var(--s-3);
		min-height: 100vh;
		min-height: 100dvh;
		color: var(--text-primary);
		background: var(--bg-space);
	}
	.overlay {
		position: absolute;
		inset: 0;
		z-index: 20;
		min-height: 0;
	}
	.name {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1;
		font-weight: 600;
		letter-spacing: 0.32em;
		text-transform: uppercase;
	}
	.step {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.detail {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.copy {
		margin-top: var(--s-3);
		padding: var(--s-1) var(--s-3);
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-muted);
		background: transparent;
		border: 1px solid var(--surface-track);
		border-radius: var(--radius-pill);
		cursor: pointer;
	}
	.copy:hover {
		color: var(--text-primary);
	}
	.bar {
		width: 11.25rem;
		height: 3px;
		overflow: hidden;
		background: var(--surface-track);
		border-radius: var(--radius-pill);
	}
	.bar span {
		display: block;
		width: 40%;
		height: 100%;
		background: var(--selected-bg);
		animation: slide 1.3s var(--ease) infinite;
	}
	.bar.fill span {
		animation: none;
		transition: width 0.2s var(--ease);
	}
	.steps {
		margin: var(--s-2) 0 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: var(--s-1);
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.steps li::before {
		content: '○';
		display: inline-block;
		width: 1.25em;
	}
	.steps li.done {
		color: var(--text-body);
	}
	.steps li.done::before {
		content: '✓';
	}
	.steps li.now {
		color: var(--text-primary);
	}
	.steps li.now::before {
		content: '●';
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(260%);
		}
	}
</style>
