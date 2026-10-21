<script lang="ts">
	/**
	 * A map vessel's card (plan 250, rancangan §6.1): its name, Switch to and a way to dismiss it.
	 * Plan 318: Recover (landed at rest) and Terminate (a second click when crew are aboard).
	 */
	import type { MapCard } from './map-card';
	import type { VesselMenu } from '../vessel-menu';

	let {
		card,
		menu = null,
		onswitch,
		onrecover,
		onterminate,
		onclose
	}: {
		card: MapCard;
		/** The card's vessel as the vessel menu reads it; null for the flown one or one that is gone. */
		menu?: VesselMenu | null;
		onswitch: (vessel: number) => void;
		onrecover?: () => void;
		onterminate?: () => void;
		onclose: () => void;
	} = $props();
	let ending = $state(false);
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
	{#if menu?.ours && menu.recovery && onrecover}
		<button type="button" data-testid="map-card-recover" onclick={onrecover}>Recover</button>
	{/if}
	{#if menu?.ours && onterminate}
		<button
			type="button"
			class:danger={ending}
			data-testid="map-card-terminate"
			onclick={() => (menu.crew > 0 && !ending ? (ending = true) : onterminate())}
			>{ending ? `Terminate: ${menu.crew} crew aboard` : 'Terminate'}</button
		>
	{/if}
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
	.danger {
		color: var(--c-danger);
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
