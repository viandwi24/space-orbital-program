<script lang="ts">
	import { blackoutShown } from '../blackout';

	let { level }: { level: number } = $props();
	const shown = $derived(blackoutShown(level));
</script>

<!-- Plan 040, ADR 0079: the shock layer swallows the radio. A display only; nothing is lost yet. -->
{#if shown}
	<div class="badge" role="status" aria-live="polite" data-testid="hud-blackout">
		<span class="label">Signal lost</span>
		<span class="why">plasma blackout</span>
		<span class="static" aria-hidden="true" style:opacity={0.35 + 0.4 * level}></span>
	</div>
{/if}

<style>
	.badge {
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: baseline;
		gap: var(--s-2);
		padding: 3px var(--s-4);
		background: var(--panel);
		border: 1px solid var(--c-warning);
		border-radius: 999px;
		font-size: var(--t-sm);
		pointer-events: none;
	}
	.label {
		font-weight: 600;
		color: var(--c-warning);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.why {
		color: var(--text-dim);
	}
	/* Scan lines drifting through the pill: the signal breaking up. */
	.static {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			0deg,
			transparent 0 2px,
			color-mix(in srgb, var(--c-warning) 22%, transparent) 2px 3px
		);
		animation: drift 0.5s steps(6) infinite;
		mix-blend-mode: screen;
	}
	@keyframes drift {
		to {
			background-position: 0 6px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.static {
			animation: none;
		}
	}
</style>
