<script lang="ts">
	/**
	 * Plan 301: the part model viewer. Every part of the loaded content (stock and enabled mods), one
	 * at a time or in a row, built by the game's part factory on a grid floor, with its attach nodes,
	 * physics shape, deploy and articulation, and the numbers beside it. Under Developer → Parts (plan 375). The address is a link to what is on screen, e.g.
	 * `/dev/parts?part=stock.rcs-block&compare=stock.tank-small,stock.tank-medium&nodes=1`.
	 */
	import { onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import type { PartDefinition } from '@orbital/core';
	import type {
		PartViewer,
		PartViewerOptions,
		PartViewerStats,
		ViewerLabel
	} from '@orbital/renderer/part-viewer';
	import { loadContent, partShapesOf } from '../../../lib/catalog';
	import {
		categoriesOf,
		categoryOf,
		matchesQuery,
		sortParts
	} from '../../../lib/editor/categories';
	import { rendererBackend } from '../../../lib/graphics';
	import { modelProviders } from '../../../lib/mods/asset-models';
	import {
		familyMembers,
		groupByCategory,
		idList,
		parseViewerQuery,
		shownParts,
		viewerQueryString,
		type ViewerQuery
	} from '../../../lib/dev/part-viewer';

	let host: HTMLDivElement;
	let viewer: PartViewer | null = null;
	let parts = $state<PartDefinition[]>([]);
	let categoryOfPart = $state<(p: PartDefinition) => string>(() => '');
	let categories = $state<{ id: string; label: string }[]>([]);
	let view = $state<ViewerQuery>(parseViewerQuery(''));
	let search = $state('');
	let stats = $state<PartViewerStats[]>([]);
	let labels = $state<ViewerLabel[]>([]);
	let counts = $state({ calls: 0, triangles: 0 });
	let backendName = $state('…');
	let error = $state('');
	let ready = $state(false);
	let compareText = $state('');

	const byId = $derived(new Map(parts.map((p) => [p.id as string, p])));
	const groups = $derived(
		groupByCategory(
			parts.filter((p) => matchesQuery(p, search)),
			(p) => categoryOfPart(p),
			categories
		)
	);
	const shown = $derived(shownParts(view));
	const articulated = $derived(stats.some((s) => s.drives.articulation !== null));
	const deployable = $derived(stats.some((s) => s.drives.deploy));
	const fireable = $derived(stats.some((s) => s.drives.plume || s.drives.puffs || s.drives.lamp));
	const BACKEND_LINKS = ['webgpu', 'webgpu-fallback', 'webgl'] as const;

	function select(id: string): void {
		view = { ...view, part: id, compare: [] };
	}

	function toggleCompare(id: string): void {
		const base = view.compare.length > 0 ? view.compare : view.part ? [view.part] : [];
		const compare = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
		view = { ...view, compare: compare.length > 1 ? compare : [], part: compare[0] ?? view.part };
	}

	function compareFamily(): void {
		const id = view.part ?? view.compare[0];
		if (!id) return;
		const members = familyMembers(
			id,
			sortParts(parts).map((p) => p.id as string)
		);
		view = { ...view, part: id, compare: members.length > 1 ? members : [] };
	}

	function compareCategory(): void {
		const id = view.part ?? view.compare[0];
		const def = id ? byId.get(id) : undefined;
		if (!def) return;
		const c = categoryOfPart(def);
		const members = groups.find((g) => g.id === c)?.parts.map((p) => p.id as string) ?? [];
		view = { ...view, part: id ?? null, compare: members.length > 1 ? members : [] };
	}

	function applyCompareText(): void {
		const compare = idList(compareText);
		view = { ...view, compare: compare.length > 1 ? compare : [], part: compare[0] ?? view.part };
	}

	const fmt = (n: number): string => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(3));
	const vec = (v: readonly number[]): string => `[${v.map(fmt).join(', ')}]`;
	const shapeText = (s: PartViewerStats['shape']): string =>
		!s
			? 'none'
			: s.kind === 'box'
				? `box ${fmt(s.size.x)} × ${fmt(s.size.y)} × ${fmt(s.size.z)} m`
				: `cylinder r ${fmt(s.radius)} h ${fmt(s.height)} m`;

	onMount(() => {
		let disposed = false;
		const ro = new ResizeObserver(() => resize());
		function resize(): void {
			viewer?.setSize(host.clientWidth, host.clientHeight, Math.min(devicePixelRatio, 2));
		}
		(async () => {
			try {
				const loaded = loadContent();
				const modules = loaded.content.modules;
				const cats = categoriesOf(loaded.categories);
				categories = cats;
				categoryOfPart = (p) => categoryOf(p, modules, cats);
				parts = sortParts(loaded.catalog.parts);
				view = parseViewerQuery(location.search);
				if (!view.part && view.compare.length === 0 && parts[0]) view.part = parts[0].id;
				const canvas = document.createElement('canvas');
				canvas.style.width = '100%';
				canvas.style.height = '100%';
				canvas.style.display = 'block';
				canvas.style.touchAction = 'none';
				host.append(canvas);
				const { createPartViewer } = await import('@orbital/renderer/part-viewer');
				const v = await createPartViewer({
					canvas,
					backend: await rendererBackend(),
					shapes: partShapesOf(loaded.catalog),
					visuals: new Map(
						loaded.catalog.parts.flatMap((p) => (p.visual ? [[p.id, p.visual] as const] : []))
					),
					attach: new Map(
						loaded.catalog.parts.flatMap((p) => (p.attach ? [[p.id, p.attach] as const] : []))
					),
					providers: modelProviders(),
					detail: view.detail
				});
				if (disposed) return v.dispose();
				viewer = v;
				backendName = v.backendName;
				ro.observe(host);
				resize();
				v.start(() => {
					labels = v.labels();
					counts = v.counts;
				});
				ready = true;
				(window as unknown as { __partViewer?: PartViewer }).__partViewer = v;
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			}
		})();
		return () => {
			disposed = true;
			ro.disconnect();
			viewer?.dispose();
			viewer = null;
		};
	});

	const viewerOptions = (): Partial<PartViewerOptions> => ({
		nodes: view.nodes,
		shape: view.shape,
		wire: view.wire,
		deploy: view.deploy,
		art: view.art,
		fire: view.fire,
		background: view.bg
	});
	// parts on the canvas, built with the options already set so the framing sees a deployed canopy
	$effect(() => {
		const ids = shown;
		if (!ready || !viewer) return;
		const v = viewer;
		untrack(() => v.setOptions(viewerOptions()));
		v.setParts(ids);
		stats = viewer.stats();
		compareText = view.compare.join(', ');
	});
	// detail rebuilds the models
	$effect(() => {
		const detail = view.detail;
		if (!ready || !viewer) return;
		viewer.setDetail(detail);
		stats = viewer.stats();
	});
	$effect(() => {
		const o = viewerOptions();
		if (!ready || !viewer) return;
		viewer.setOptions(o);
	});
	// the address follows the view
	$effect(() => {
		const keep: Record<string, string> = {};
		const renderer = new URLSearchParams(location.search).get('renderer');
		if (renderer) keep.renderer = renderer;
		const qs = viewerQueryString(view, keep);
		if (!ready) return;
		const next = `${location.pathname}${qs ? `?${qs}` : ''}`;
		if (next !== `${location.pathname}${location.search}`)
			void goto(next, { replace: true, shallow: true });
	});

	function backendHref(b: string): string {
		return `?${viewerQueryString(view, { renderer: b })}`;
	}
