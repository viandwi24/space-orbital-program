<!--
	The performance overlay (plan 294): a net_graph-style read-out. Svelte renders it once; a 10 Hz
	timer pulls a sample, writes the digits with `textContent` and draws the graphs on small canvases,
	so nothing reactive runs per frame or per tick. Decorative: hidden from assistive tech, no focus,
	no pointer.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { settings } from '../settings/settings.svelte';
	import {
		Ring,
		formatCount,
		formatFps,
		formatMb,
		formatMs,
		formatRenderer,
		isSpike,
		type PerfSample
	} from './perf-stats';
	import { BUDGET_60_MS } from '../debug/frame-histogram';

	let { sample }: { sample: () => PerfSample | null } = $props();

	/** Samples per graph: five seconds at 10 Hz. */
	const HISTORY = 50;
	const TICK_MS = 100;

	let root: HTMLDivElement;
	let fpsText: HTMLElement;
	let p50Text: HTMLElement;
	let maxText: HTMLElement;
	let gpuText: HTMLElement;
	let simText: HTMLElement;
	let rendererText: HTMLElement;
	let countsText: HTMLElement;
	let fpsCanvas: HTMLCanvasElement;
	let frameCanvas: HTMLCanvasElement;
	let gpuCanvas: HTMLCanvasElement;
	let simCanvas: HTMLCanvasElement;

	interface Colours {
		line: string;
		ok: string;
		warn: string;
		danger: string;
		grid: string;
	}
	let colours: Colours = {
		line: '#8fa9f0',
		ok: '#7bd88f',
		warn: '#ffb86b',
		danger: '#ff8a8e',
		grid: '#fff3'
	};
	const readColours = (): Colours => {
		const css = getComputedStyle(root);
		const v = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
		return {
			line: v('--accent-text', colours.line),
			ok: v('--ok', colours.ok),
			warn: v('--warn', colours.warn),
			danger: v('--danger', colours.danger),
			grid: v('--border-strong', colours.grid)
		};
	};
	// high contrast changes the tokens: read them again (not per tick: that would restyle)
	$effect(() => {
		void settings.ui.highContrast;
		if (root) colours = readColours();
	});

	/** Each canvas's context and size in device pixels, kept by a ResizeObserver so a tick never reads layout. */
	const surfaces = new Map<
		HTMLCanvasElement,
		{ ctx: CanvasRenderingContext2D | null; w: number; h: number }
	>();

	/** Bars of `values`, newest on the right, scaled to `top`; `colourOf` picks each bar's colour. */
	function bars(
		canvas: HTMLCanvasElement,
		values: Ring,
		top: number,
		colourOf: (i: number, v: number) => string,
		guide?: number
	): void {
		const surface = surfaces.get(canvas);
		if (!surface?.ctx || surface.w === 0) return;
		const { ctx, w, h } = surface;
		ctx.clearRect(0, 0, w, h);
		const step = w / HISTORY;
		const bw = Math.max(1, step - 1);
		const x0 = w - values.length * step;
		let fill = '';
		for (let i = 0; i < values.length; i++) {
			const v = values.at(i);
			if (!Number.isFinite(v) || v <= 0) continue;
			const bh = Math.max(1, Math.min(1, v / top) * h);
			const c = colourOf(i, v);
			if (c !== fill) ctx.fillStyle = fill = c;
			ctx.fillRect(x0 + i * step, h - bh, bw, bh);
		}
		if (guide !== undefined && guide < top) {
			ctx.fillStyle = colours.grid;
			ctx.fillRect(0, Math.round(h - (guide / top) * h), w, 1);
		}
	}

	onMount(() => {
		colours = readColours();
		const fps = new Ring(HISTORY);
		const p50 = new Ring(HISTORY);
		const max = new Ring(HISTORY);
		const gpu = new Ring(HISTORY);
		const sim = new Ring(HISTORY);
		const canvases = [fpsCanvas, frameCanvas, gpuCanvas, simCanvas];
		const observer = new ResizeObserver(() => {
			const dpr = window.devicePixelRatio || 1;
			for (const c of canvases) {
				const w = Math.round(c.clientWidth * dpr);
				const h = Math.round(c.clientHeight * dpr);
				c.width = w;
				c.height = h;
				surfaces.set(c, { ctx: c.getContext('2d'), w, h });
			}
		});
		observer.observe(root);
		let cost = 0;
		const tick = (): void => {
			const t0 = performance.now();
			const s = sample();
			if (!s) return;
			fps.push(s.fps);
			p50.push(s.p50);
			max.push(s.max);
			gpu.push(s.gpuMs ?? NaN);
			sim.push(s.simMs ?? NaN);
			const spike = s.frames > 0 && isSpike(s.max, s.p50);
			fpsText.textContent = formatFps(s.fps);
			p50Text.textContent = s.frames > 0 ? formatMs(s.p50) : formatMs(null);
			maxText.textContent = s.frames > 0 ? `${spike ? '▲' : '↑'}${formatMs(s.max)}` : '';
			maxText.classList.toggle('spike', spike);
			gpuText.textContent = formatMs(s.gpuMs);
			simText.textContent = formatMs(s.simMs);
			rendererText.textContent = formatRenderer(s);
			countsText.textContent = `${formatCount(s.drawCalls)} calls · ${formatCount(s.triangles)} tris · ${formatMb(s.heapBytes)}`;

			const fpsTop = Math.max(60, fps.max());
			bars(
				fpsCanvas,
				fps,
				fpsTop,
				(_, v) => (v >= 55 ? colours.ok : v >= 28 ? colours.warn : colours.danger),
				60
			);
			const frameTop = Math.max(2 * BUDGET_60_MS, max.max());
			bars(
				frameCanvas,
				max,
				frameTop,
				(i, v) => (isSpike(v, p50.at(i)) ? colours.danger : colours.line),
				BUDGET_60_MS
			);
			bars(gpuCanvas, gpu, Math.max(BUDGET_60_MS, gpu.max()), () => colours.line, BUDGET_60_MS);
			bars(simCanvas, sim, Math.max(4, sim.max()), () => colours.line);
			// the tick's own cost, smoothed, for the plan's budget check (journal 294)
			const dt = performance.now() - t0;
			cost = cost === 0 ? dt : cost * 0.9 + dt * 0.1;
			root.dataset.tickMs = cost.toFixed(3);
		};
		const timer = setInterval(tick, TICK_MS);
		return () => {
			clearInterval(timer);
			observer.disconnect();
		};
	});
