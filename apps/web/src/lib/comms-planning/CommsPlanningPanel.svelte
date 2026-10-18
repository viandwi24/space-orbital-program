<script lang="ts">
	/**
	 * Comms planning in the Mission Center (plan 118, ADR 0163 point 6): the contact timeline, the
	 * coverage map and the constellation planner. Every answer comes from the planning Worker.
	 */
	import {
		GRAVITATIONAL_CONSTANT,
		type BodyDefinition,
		type PartDefinition,
		type Snapshot
	} from '@orbital/core';
	import type { DeploymentPlan } from '@orbital/kepler';
	import { onDestroy } from 'svelte';
	import { formatPercent } from '../format';
	import Button from '../ui/Button.svelte';
	import Segmented from '../ui/Segmented.svelte';
	import type { CoverageGrid } from './coverage';
	import { createPlanner, type Planner } from './planner';
	import {
		HORIZONS,
		PLANNING_TABS,
		bodyChoices,
		coveragePixels,
		defaultReceiver,
		deploymentRows,
		linkedSummary,
		peerChoices,
		planningScene,
		vesselChoices,
		windowRows,
		type Antenna,
		type PlanningTab,
		type WindowRow
	} from './planning-model';

	let {
		snapshot,
		bodies,
		parts,
		antennas,
		onclose
	}: {
		snapshot: Snapshot | null;
		bodies: readonly BodyDefinition[];
		parts: readonly PartDefinition[];
		antennas: readonly Antenna[];
		onclose: () => void;
	} = $props();

	let planner: Planner | null = null;
	const ensure = (): Planner => (planner ??= createPlanner());
	onDestroy(() => planner?.dispose());

	let tab = $state<PlanningTab>('timeline');
	let busy = $state(false);
	let error = $state<string | null>(null);

	// the scene is taken when the player asks, so a plan stays tied to its snapshot time
	const scene = $derived(planningScene(snapshot, bodies, parts, antennas));
	const vessels = $derived(scene ? vesselChoices(scene.nodes) : []);
	let from = $state('');
	let to = $state('');
	let horizon = $state<number>(HORIZONS[1].value);
	$effect(() => {
		if (!vessels.some((v) => v.value === from)) from = vessels[0]?.value ?? '';
	});
	const peers = $derived(scene && from ? peerChoices(scene.nodes, from) : []);
	$effect(() => {
		if (!peers.some((p) => p.value === to)) to = peers[0]?.value ?? '';
	});
	let rows = $state.raw<WindowRow[] | null>(null);
	let summary = $state('');

	const surfaces = $derived(bodyChoices(bodies));
	let coverBody = $state('');
	let receiver = $state('');
	$effect(() => {
		if (!surfaces.some((b) => b.value === coverBody)) coverBody = surfaces[0]?.value ?? '';
		if (!antennas.some((a) => a.id === receiver)) receiver = defaultReceiver(antennas)?.id ?? '';
	});
	let canvas = $state<HTMLCanvasElement | null>(null);
	let grid = $state.raw<CoverageGrid | null>(null);

	let planBody = $state('');
	let altitudeKm = $state(1000);
	let count = $state(3);
	let side = $state<'above' | 'below'>('above');
	$effect(() => {
		if (!surfaces.some((b) => b.value === planBody)) planBody = surfaces[0]?.value ?? '';
	});
	let deployment = $state.raw<{ plan: DeploymentPlan; radius: number } | null>(null);

	async function run<T>(job: () => Promise<T>): Promise<T | null> {
		busy = true;
		error = null;
		try {
			return await job();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			return null;
		} finally {
			busy = false;
		}
	}

	async function planTimeline(): Promise<void> {
		const s = scene;
		const a = s?.nodes.find((n) => n.id === from);
		const b = s?.nodes.find((n) => n.id === to);
		if (!s || !a || !b) return;
		const t = await run(() =>
			ensure().plan({ kind: 'timeline', world: s.world, a, b, from: s.t, horizon })
		);
		if (!t) return;
		rows = windowRows(t, s.t);
		summary = linkedSummary(t);
	}

	async function planCoverage(): Promise<void> {
		const s = scene;
		const rx = antennas.find((a) => a.id === receiver);
		if (!s || !rx || !coverBody) return;
		const g = await run(() =>
			ensure().plan({
				kind: 'coverage',
				world: s.world,
				input: { body: coverBody, nodes: s.nodes, range: rx.range, from: s.t, horizon: 6 * 3600 }
			})
		);
		if (!g) return;
		grid = g;
	}

	$effect(() => {
		if (!grid || !canvas) return;
		canvas.width = grid.width;
		canvas.height = grid.height;
		const pixels = coveragePixels(grid);
		canvas
			.getContext('2d')
			?.putImageData(new ImageData(new Uint8ClampedArray(pixels), grid.width, grid.height), 0, 0);
	});

	async function planConstellation(): Promise<void> {
		const body = bodies.find((b) => b.id === planBody);
		if (!body) return;
		const radius = body.radius + altitudeKm * 1000;
		const plan = await run(() =>
			ensure().plan({
				kind: 'constellation',
				input: {
					mu: GRAVITATIONAL_CONSTANT * body.mass,
					bodyRadius: body.radius,
					radius,
					count,
					side,
					clearance: (body.atmosphere?.height ?? 0) + 10_000
				}
			})
		);
		deployment = plan ? { plan, radius: body.radius } : null;
	}
