<script lang="ts">
	/**
	 * The Hangar's LAUNCH (plan 346, ADR 0295 point 3): white and full width above the Vessel stats.
	 * A caution dot when the checks warn; disabled, with the reason as its tooltip, when blocked.
	 * Shift-click flies at once, as the menu bar's Launch did.
	 */
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
	const tip = $derived(
		vab.launchBlocked
			? (vab.checks.find((c) => c.severity === 'error')?.text ?? 'This vessel cannot launch yet')
			: vab.warnings > 0
				? `${vab.warnings} warning${vab.warnings === 1 ? '' : 's'}: you will be asked to confirm`
				: 'Go to the launch screen (Shift-click: fly at once)'
	);
</script>

<button
	type="button"
	class="launch"
	disabled={vab.launchBlocked}
	data-tip={tip}
	data-testid="menu-launch"
	onclick={(e) => vab.launch(false, e.shiftKey)}
>
	<span class="word">Launch</span><span class="sr-only">. {tip}</span>
	{#if vab.warnings > 0 && !vab.launchBlocked}<span class="caution" aria-hidden="true"
		></span>{/if}
</button>

<style>
	.launch {
		position: relative;
		flex: none;
		width: 100%;
		height: 2.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 0;
		border-radius: var(--radius-pill);
		background: #f4f4f5;
		color: #0b0b0c;
		font: inherit;
		cursor: pointer;
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
		transition:
			background var(--dur-fast) var(--ease),
			transform var(--dur-fast) var(--ease);
	}
	.word {
		font-size: var(--t-button);
		font-weight: 800;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}
	.launch:hover:not(:disabled) {
		background: #fff;
	}
	.launch:active:not(:disabled) {
		transform: translateY(1px);
	}
	.launch:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	.launch:disabled {
		background: var(--surface-button);
		color: var(--text-disabled);
		box-shadow: none;
		cursor: not-allowed;
	}
	.caution {
		position: absolute;
		right: 1rem;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warn);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--warn) 30%, transparent);
	}
</style>
