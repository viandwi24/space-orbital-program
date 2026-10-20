<script lang="ts">
	import { HEAT_BARS, type HeatMark } from './heat-marks';

	let bars = $state<HTMLElement[]>([]);

	/** Moves the bars; called every frame from the render loop, not through reactivity (ADR 0026). */
	export function place(marks: readonly HeatMark[] | null): void {
		bars.forEach((bar, i) => {
			const m = marks?.[i];
			if (!m) {
				bar.style.visibility = 'hidden';
				return;
			}
			bar.style.visibility = 'visible';
			bar.style.transform = `translate(${Math.round(m.x - 20)}px, ${Math.round(m.y - 14)}px)`;
			bar.dataset.critical = String(m.critical);
			(bar.firstElementChild as HTMLElement).style.width = `${Math.round(m.fill * 100)}%`;
		});
	}
</script>

<div class="layer" aria-hidden="true">
	{#each { length: HEAT_BARS } as _, i (i)}
		<div class="bar" data-testid="heat-bar" bind:this={bars[i]}><i></i></div>
	{/each}
</div>

<style>
	.layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.bar {
		position: absolute;
		left: 0;
		top: 0;
		width: 40px;
		height: 5px;
		visibility: hidden;
		border-radius: 3px;
		background: color-mix(in srgb, var(--c-bg, #000) 70%, transparent);
		outline: 1px solid color-mix(in srgb, var(--c-text, #fff) 35%, transparent);
	}
	i {
		display: block;
		height: 100%;
		border-radius: 3px;
		background: var(--c-warning, #e8a33d);
	}
	:global(.bar[data-critical='true']) i {
		background: var(--c-danger);
	}
</style>