</script>

<section class="planning" aria-label="Comms planning" data-testid="mc-planning">
	<header>
		<h2>Comms planning</h2>
		<Button variant="ghost" onclick={onclose} data-testid="mc-planning-close">Close</Button>
	</header>
	<Segmented
		label="Tool"
		value={tab}
		options={PLANNING_TABS}
		onchange={(t) => (tab = t)}
		testid="mc-planning-tab"
	/>

	{#if tab === 'timeline'}
		{#if !scene}
			<p class="calm">The comms network is off in this world.</p>
		{:else if vessels.length === 0}
			<p class="calm">No vessel with an antenna to plan for.</p>
		{:else}
			<div class="fields">
				<label
					><span>Vessel</span><select bind:value={from} data-testid="mc-plan-from"
						>{#each vessels as v (v.value)}<option value={v.value}>{v.label}</option>{/each}</select
					></label
				>
				<label
					><span>With</span><select bind:value={to} data-testid="mc-plan-to"
						>{#each peers as p (p.value)}<option value={p.value}>{p.label}</option>{/each}</select
					></label
				>
				<label
					><span>Next</span><select bind:value={horizon} data-testid="mc-plan-horizon"
						>{#each HORIZONS as h (h.value)}<option value={h.value}>{h.label}</option
							>{/each}</select
					></label
				>
				<Button
					variant="primary"
					disabled={busy || !to}
					onclick={() => void planTimeline()}
					data-testid="mc-plan-timeline">Plan</Button
				>
			</div>
			{#if rows}
				<p class="sub" data-testid="mc-plan-summary">{summary}</p>
				<div class="bar" aria-hidden="true">
					{#each rows as r (r.key)}<span style:left="{r.left}%" style:width="{r.width}%"
						></span>{/each}
				</div>
				<ul class="list" data-testid="mc-plan-windows">
					{#each rows as r (r.key)}<li><span>{r.when}</span><span class="num">{r.length}</span></li>
					{:else}<li class="calm">No contact in this span.</li>{/each}
				</ul>
			{/if}
		{/if}
	{:else if tab === 'coverage'}
		{#if !scene}
			<p class="calm">The comms network is off in this world.</p>
		{:else}
			<div class="fields">
				<label
					><span>Body</span><select bind:value={coverBody} data-testid="mc-cover-body"
						>{#each surfaces as b (b.value)}<option value={b.value}>{b.label}</option
							>{/each}</select
					></label
				>
				<label
					><span>Receiver</span><select bind:value={receiver} data-testid="mc-cover-receiver"
						>{#each antennas as a (a.id)}<option value={a.id}>{a.label}</option>{/each}</select
					></label
				>
				<Button
					variant="primary"
					disabled={busy}
					onclick={() => void planCoverage()}
					data-testid="mc-plan-coverage">Map</Button
				>
			</div>
			{#if grid}
				<canvas
					bind:this={canvas}
					class="map"
					aria-label="Coverage map, longitude across, latitude down"
				></canvas>
				<p class="sub" data-testid="mc-cover-mean">
					Covered {formatPercent(grid.mean)} of the time over the next 6 h, by area
				</p>
				{#if grid.mean === 0}
					<p class="calm" data-testid="mc-cover-none">
						Nothing covers this body yet: a station on the ground sees only its own horizon, so
						coverage comes from relays in orbit.
					</p>
				{/if}
			{/if}
		{/if}
	{:else}
		<div class="fields">
			<label
				><span>Body</span><select bind:value={planBody} data-testid="mc-const-body"
					>{#each surfaces as b (b.value)}<option value={b.value}>{b.label}</option>{/each}</select
				></label
			>
			<label
				><span>Altitude, km</span><input
					type="number"
					min="1"
					step="50"
					bind:value={altitudeKm}
					data-testid="mc-const-altitude"
				/></label
			>
			<label
				><span>Satellites</span><input
					type="number"
					min="2"
					max="12"
					bind:value={count}
					data-testid="mc-const-count"
				/></label
			>
			<label
				><span>Deploy from</span><select bind:value={side} data-testid="mc-const-side"
					><option value="above">above</option><option value="below">below</option></select
				></label
			>
			<Button
				variant="primary"
				disabled={busy}
				onclick={() => void planConstellation()}
				data-testid="mc-plan-constellation">Plan</Button
			>
		</div>
		{#if deployment}
			<dl class="facts" data-testid="mc-const-plan">
				{#each deploymentRows(deployment.plan, deployment.radius) as r (r.label)}<dt>{r.label}</dt>
					<dd class="num">{r.value}</dd>{/each}
			</dl>
		{/if}
	{/if}

	{#if error}<p class="why" role="alert" data-testid="mc-plan-error">{error}</p>{/if}
	<p class="note">Planned on conics over spheres: terrain and burns are not in it.</p>
</section>

<style>
	.planning {
		position: absolute;
		left: 50%;
		bottom: var(--space-4, 1rem);
		transform: translateX(-50%);
		width: min(35rem, calc(100% - 2rem));
		max-height: calc(100% - 9rem);
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
		padding: var(--space-4, 1rem);
		border-radius: var(--radius-card, 1rem);
		border: 1px solid var(--border-subtle);
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		backdrop-filter: blur(28px) saturate(160%) brightness(0.4);
		pointer-events: auto;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	h2 {
		margin: 0;
		font-size: var(--t-md, 1rem);
	}
	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: flex-end;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: var(--t-xs, 0.6875rem);
		color: var(--text-muted);
	}
	select,
	input {
		min-height: 2.25rem;
		padding: 0 var(--space-2, 0.5rem);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-tile, 0.5rem);
		background: var(--surface-inset);
		color: var(--text-body, var(--text));
		font: inherit;
		font-size: var(--t-sm, 0.8125rem);
	}
	input {
		width: 6rem;
	}
	.bar {
		position: relative;
		height: 0.5rem;
		border-radius: 999px;
		background: var(--surface-inset);
		overflow: hidden;
	}
	.bar span {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--accent-text);
	}
	.list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.25rem;
		font-size: var(--t-sm, 0.8125rem);
	}
	.list li {
		display: flex;
		justify-content: space-between;
	}
	.map {
		width: 100%;
		aspect-ratio: 2 / 1;
		image-rendering: pixelated;
		border-radius: var(--radius-tile, 0.5rem);
		background: var(--surface-inset);
	}
	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem var(--space-3, 0.75rem);
		margin: 0;
		font-size: var(--t-sm, 0.8125rem);
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		margin: 0;
	}
	.num {
		font-variant-numeric: tabular-nums;
	}
	.sub,
	.calm,
	.note {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--t-sm, 0.8125rem);
	}
	.note {
		font-size: var(--t-xs, 0.6875rem);
	}
	.why {
		margin: 0;
		color: var(--danger, #ff6b6b);
		font-size: var(--t-sm, 0.8125rem);
	}
</style>
