<script lang="ts">
	/**
	 * Plan 261, phase 0: the spike page. The same sky drawn by the WebGL renderer (our GLSL) and by
	 * three's WebGPU renderer (TSL), measured per frame at pixel ratio 1 and 2. Development only: it
	 * exists on the plan's branch and is not linked from the game. Phase 6 adds `webgpu-lut`: the
	 * same air through Hillaire's tables, with multiple scattering.
	 */
	import { onMount } from 'svelte';
	import type { SkySpike, SpikeBackend, SpikeView } from '@orbital/renderer/webgpu-spike';

	const VIEWS: Record<string, SpikeView> = {
		pad: { altitude: 20, sunElevation: 0.6, pitch: 0.12 },
		sunset: { altitude: 20, sunElevation: 0.02, pitch: 0.12 },
		'12 km': { altitude: 12_000, sunElevation: 0.25, pitch: -0.05 },
		orbit: { altitude: 100_000, sunElevation: 0.15, pitch: -0.35 }
	};
	const BACKENDS: SpikeBackend[] = [
		'webgl',
		'webgpu',
		'webgpu-fallback',
		'webgpu-lut',
		'webgpu-lut-fallback'
	];

	let host: HTMLDivElement;
	let backend = $state<SpikeBackend>('webgpu-lut');
	let octaves = $state(0);
	let ratio = $state(2);
	let view = $state('pad');
	let status = $state('');
	let rows = $state<Array<Record<string, string | number>>>([]);
	let gpuAvailable = $state<boolean | null>(null);
	let spike: SkySpike | null = null;
	let canvas: HTMLCanvasElement | null = null;

	async function make(b: SpikeBackend, oct: number): Promise<SkySpike> {
		spike?.dispose();
		canvas?.remove();
		canvas = document.createElement('canvas');
		canvas.style.width = '100%';
		canvas.style.height = '100%';
		host.append(canvas);
		const { createSkySpike } = await import('@orbital/renderer/webgpu-spike');
		spike = await createSkySpike(canvas, { backend: b, noiseOctaves: oct });
		return spike;
	}

	async function measure(b: SpikeBackend, oct: number, r: number, v: string): Promise<number> {
		const s = await make(b, oct);
		s.setSize(host.clientWidth, host.clientHeight, r);
		s.setView(VIEWS[v]!);
		// compile and warm up, then the minimum of six runs of 10 frames (journal 054's "sync")
		await s.benchmark(5);
		let best = Infinity;
		for (let k = 0; k < 6; k++) best = Math.min(best, await s.benchmark(10));
		return Math.round(best * 100) / 100;
	}

	async function one(): Promise<void> {
		status = 'measuring…';
		const ms = await measure(backend, octaves, ratio, view);
		rows = [
			...rows,
			{
				backend: spike?.backend ?? backend,
				octaves,
				ratio,
				view,
				ms,
				bake: spike?.bakeMs ?? '',
				px: `${canvas?.width}×${canvas?.height}`
			}
		];
		status = '';
	}

	async function all(): Promise<void> {
		rows = [];
		for (const oct of [0, 8])
			for (const r of [1, 2])
				for (const v of Object.keys(VIEWS))
					for (const b of BACKENDS) {
						status = `${b} · ${oct} octaves · ratio ${r} · ${v}`;
						const ms = await measure(b, oct, r, v);
						rows = [
							...rows,
							{
								backend: spike?.backend ?? b,
								octaves: oct,
								ratio: r,
								view: v,
								ms,
								bake: spike?.bakeMs ?? '',
								px: `${canvas?.width}×${canvas?.height}`
							}
						];
					}
		status = 'done';
		(window as unknown as { __spike: unknown }).__spike = { userAgent: navigator.userAgent, rows };
	}

	/** Draws the chosen backend, ratio and view, to look at it. */
	async function show(): Promise<void> {
		const s = await make(backend, octaves);
		s.setSize(host.clientWidth, host.clientHeight, ratio);
		s.setView(VIEWS[view]!);
		s.draw();
	}

	onMount(() => {
		gpuAvailable = 'gpu' in navigator;
		void show();
		return () => spike?.dispose();
	});

	const json = $derived(JSON.stringify(rows, null, 1));
</script>

<svelte:head><title>WebGPU spike (plan 261)</title></svelte:head>

<main>
	<div class="view" bind:this={host} data-testid="spike-canvas"></div>
	<aside>
		<h1>WebGPU spike · plan 261</h1>
		<p>
			WebGPU in this browser: <b data-testid="spike-gpu"
				>{gpuAvailable === null ? '…' : gpuAvailable ? 'yes' : 'no'}</b
			>
		</p>
		<label
			>Backend <select bind:value={backend}
				>{#each BACKENDS as b (b)}<option value={b}>{b}</option>{/each}</select
			></label
		>
		<label
			>Noise octaves <select bind:value={octaves}
				><option value={0}>0</option><option value={8}>8</option><option value={16}>16</option
				></select
			></label
		>
		<label
			>Pixel ratio <select bind:value={ratio}
				><option value={1}>1</option><option value={1.5}>1.5</option><option value={2}>2</option
				></select
			></label
		>
		<label
			>View <select bind:value={view}
				>{#each Object.keys(VIEWS) as v (v)}<option value={v}>{v}</option>{/each}</select
			></label
		>
		<div class="buttons">
			<button type="button" onclick={() => void show()} data-testid="spike-show">Show</button>
			<button type="button" onclick={() => void one()} data-testid="spike-one">Measure this</button>
			<button type="button" onclick={() => void all()} data-testid="spike-all"
				>Run the whole matrix</button
			>
		</div>
		<p class="status" data-testid="spike-status">{status}</p>
		<table>
			<thead
				><tr><th>backend</th><th>oct</th><th>ratio</th><th>view</th><th>px</th><th>ms</th><th>bake</th></tr
				></thead
			>
			<tbody>
				{#each rows as r, i (i)}
					<tr
						><td>{r.backend}</td><td>{r.octaves}</td><td>{r.ratio}</td><td>{r.view}</td><td
							>{r.px}</td
						><td class="num">{r.ms}</td><td class="num">{r.bake}</td></tr
					>
				{/each}
			</tbody>
		</table>
		{#if rows.length}<textarea readonly rows="6" data-testid="spike-json">{json}</textarea>{/if}
	</aside>
</main>

<style>
	main {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: 1fr 22rem;
		background: #000;
		color: #e5e5e5;
		font:
			13px/1.4 system-ui,
			sans-serif;
	}
	.view {
		position: relative;
		overflow: hidden;
	}
	aside {
		padding: 12px;
		overflow: auto;
		background: #111;
	}
	h1 {
		font-size: 15px;
		margin: 0 0 8px;
	}
	label {
		display: flex;
		justify-content: space-between;
		margin: 4px 0;
	}
	.buttons {
		display: flex;
		gap: 6px;
		margin: 8px 0;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 12px;
	}
	td,
	th {
		padding: 2px 4px;
		border-bottom: 1px solid #222;
		text-align: left;
	}
	.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	textarea {
		width: 100%;
		margin-top: 8px;
		background: #000;
		color: #9f9;
		font: 11px monospace;
	}
</style>
