<script lang="ts">
	/** Link strength as four bars (refs: 4 / 6 / 8.5 / 11 high); offline is a red cross, never colour alone. */
	let { level, offline = false }: { level: number; offline?: boolean } = $props();
	const HEIGHTS = [4, 6, 8.5, 11] as const;
	const lit = $derived(offline ? 0 : Math.max(0, Math.min(4, Math.round(level))));
	const label = $derived(offline ? 'No signal' : `Signal ${lit} of 4`);
</script>

<svg class="bars" class:offline viewBox="0 0 14 12" role="img" aria-label={label} data-level={lit}>
	{#each HEIGHTS as h, i (i)}
		<rect x={i * 4} y={12 - h} width="2.5" height={h} rx="0.6" class:lit={i < lit} />
	{/each}
	{#if offline}
		<path class="cross" d="M8.5 1.5l4 4m0-4l-4 4" />
	{/if}
</svg>

<style>
	.bars {
		width: 0.875rem;
		height: 0.75rem;
		flex: none;
	}
	rect {
		fill: var(--surface-track);
	}
	rect.lit {
		fill: var(--text-primary);
	}
	.cross {
		fill: none;
		stroke: var(--offline);
		stroke-width: 1.6;
		stroke-linecap: round;
	}
</style>
