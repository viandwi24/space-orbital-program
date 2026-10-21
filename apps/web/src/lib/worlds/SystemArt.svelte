<script lang="ts">
	/**
	 * A star system's picture (plan 317, ADR 0273): the mod's own `illustration`/`icon` when it ships
	 * one (drawn as an image, so an SVG's script never runs), else the generated diagram.
	 */
	import type { BodyDefinition } from '@orbital/core';
	import { systemPicture, type ArtLayout } from './system-art';

	let {
		systemId,
		bodies,
		layout = 'card',
		image,
		label
	}: {
		systemId: string;
		bodies: readonly BodyDefinition[];
		layout?: ArtLayout;
		/** The mod's art for this layout, a `data:` URL; absent: generated. */
		image?: string | undefined;
		/** Read by assistive technology. */
		label: string;
	} = $props();

	const pic = $derived(image ? null : systemPicture(systemId, bodies, layout));
	const uid = $derived(`sa-${systemId.replace(/[^a-z0-9]/gi, '')}-${layout}`);
</script>

{#if image}
	<img class="art {layout}" src={image} alt={label} />
{:else if pic}
	<svg
		class="art {layout}"
		viewBox="0 0 {pic.width} {pic.height}"
		role="img"
		aria-label={label}
		data-testid="system-art"
	>
		<defs>
			<radialGradient id="{uid}-star">
				<stop offset="0" stop-color="#fff" />
				<stop offset="0.45" stop-color={pic.star.color} />
				<stop offset="1" stop-color={pic.star.color} stop-opacity="0" />
			</radialGradient>
			{#each pic.bodies as b, i (b.id)}
				<radialGradient id="{uid}-b{i}" cx="0.35" cy="0.3" r="0.8">
					<stop offset="0" stop-color={b.light} />
					<stop offset="1" stop-color={b.dark} />
				</radialGradient>
			{/each}
		</defs>
		<circle cx={pic.star.x} cy={pic.star.y} r={pic.star.r * 2.2} fill="url(#{uid}-star)" />
		<circle cx={pic.star.x} cy={pic.star.y} r={pic.star.r} fill={pic.star.color} />
		{#each pic.orbits as o, i (i)}<path d={o} class="orbit" />{/each}
		{#each pic.bodies as b, i (b.id)}
			{#if b.atmosphere}<circle
					cx={b.x}
					cy={b.y}
					r={b.r + 1.4}
					fill="none"
					stroke={b.atmosphere}
					stroke-width="1"
				/>{/if}
			<circle cx={b.x} cy={b.y} r={b.r} fill="url(#{uid}-b{i})" />
			{#if b.bands}
				<path
					d="M{b.x - b.r * 0.9} {b.y - b.r * 0.3} H{b.x + b.r * 0.9} M{b.x - b.r * 0.95} {b.y +
						b.r * 0.25} H{b.x + b.r * 0.95}"
					class="band"
				/>
			{/if}
			{#if b.ring}
				<ellipse cx={b.x} cy={b.y} rx={b.ring} ry={b.ring * 0.32} class="ring" stroke={b.light} />
			{/if}
			{#each b.moons as m, k (k)}<circle cx={m.x} cy={m.y} r={m.r} fill={m.color} />{/each}
		{/each}
	</svg>
{/if}

<style>
	.art {
		display: block;
	}
	.art.card {
		width: 100%;
		max-width: 18.75rem;
		height: auto;
		aspect-ratio: 300 / 96;
	}
	.art.icon {
		width: 3rem;
		height: 3rem;
		object-fit: cover;
		border-radius: 0.75rem;
	}
	img.art.card {
		object-fit: cover;
		border-radius: 0.5rem;
	}
	.orbit {
		fill: none;
		stroke: rgb(255 255 255 / 0.16);
		stroke-width: 1;
	}
	.band {
		stroke: rgb(0 0 0 / 0.22);
		stroke-width: 1;
		fill: none;
	}
	.ring {
		fill: none;
		stroke-width: 1.2;
		opacity: 0.8;
	}
</style>
