<script lang="ts">
	/** A replay's ghost (plan 131, ADR 0159 point 7): its track in map view and where it is now. */
	import type { ScreenGhost } from './ghost-model';

	let { ghost }: { ghost: ScreenGhost } = $props();
	const points = $derived(ghost.path.map((p) => `${p.x},${p.y}`).join(' '));
</script>

<svg class="ghost" aria-hidden="true" data-testid="ghost-layer">
	{#if ghost.path.length > 1}<polyline {points} />{/if}
	{#if ghost.at}
		<g transform="translate({ghost.at.x} {ghost.at.y})">
			<circle r="5" />
			<text x="9" y="4">{ghost.name}</text>
		</g>
	{/if}
</svg>

<style>
	.ghost {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	polyline {
		fill: none;
		stroke: var(--text-secondary, #c4c4cc);
		stroke-width: 1.25;
		stroke-dasharray: 2 5;
		opacity: 0.7;
	}
	circle {
		fill: none;
		stroke: var(--text-primary, #fff);
		stroke-width: 1.5;
		opacity: 0.8;
	}
	text {
		fill: var(--text-secondary, #c4c4cc);
		font-size: var(--t-small);
	}
</style>
