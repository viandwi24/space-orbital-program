<script lang="ts">
	/** A label over a value on an inset tile; a value that is not known shows the honest placeholder `[—]`. */
	let {
		label,
		value,
		unit
	}: { label: string; value: string | number | null | undefined; unit?: string } = $props();
	const known = $derived(value !== null && value !== undefined && value !== '');
</script>

<div class="stat">
	<span class="label">{label}</span>
	<span class="value"
		>{#if known}{value}{#if unit}{' '}<span class="unit">{unit}</span>{/if}{:else}[—]{/if}</span
	>
</div>

<style>
	.stat {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.4375rem 0.5rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		min-width: 0;
	}
	.label {
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.value {
		font-size: var(--t-small);
		font-weight: 600;
		line-height: 1;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.unit {
		color: var(--text-muted);
		font-weight: 500;
	}
</style>
