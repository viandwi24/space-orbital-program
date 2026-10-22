<script lang="ts">
	/**
	 * A design's picture (plan 346, ADR 0295 point 5): its saved 3D thumbnail, or the flat outline
	 * drawn from its layout when it has none.
	 */
	import type { PartLookup, VesselDesign } from '@orbital/core';
	import { designProfile, profileSvg } from './design-profile';

	let {
		design,
		thumbnail = null,
		parts,
		width,
		height
	}: {
		design: VesselDesign;
		thumbnail?: string | null;
		parts: PartLookup;
		width: number;
		height: number;
	} = $props();
	const svg = $derived.by(() => {
		if (thumbnail) return null;
		const p = designProfile(design, parts);
		return p ? profileSvg(p, width, height, Math.max(4, Math.round(height * 0.06))) : null;
	});
</script>

<span class="pic" style="width:{width}px;height:{height}px" aria-hidden="true">
	{#if thumbnail}
		<img src={thumbnail} alt="" />
	{:else if svg}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- our own SVG from numbers -->
		{@html svg}
	{/if}
</span>

<style>
	.pic {
		display: grid;
		place-items: center;
		flex: none;
		color: var(--text-secondary);
	}
	img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.pic :global(polygon) {
		fill: rgb(255 255 255 / 0.06);
		stroke: currentColor;
		stroke-width: 1.2;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
	}
	.pic :global(polygon.command) {
		fill: rgb(255 255 255 / 0.18);
	}
	.pic :global(polygon.engine) {
		stroke: #f59e0b;
		fill: rgb(245 158 11 / 0.14);
	}
</style>
