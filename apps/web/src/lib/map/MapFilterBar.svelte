<script lang="ts">
	/**
	 * The map's filters (plan 258, ADR 0242), after KSP's map filter row: a switch per layer (orbit
	 * lines, comms links, ground stations, labels) and, under "Vessels", one per vessel type. What
	 * the player switches off is remembered.
	 */
	import { VESSEL_TYPES, type VesselType } from '@orbital/core';
	import { VESSEL_ICON_PATHS } from '@orbital/renderer';
	import Icon from '../ui/Icon.svelte';
	import { VESSEL_TYPE_LABEL } from '../mission-center/model';
	import { mapFilters } from './map-filters.svelte';
	import { shownCount, type MapLayer } from './map-filters';

	const LAYER_ROWS: ReadonlyArray<{ id: MapLayer; label: string; icon: string }> = [
		{ id: 'orbits', label: 'Orbit lines', icon: 'orbit' },
		{ id: 'links', label: 'Comms links', icon: 'signal' },
		{ id: 'stations', label: 'Ground stations', icon: 'station' },
		{ id: 'labels', label: 'Labels', icon: 'label' },
		// off by default (plan 293, ADR 0266)
		{ id: 'soi', label: 'Spheres of influence', icon: 'soi' }
	];
	const f = $derived(mapFilters.filters);
	const typesOn = $derived(VESSEL_TYPES.filter((t) => f.types[t]).length);
	const count = $derived(shownCount(f));
	let open = $state(false);
</script>

<div class="bar" role="group" aria-label="Map filters" data-testid="map-filters">
	{#each LAYER_ROWS as l (l.id)}
		<button
			type="button"
			class="chip"
			class:on={f[l.id]}
			aria-pressed={f[l.id]}
			aria-label={l.label}
			data-tip={l.label}
			data-testid="map-filter-{l.id}"
			onclick={() => mapFilters.setLayer(l.id, !f[l.id])}><Icon name={l.icon} size={16} /></button
		>
	{/each}
	<button
		type="button"
		class="chip wide"
		class:on={typesOn === VESSEL_TYPES.length}
		aria-expanded={open}
		data-tip="Which vessel types the map shows"
		data-testid="map-filter-vessels"
		onclick={() => (open = !open)}
		><Icon name="eye" size={16} /><span>Vessels {typesOn}/{VESSEL_TYPES.length}</span></button
	>
	{#if open}
		<div class="types" role="group" aria-label="Vessel types" data-testid="map-filter-types">
			{#each VESSEL_TYPES as t (t)}
				<button
					type="button"
					class="type"
					class:on={f.types[t]}
					aria-pressed={f.types[t]}
					data-tip={VESSEL_TYPE_LABEL[t as VesselType]}
					data-testid="map-filter-type-{t}"
					onclick={() => mapFilters.setType(t, !f.types[t])}
				>
					<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
						><path d={VESSEL_ICON_PATHS[t]} /></svg
					>
					<span>{VESSEL_TYPE_LABEL[t as VesselType]}</span>
				</button>
			{/each}
		</div>
	{/if}
	<span class="sr-only" aria-live="polite">{count.on} of {count.of} map layers on</span>
</div>

<style>
	.bar {
		position: relative;
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 0.25rem;
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		pointer-events: auto;
		z-index: 3;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-faint);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.chip.on {
		color: var(--text-primary);
	}
	.chip:hover {
		background: var(--surface-hover);
	}
	.chip:focus-visible,
	.type:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: -2px;
	}
	.types {
		position: absolute;
		top: calc(100% + 0.375rem);
		right: 0;
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 2px;
		padding: 0.25rem;
		min-width: 14rem;
		border-radius: var(--radius-panel);
		background: var(--surface-dialog);
		border: 1px solid var(--border-subtle);
		box-shadow: var(--shadow-overlay);
		z-index: 2;
	}
	.type {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 2rem;
		padding: 0 0.5rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: transparent;
		color: var(--text-faint);
		font: inherit;
		font-size: var(--t-small);
		text-align: left;
		cursor: pointer;
	}
	.type.on {
		color: var(--text-primary);
	}
	.type:hover {
		background: var(--surface-hover);
	}
	.type svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
