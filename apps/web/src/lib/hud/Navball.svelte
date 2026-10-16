<script lang="ts">
	import { drawNavball, themeFrom, type NavballFrame, type NavballTheme } from './navball-draw';

	let { size = 176, label }: { size?: number; label: string } = $props();
	let canvas = $state<HTMLCanvasElement>();
	let ctx: CanvasRenderingContext2D | null = null;
	let theme: NavballTheme | null = null;
	let last: NavballFrame | null = null;

	$effect(() => {
		if (!canvas) return;
		const dpr = Math.min(globalThis.devicePixelRatio ?? 1, 2);
		canvas.width = Math.round(size * dpr);
		canvas.height = Math.round(size * dpr);
		ctx = canvas.getContext('2d');
		ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
		theme = themeFrom(canvas);
		if (last) paint(last);
	});

	/** Called from the render loop every frame; not reactive on purpose (ADR 0026). */
	export function paint(frame: NavballFrame | null): void {
		last = frame;
		if (!ctx || !theme) return;
		if (!frame) {
			ctx.clearRect(0, 0, size, size);
			return;
		}
		drawNavball(ctx, size, frame, theme);
	}
</script>

<div role="img" aria-label={label}>
	<canvas bind:this={canvas} style:width="{size}px" style:height="{size}px"></canvas>
</div>

<style>
	canvas {
		display: block;
	}
</style>
