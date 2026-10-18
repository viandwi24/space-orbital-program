<script lang="ts">
	/**
	 * The Regions layer of map view (plan 192, ADR 0180): a toggle that tints the bodies by their
	 * science regions, and the region under the cursor while it is on (viewport coordinates).
	 */
	let {
		on,
		ontoggle,
		hover = null
	}: {
		on: boolean;
		ontoggle: () => void;
		hover?: { label: string; x: number; y: number } | null;
	} = $props();
</script>

<button
	type="button"
	class="toggle"
	class:on
	aria-pressed={on}
	onclick={ontoggle}
	data-testid="map-regions">Regions</button
>
{#if on && hover}
	<div
		class="hover"
		data-testid="map-region-hover"
		style="left: {hover.x + 14}px; top: {hover.y + 14}px"
	>
		{hover.label}
	</div>
{/if}

<style>
	.toggle {
		height: 2.125rem;
		padding: 0 0.875rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
		pointer-events: auto;
	}
	.toggle.on {
		background: var(--text-primary);
		color: var(--surface-base, #000);
	}
	.hover {
		position: fixed;
		z-index: 5;
		pointer-events: none;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		color: var(--text-primary);
		font-size: var(--t-small);
		white-space: nowrap;
	}
</style>