</script>

<svelte:head><title>Parts · Developer</title></svelte:head>

<main class:light={view.bg === 'light'} data-testid="part-viewer" data-ready={ready}>
	<aside class="list">
		<h1>Parts <small>{parts.length}</small></h1>
		<input
			type="search"
			placeholder="Search title or id"
			bind:value={search}
			data-testid="part-search"
		/>
		<div class="groups">
			{#each groups as g (g.id)}
				<h2>{g.label} <small>{g.parts.length}</small></h2>
				<ul>
					{#each g.parts as p (p.id)}
						{@const inCompare = view.compare.includes(p.id)}
						<li class:active={shown.includes(p.id)}>
							<button type="button" class="pick" onclick={() => select(p.id)}>
								<span class="title"
									>{p.title}{#if p.catalog?.hidden}<em> hidden</em>{/if}</span
								>
								<span class="id">{p.id}</span>
							</button>
							<button
								type="button"
								class="add"
								class:on={inCompare}
								aria-label={inCompare ? 'Remove from the row' : 'Add to the row'}
								onclick={() => toggleCompare(p.id)}>{inCompare ? '−' : '+'}</button
							>
						</li>
					{/each}
				</ul>
			{/each}
		</div>
	</aside>

	<section class="stage">
		<div class="canvas" bind:this={host}></div>
		<div class="labels" aria-hidden="true">
			{#each labels as l, i (i)}
				<span class="label {l.kind}" style:left="{l.x}px" style:top="{l.y}px">{l.text}</span>
			{/each}
		</div>
		<div class="toolbar">
			<button type="button" onclick={() => viewer?.frame()}>Frame</button>
			<button type="button" onclick={() => viewer?.resetView()}>3/4</button>
			<button type="button" onclick={() => viewer?.view('front')}>Front</button>
			<button type="button" onclick={() => viewer?.view('side')}>Side</button>
			<button type="button" onclick={() => viewer?.view('top')}>Top</button>
			<span class="hint">drag: orbit · right-drag / shift: pan · wheel: zoom</span>
		</div>
		{#if error}<p class="error">{error}</p>{/if}
		<p class="backend">
			{backendName} · {counts.calls} draws · {counts.triangles.toLocaleString()} tris ·
			{#each BACKEND_LINKS as b (b)}
				<a href={backendHref(b)} data-sveltekit-reload>{b}</a>{' '}
			{/each}
		</p>
	</section>

	<aside class="panel">
		<fieldset>
			<legend>View</legend>
			<label><input type="checkbox" bind:checked={view.nodes} /> Attach nodes</label>
			<label><input type="checkbox" bind:checked={view.shape} /> Physics shape</label>
			<label><input type="checkbox" bind:checked={view.wire} /> Wireframe</label>
			<label class:dim={!fireable}
				><input type="checkbox" bind:checked={view.fire} /> Firing (plume, RCS, lamp)</label
			>
			<label
				>Detail <select bind:value={view.detail}
					><option value="low">low</option><option value="medium">medium</option><option
						value="high">high</option
					></select
				></label
			>
			<label
				>Background <select bind:value={view.bg}
					><option value="dark">dark</option><option value="light">light</option></select
				></label
			>
			<label class="slider" class:dim={!deployable}
				>Deploy <input type="range" min="0" max="1" step="0.01" bind:value={view.deploy} /><output
					>{view.deploy.toFixed(2)}</output
				></label
			>
			<label class="slider" class:dim={!articulated}
				>Articulation <input
					type="range"
					min="-1"
					max="1"
					step="0.01"
					bind:value={view.art}
				/><output>{view.art.toFixed(2)}</output></label
			>
		</fieldset>
		<fieldset>
			<legend>Compare row</legend>
			<div class="buttons">
				<button type="button" onclick={compareFamily}>Family</button>
				<button type="button" onclick={compareCategory}>Category</button>
				<button type="button" onclick={() => (view = { ...view, compare: [] })}>Single</button>
			</div>
			<input
				type="text"
				placeholder="ids, comma separated"
				bind:value={compareText}
				onchange={applyCompareText}
			/>
		</fieldset>
		{#each stats as s (s.id)}
			{@const def = byId.get(s.id)}
			<section class="stats" data-testid="part-stats">
				<h3>{def?.title ?? s.id} <small>{s.id}</small></h3>
				<dl>
					<dt>Generator</dt>
					<dd>{s.kind}</dd>
					<dt>Triangles</dt>
					<dd>{s.triangles.toLocaleString()} in {s.meshes} meshes</dd>
					<dt>Slots</dt>
					<dd>{s.slots.length}: {s.slots.join(', ')}</dd>
					<dt>Mass</dt>
					<dd>{def ? `${fmt(def.mass)} kg` : '—'}</dd>
					<dt>Shape</dt>
					<dd>{shapeText(s.shape)}</dd>
					<dt>Bounds</dt>
					<dd>{s.bounds.map(fmt).join(' × ')} m</dd>
					<dt>Drives</dt>
					<dd>
						{[
							s.drives.deploy && 'deploy',
							s.drives.articulation && `articulation (${s.drives.articulation})`,
							s.drives.plume && 'plume',
							s.drives.puffs && 'puffs',
							s.drives.lamp && 'lamp'
						]
							.filter(Boolean)
							.join(', ') || 'none'}
					</dd>
				</dl>
				{#if Object.keys(s.params).length}
					<pre>{JSON.stringify(s.params, null, 1)}</pre>
				{/if}
				<table>
					<thead><tr><th>node</th><th>pos</th><th>dir</th><th>size</th></tr></thead>
					<tbody>
						{#each Object.entries(s.nodes) as [name, n] (name)}
							<tr
								><td>{name}</td><td>{vec(n.pos)}</td><td>{vec(n.dir)}</td><td
									>{n.size === undefined ? '—' : fmt(n.size)}</td
								></tr
							>
						{/each}
					</tbody>
				</table>
			</section>
		{/each}
	</aside>
</main>

<style>
	main {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: 17rem 1fr 21rem;
		background: #0d1014;
		color: #e5e7eb;
		font:
			12px/1.4 system-ui,
			sans-serif;
	}
	aside {
		overflow: auto;
		background: #13171c;
		padding: 10px;
	}
	.list {
		display: flex;
		flex-direction: column;
		border-right: 1px solid #222831;
	}
	.panel {
		border-left: 1px solid #222831;
	}
	h1 {
		font-size: 14px;
		margin: 0 0 6px;
	}
	h2 {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: #94a3b8;
		margin: 10px 0 4px;
	}
	h3 {
		font-size: 13px;
		margin: 0 0 4px;
	}
	small {
		color: #8b95a3;
		font-weight: normal;
	}
	input[type='search'],
	input[type='text'] {
		width: 100%;
		box-sizing: border-box;
		background: #0b0e12;
		color: inherit;
		border: 1px solid #2a313b;
		padding: 4px 6px;
	}
	.groups {
		overflow: auto;
		flex: 1;
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: flex;
		align-items: stretch;
	}
	li.active .pick {
		background: #1f3a52;
	}
	button {
		background: #1d232b;
		color: inherit;
		border: 1px solid #2a313b;
		border-radius: 3px;
		padding: 3px 7px;
		cursor: pointer;
		font: inherit;
	}
	button:hover {
		background: #27303a;
	}
	.pick {
		flex: 1;
		text-align: left;
		display: flex;
		flex-direction: column;
		border: 0;
		background: transparent;
		padding: 3px 4px;
	}
	.pick .id {
		color: #8b95a3;
		font:
			10px ui-monospace,
			monospace;
	}
	.pick em {
		margin-left: 0.5em;
		color: #fbbf24;
		font-style: normal;
		font-size: 10px;
	}
	.add {
		width: 24px;
		padding: 0;
		border: 0;
		background: transparent;
		color: #8b95a3;
	}
	.add.on {
		color: #22d3ee;
	}
	.stage {
		position: relative;
		overflow: hidden;
	}
	.canvas {
		position: absolute;
		inset: 0;
	}
	.labels {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.label {
		position: absolute;
		transform: translate(-50%, 4px);
		white-space: nowrap;
		font:
			11px ui-monospace,
			monospace;
		padding: 1px 4px;
		border-radius: 3px;
		background: rgb(0 0 0 / 55%);
		color: #f1f5f9;
	}
	.label.node {
		transform: translate(6px, -50%);
		color: #67e8f9;
		background: rgb(0 0 0 / 40%);
	}
	.toolbar {
		position: absolute;
		top: 8px;
		left: 8px;
		display: flex;
		gap: 4px;
		align-items: center;
	}
	.hint {
		margin-left: 8px;
		color: #8b95a3;
	}
	main.light .hint,
	main.light .backend {
		color: #334155;
	}
	main.light .backend a {
		color: #0369a1;
	}
	.backend {
		position: absolute;
		bottom: 6px;
		left: 8px;
		margin: 0;
		color: #8b95a3;
	}
	.backend a {
		color: #7dd3fc;
	}
	.error {
		position: absolute;
		top: 40px;
		left: 8px;
		color: #fca5a5;
	}
	fieldset {
		border: 1px solid #2a313b;
		margin: 0 0 10px;
		padding: 6px 8px;
	}
	legend {
		color: #94a3b8;
	}
	label {
		display: flex;
		gap: 6px;
		align-items: center;
		margin: 3px 0;
	}
	label.dim {
		opacity: 0.55;
	}
	.slider input {
		flex: 1;
	}
	output {
		width: 3em;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	select {
		margin-left: auto;
		background: #0b0e12;
		color: inherit;
		border: 1px solid #2a313b;
	}
	.buttons {
		display: flex;
		gap: 4px;
		margin-bottom: 6px;
	}
	.stats {
		border-top: 1px solid #222831;
		padding: 8px 0;
	}
	dl {
		display: grid;
		grid-template-columns: 5.5em 1fr;
		gap: 2px 6px;
		margin: 0 0 6px;
	}
	dt {
		color: #8b95a3;
	}
	dd {
		margin: 0;
		word-break: break-word;
	}
	pre {
		background: #0b0e12;
		padding: 4px 6px;
		margin: 0 0 6px;
		font-size: 10px;
		white-space: pre-wrap;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font:
			10px ui-monospace,
			monospace;
	}
	td,
	th {
		text-align: left;
		padding: 1px 3px;
		border-bottom: 1px solid #1f252d;
	}
</style>
