<script lang="ts">
	/** A map vessel's card (plan 250, rancangan §6.1): its name, Switch to and a way to dismiss it. */
	import type { MapCard } from './map-card';

	let {
		card,
		onswitch,
		onclose
	}: { card: MapCard; onswitch: (vessel: number) => void; onclose: () => void } = $props();
</script>

<div
	class="card"
	style:left="{card.x}px"
	style:top="{card.y}px"
	role="dialog"
	aria-label="{card.label}, vessel"
	data-testid="map-card"
>
	<span class="name">{card.label}</span>
	<button type="button" data-testid="map-card-switch" onclick={() => onswitch(card.vessel)}
		>Switch to</button
	>
	<button type="button" aria-label="Close" data-testid="map-card-close" onclick={onclose}>×</button>
</div>

<style>
	.card {
		position: absolute;
		z-index: 6;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transform: translate(0.75rem, 0.75rem);
		padding: 0.375rem 0.5rem;
		font-size: var(--t-value);
		color: var(--text-primary);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: 8px;
	}
	.name {
		font-weight: 600;
	}
	button {
		min-height: 1.75rem;
		padding: 0 0.625rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: var(--surface-button);
		color: var(--text-primary);
		font: inherit;
	}
</style>