</script>

<div class="perf" bind:this={root} aria-hidden="true" data-testid="perf-overlay">
	<span class="k">FPS</span><span class="v" bind:this={fpsText}>—</span>
	<canvas bind:this={fpsCanvas}></canvas>
	<span class="k">ms</span><span class="v"
		><span bind:this={p50Text}>—</span> <span class="max" bind:this={maxText}></span></span
	>
	<canvas bind:this={frameCanvas}></canvas>
	<span class="k">GPU</span><span class="v" bind:this={gpuText}>—</span>
	<canvas bind:this={gpuCanvas}></canvas>
	<span class="k">SIM</span><span class="v" bind:this={simText}>—</span>
	<canvas bind:this={simCanvas}></canvas>
	<span class="line" bind:this={rendererText}>—</span>
	<span class="line" bind:this={countsText}>—</span>
</div>

<style>
	.perf {
		display: grid;
		grid-template-columns: 2.25rem 5.5rem 6.25rem;
		align-items: center;
		column-gap: 0.375rem;
		row-gap: 0.125rem;
		width: max-content;
		/* in a column (the flight's top right) it keeps its own width at the right edge */
		align-self: flex-end;
		padding: 0.375rem 0.5rem;
		border-radius: var(--radius-tile);
		border: 1px solid var(--border-subtle);
		/* no backdrop blur: it would cost GPU time every frame on the thing it measures */
		background: rgb(0 0 0 / 0.6);
		color: var(--text-body);
		font-family: var(--font-mono);
		font-size: var(--t-small);
		font-variant-numeric: tabular-nums;
		line-height: 1.25;
		pointer-events: none;
		user-select: none;
	}
	:global(:root[data-contrast='more']) .perf {
		background: var(--surface-solid);
		border-color: var(--border-strong);
	}
	.k {
		color: var(--text-muted);
		letter-spacing: var(--tracking-chip);
	}
	.v {
		white-space: nowrap;
		text-align: right;
	}
	.max {
		color: var(--text-muted);
	}
	.max:global(.spike) {
		color: var(--danger);
	}
	canvas {
		display: block;
		width: 100%;
		height: 1rem;
	}
	.line {
		grid-column: 1 / -1;
		color: var(--text-muted);
		white-space: nowrap;
	}
</style>
