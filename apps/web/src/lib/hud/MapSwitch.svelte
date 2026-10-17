<script lang="ts">
	/**
	 * The map view's `Map | Mission Center` switch (refs `MapView` top centre; plan 113, ADR 0118
	 * point 6). Mission Center saves the flight first, so `busy` greys it while that runs.
	 */
	let { busy = false, onmissioncenter }: { busy?: boolean; onmissioncenter: () => void } = $props();
</script>

<div class="switch" role="tablist" aria-label="View">
	<button type="button" role="tab" aria-selected="true" class="on" data-testid="map-tab-map"
		>Map</button
	>
	<button
		type="button"
		role="tab"
		aria-selected="false"
		disabled={busy}
		onclick={onmissioncenter}
		data-testid="map-tab-mc">Mission Center</button
	>
</div>

<style>
	.switch {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		pointer-events: auto;
	}
	button {
		height: 2.125rem;
		padding: 0 0.875rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--t-sm);
		font-weight: 600;
		cursor: pointer;
	}
	button.on {
		background: var(--selected-bg);
		color: var(--selected-fg);
		cursor: default;
	}
	button:disabled {
		opacity: 0.5;
		cursor: progress;
	}
</style>
