<script lang="ts">
	/** The Network layer (plan 115, ADR 0158): link lines by state and station markers, in CSS pixels. */
	import type { ScreenNetwork } from './network-model';

	let { network }: { network: ScreenNetwork } = $props();
</script>

<svg class="network" aria-hidden="true" data-testid="network-layer">
	{#each network.lines as l (l.key)}
		<line class={l.state} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} data-state={l.state} />
	{/each}
	{#each network.stations as s (s.id)}
		<g class="station" transform="translate({s.x} {s.y})">
			<path d="M0 -5 L5 4 L-5 4 Z" />
			<text x="8" y="4">{s.label}</text>
		</g>
	{/each}
</svg>

<style>
	.network {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	line {
		stroke-width: 1.25;
		stroke-dasharray: 4 4;
		opacity: 0.8;
	}
	line.full {
		stroke: var(--ok, #7bd88f);
	}
	line.partial {
		stroke: var(--warn, #f0b35a);
	}
	.station path {
		fill: var(--ok, #7bd88f);
	}
	.station text {
		fill: var(--text-secondary, #c4c4cc);
		font-size: var(--t-small);
	}
</style>
