<script lang="ts">
	/**
	 * The Regions layer of map view (plan 192, ADR 0180): the region under the cursor while the layer
	 * is on (viewport coordinates). The layer's switch is a chip in the map filter row (plan 292).
	 */
	let {
		on,
		hover = null
	}: {
		on: boolean;
		hover?: { label: string; x: number; y: number } | null;
	} = $props();
</script>

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
