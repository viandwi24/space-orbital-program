<script lang="ts">
	/**
	 * Plan 341: the crew line-up. Every outfit and every expression of the crew character side by
	 * side in 3D, beside a pod-sized drum and a 1.7 m pole, and the portraits below. Development only:
	 * not linked from the game.
	 */
	import { onMount } from 'svelte';
	import type { CrewLineup } from '@orbital/renderer/crew-lineup';
	import {
		EXPRESSIONS,
		OUTFIT_IDS,
		OUTFITS,
		SKIN_NAMES,
		appearanceOf,
		portraitUrl,
		type Skin
	} from '@orbital/renderer/crew';

	let canvas: HTMLCanvasElement;
	let lineup = $state.raw<CrewLineup | null>(null);
	let action = $state<'idle' | 'walk' | 'wave' | 'work'>('idle');
	let skin = $state<Skin | 'by-id'>('by-id');
	const startView = (() => {
		const v =
			typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('view');
		return v === 'outfits' || v === 'faces' || v === 'close' ? v : 'all';
	})();
	let view = $state<'all' | 'outfits' | 'faces' | 'close'>(startView);
	let labels = $state<{ text: string; x: number; y: number }[]>([]);
	let error = $state('');

	const look = (id: string) => {
		const a = appearanceOf(id);
		return skin === 'by-id' ? a : { ...a, skin };
	};

	onMount(() => {
		let gone = false;
		let timer = 0;
		void import('@orbital/renderer/crew-lineup')
			.then(({ createCrewLineup }) => {
				if (gone) return;
				lineup = createCrewLineup(canvas);
				timer = window.setInterval(() => (labels = lineup?.labels() ?? []), 250);
			})
			.catch((e: unknown) => (error = String(e)));
		return () => {
			gone = true;
			clearInterval(timer);
			lineup?.dispose();
			lineup = null;
		};
	});

	$effect(() => lineup?.setAction(action));
	$effect(() => lineup?.setSkin(skin));
	$effect(() => lineup?.setView(view));
</script>

<svelte:head><title>Crew line-up · dev</title></svelte:head>

<main class="crew">
	<header>
		<h1>Crew line-up</h1>
		<label
			>Pose
			<select bind:value={action} data-testid="crew-action">
				<option value="idle">Idle</option>
				<option value="walk">Walk</option>
				<option value="wave">Wave</option>
				<option value="work">Work</option>
			</select>
		</label>
		<label
			>View
			<select bind:value={view} data-testid="crew-view">
				<option value="all">All</option>
				<option value="outfits">Outfits</option>
				<option value="faces">Expressions</option>
				<option value="close">Close-up</option>
			</select>
		</label>
		<label
			>Skin
			<select bind:value={skin} data-testid="crew-skin">
				<option value="by-id">By crew id</option>
				{#each SKIN_NAMES as s (s)}<option value={s}>{s}</option>{/each}
			</select>
		</label>
		<span class="hint"
			>Back row: outfits. Front row: expressions. Left: a 1.25 m × 1 m pod drum and a 1.7 m pole.</span
		>
	</header>
	{#if error}<p class="error">{error}</p>{/if}
	<div class="stage">
		<canvas bind:this={canvas} data-testid="crew-canvas"></canvas>
		{#each labels as l, i (i)}
			<span class="label" style="left:{l.x}px;top:{l.y}px">{l.text}</span>
		{/each}
	</div>
	<section>
		<h2>Portraits: outfits</h2>
		<div class="grid">
			{#each OUTFIT_IDS as o, i (o)}
				<figure>
					<img
						alt={OUTFITS[o].title}
						src={portraitUrl({ outfit: o, appearance: look(`lineup-${i}`) }, 96)}
						width="96"
						height="96"
					/>
					<figcaption>{OUTFITS[o].title}</figcaption>
				</figure>
			{/each}
		</div>
		<h2>Portraits: expressions</h2>
		<div class="grid">
			{#each EXPRESSIONS as e, i (e)}
				<figure>
					<img
						alt={e}
						src={portraitUrl(
							{ outfit: 'flight', appearance: look(`face-${i}`), expression: e },
							96
						)}
						width="96"
						height="96"
					/>
					<figcaption>{e}</figcaption>
				</figure>
			{/each}
		</div>
	</section>
</main>

<style>
	.crew {
		min-height: 100vh;
		padding: 1rem;
		box-sizing: border-box;
		background: #10151f;
		color: #e6ebf2;
		font-family: system-ui, sans-serif;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		align-items: center;
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 400;
	}
	h2 {
		font-size: 0.9rem;
		font-weight: 600;
		margin: 1rem 0 0.5rem;
	}
	.hint {
		font-size: 0.8rem;
		color: #9aa6b8;
	}
	.stage {
		position: relative;
		margin-top: 0.75rem;
	}
	canvas {
		display: block;
		width: 100%;
		height: 62vh;
		border-radius: 8px;
	}
	.label {
		position: absolute;
		transform: translate(-50%, 0);
		font-size: 0.7rem;
		color: #cfd8e6;
		white-space: nowrap;
		pointer-events: none;
	}
	.grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	figure {
		margin: 0;
		display: grid;
		justify-items: center;
		gap: 0.25rem;
		font-size: 0.7rem;
		color: #9aa6b8;
	}
	.error {
		color: #ff8a80;
	}
</style>
