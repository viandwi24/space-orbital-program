<script lang="ts">
	import SignalBars from '../ui/SignalBars.svelte';
	import type { LinkBadge } from '../comms/network-model';

	let { link }: { link: LinkBadge } = $props();
</script>

<!-- Plan 115, ADR 0158: the link and, when it is down, why (blackout is one of the reasons). -->
<div
	class="badge"
	class:lost={link.state === 'lost'}
	role="status"
	aria-live="polite"
	data-testid="hud-link"
	data-state={link.state}
>
	<SignalBars level={link.bars} offline={link.state === 'lost'} />
	<span class="text">{link.text}</span>
	{#if link.state === 'lost' && link.blackout > 0}
		<span class="static" aria-hidden="true" style:opacity={0.35 + 0.4 * link.blackout}></span>
	{/if}
</div>

<style>
	.badge {
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: 3px var(--s-4);
		background: var(--panel);
		border: 1px solid transparent;
		border-radius: 999px;
		font-size: var(--t-sm);
		color: var(--text-dim);
		pointer-events: none;
	}
	.lost {
		border-color: var(--c-warning);
	}
	.lost .text {
		font-weight: 600;
		color: var(--c-warning);
	}
	/* Scan lines drifting through the pill during a plasma blackout (plan 040). */
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
