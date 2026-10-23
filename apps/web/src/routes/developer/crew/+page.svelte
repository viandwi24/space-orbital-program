<script lang="ts">
	/**
	 * The Crew tab (plan 341; plan 375, ADR 0313): everything the loaded plugins register for the
	 * crew character, by mod. At the top, the 3D line-up: every outfit and every expression side by
	 * side, beside a pod-sized drum and a 1.7 m pole, playing any registered animation. Below it,
	 * the lists: outfits with their portraits, faces, animations (the one the game uses per role is
	 * marked), looks and portrait images, each with the plugin that registered it.
	 */
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { loadPlugins, type LoadReport, type Registries } from '@orbital/core';
	import type { CrewLineup } from '@orbital/renderer/crew-lineup';
	import {
		animationFor,
		appearanceOf,
		crewContent,
		portraitUrl,
		withSkin,
		type CrewContent
	} from '@orbital/renderer/crew';
	import {
		changeText,
		devPlugins,
		modsOf,
		originsOf,
		readIncludeDisabled,
		saveIncludeDisabled,
		touchedBy,
		type ItemOrigin
	} from '../../../lib/dev/dev-content';
	import { installCrewContent } from '../../../lib/mods/crew-content';

	let canvas: HTMLCanvasElement;
	let lineup = $state.raw<CrewLineup | null>(null);
	let animation = $state('');
	let skin = $state<string>('by-id');
	const startView = (() => {
		const v =
			typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('view');
		return v === 'outfits' || v === 'faces' || v === 'close' ? v : 'all';
	})();
	let view = $state<'all' | 'outfits' | 'faces' | 'close'>(startView);
	let labels = $state<{ text: string; x: number; y: number }[]>([]);
	let error = $state('');
	let content = $state.raw<CrewContent>(crewContent());
	let report = $state.raw<LoadReport | null>(null);
	let outfitOrigins = $state.raw<Map<string, ItemOrigin>>(new Map());
	let modFilter = $state<string | null>(
		typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mod')
	);
	const includeDisabled = readIncludeDisabled();
	let extra = $state.raw<string[]>([]);

	const byOf = (id: string): string => content.by.get(id) ?? '—';
	const mine = (id: string): boolean => modFilter === null || byOf(id) === modFilter;
	const outfits = $derived(
		content.outfits.filter((o) => touchedBy(outfitOrigins.get(o.id), modFilter) || mine(o.id))
	);
	const faces = $derived(content.expressions.filter((e) => mine(e.id)));
	const animations = $derived(content.animations.filter((a) => mine(a.id)));
	const looks = $derived(content.looks.filter((l) => mine(l.id)));
	const portraits = $derived(content.portraits.filter((p) => mine(p.def.id)));
	const skins = $derived(content.looks.filter((l) => l.kind === 'skin'));
	const podOutfit = $derived(
		content.outfits.find((o) => o.uses?.includes('pod'))?.id ?? 'crew.fallback'
	);
	/** Plugins that register crew content, with counts. */
	const mods = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const id of content.by.keys()) {
			const by = content.by.get(id)!;
			counts.set(by, (counts.get(by) ?? 0) + 1);
		}
		const order = report?.order ?? [...counts.keys()];
		const patched = report ? modsOf(report, outfitOrigins) : [];
		return order
			.filter((id) => counts.has(id) || patched.some((p) => p.id === id && p.patched > 0))
			.map((id) => ({ id, count: counts.get(id) ?? 0 }));
	});
	const inUse = (id: string, role: string): boolean => animationFor(role as never)?.id === id;
	const look = (id: string) => {
		const a = appearanceOf(id);
		return skin === 'by-id' ? a : withSkin(a, skin);
	};
	const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

	function toggleDisabled(on: boolean): void {
		saveIncludeDisabled(on);
		location.reload();
	}

	onMount(() => {
		let gone = false;
		let timer = 0;
		void (async () => {
			try {
				const dev = await devPlugins(includeDisabled);
				extra = dev.extra;
				const loaded = loadPlugins(dev.plugins);
				report = loaded.report;
				outfitOrigins = originsOf(loaded.report, 'crew-outfit');
				content = installCrewContent(loaded.registries as Registries, dev.assets, false);
				animation = animationFor('idle')?.id ?? '';
				const { createCrewLineup } = await import('@orbital/renderer/crew-lineup');
				if (gone) return;
				lineup = createCrewLineup(canvas);
				lineup.setFilter(modFilter);
				timer = window.setInterval(() => (labels = lineup?.labels() ?? []), 250);
			} catch (e) {
				error = String(e);
			}
		})();
		return () => {
			gone = true;
			clearInterval(timer);
			lineup?.dispose();
			lineup = null;
		};
	});

	$effect(() => {
		if (animation) lineup?.setAnimation(animation);
	});
	$effect(() => lineup?.setSkin(skin));
	$effect(() => lineup?.setView(view));
	$effect(() => lineup?.setFilter(modFilter));
	// the address keeps the filter
	$effect(() => {
		const q = new URLSearchParams(location.search);
		if (modFilter) q.set('mod', modFilter);
		else q.delete('mod');
		const next = `${location.pathname}${q.size ? `?${q}` : ''}`;
		if (next !== `${location.pathname}${location.search}`)
			history.replaceState(history.state, '', next);
	});
</script>

<svelte:head><title>Crew · Developer</title></svelte:head>

<main class="crew" data-testid="crew-viewer">
	<header>
		<h1>Crew</h1>
		<label
			>Mod
			<select
				value={modFilter ?? ''}
				onchange={(e) => (modFilter = e.currentTarget.value || null)}
				data-testid="crew-mod-filter"
			>
				<option value="">All plugins</option>
				{#each mods as m (m.id)}
					<option value={m.id}>{m.id} ({m.count}){extra.includes(m.id) ? ' · off' : ''}</option>
				{/each}
			</select>
		</label>
		<label
			>Animation
			<select bind:value={animation} data-testid="crew-action">
				{#each content.animations as a (a.id)}
					<option value={a.id}>{a.role}: {a.title}{inUse(a.id, a.role) ? ' (in use)' : ''}</option>
				{/each}
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
				{#each skins as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
			</select>
		</label>
		<label class="small"
			><input
				type="checkbox"
				checked={includeDisabled}
				onchange={(e) => toggleDisabled(e.currentTarget.checked)}
			/> Include disabled mods</label
		>
		<a class="small" href={resolve('/developer/mods')}>Loader log</a>
	</header>
	{#if error}<p class="error">{error}</p>{/if}
	<div class="stage">
		<canvas bind:this={canvas} data-testid="crew-canvas"></canvas>
		{#each labels as l, i (i)}
			<span class="label" style="left:{l.x}px;top:{l.y}px">{l.text}</span>
		{/each}
	</div>

	<section>
		<h2>Outfits <small>{outfits.length}</small></h2>
		<div class="grid">
			{#each outfits as o, i (o.id)}
				{@const origin = outfitOrigins.get(o.id)}
				<figure data-testid="crew-outfit">
					<img
						alt={o.title}
						src={portraitUrl({ outfit: o.id, appearance: look(`lineup-${i}`) }, 96)}
						width="96"
						height="96"
					/>
					<figcaption>
						<strong>{o.title}</strong>
						<code>{o.id}</code>
						<span>by {byOf(o.id)}</span>
						{#if o.uses?.length}<span>uses: {o.uses.join(', ')}</span>{/if}
						{#if o.professions?.length}<span>wears: {o.professions.join(', ')}</span>{/if}
						{#if origin?.patchedBy.length}
							<span class="patched">patched by {origin.patchedBy.join(', ')}</span>
							{#each origin.changes as c, k (k)}<span class="change">{changeText(c)}</span>{/each}
						{/if}
					</figcaption>
				</figure>
			{/each}
		</div>

		<h2>Expressions <small>{faces.length}</small></h2>
		<div class="grid">
			{#each faces as e, i (e.id)}
				<figure>
					<img
						alt={e.title}
						src={portraitUrl(
							{ outfit: podOutfit, appearance: look(`face-${i}`), expression: e.id },
							96
						)}
						width="96"
						height="96"
					/>
					<figcaption>
						<strong>{e.title}</strong>
						<code>{e.id}</code>
						<span>by {byOf(e.id)}{e.mood ? ` · mood ${e.mood}` : ''}</span>
					</figcaption>
				</figure>
			{/each}
		</div>

		<h2>Animations <small>{animations.length}</small></h2>
		<table>
			<thead><tr><th>Role</th><th>Animation</th><th>By</th><th>Kind</th><th></th></tr></thead>
			<tbody>
				{#each animations as a (a.id)}
					<tr class:on={a.id === animation}>
						<td>{a.role}</td>
						<td>{a.title} <code>{a.id}</code></td>
						<td>{byOf(a.id)}</td>
						<td>{a.pose ? 'pose function' : `${a.keys?.length ?? 0} keyframes`}</td>
						<td>
							{#if inUse(a.id, a.role)}<span class="tag">in use</span>{/if}
							<button type="button" onclick={() => (animation = a.id)}>Play</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>

		<h2>Looks <small>{looks.length}</small></h2>
		<div class="looks">
			{#each looks as l (l.id)}
				<span
					class="look"
					data-tip="{l.id} · by {byOf(l.id)}{l.weight ? ` · weight ${l.weight}` : ''}"
				>
					{#if l.kind === 'hair-style'}<span class="sw style">{l.style}</span>{:else}<span
							class="sw"
							style:background={hex(l.colour)}
						></span>{/if}
					{l.kind}: {l.title}
				</span>
			{/each}
		</div>

		<h2>Portrait images <small>{portraits.length}</small></h2>
		{#if portraits.length === 0}
			<p class="hint">
				None: every face is painted. A mod adds one with <code>ctx.crewPortraits.register</code> and an
				image in its package.
			</p>
		{:else}
			<div class="grid">
				{#each portraits as p (p.def.id)}
					<figure>
						<img alt={p.def.title} src={p.url} width="96" height="96" />
						<figcaption>
							<strong>{p.def.title}</strong>
							<code>{p.def.id}</code>
							<span
								>by {byOf(p.def.id)} · {p.def.crew
									? `crew ${p.def.crew}`
									: `outfit ${p.def.outfit}`}</span
							>
						</figcaption>
					</figure>
				{/each}
			</div>
		{/if}
		{#if content.missing.length > 0}
			<p class="error">
				Missing portrait images: {content.missing.map((m) => `${m.id} (${m.image})`).join(', ')}
			</p>
		{/if}
	</section>
</main>

<style>
	.crew {
		position: absolute;
		inset: 0;
		overflow: auto;
		padding: 1rem;
		box-sizing: border-box;
		background: #10151f;
		color: #e6ebf2;
		font-family: system-ui, sans-serif;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem 1rem;
		align-items: center;
		font-size: 0.85rem;
	}
	h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 400;
	}
	h2 {
		font-size: 0.9rem;
		font-weight: 600;
		margin: 1.25rem 0 0.5rem;
	}
	small,
	.hint,
	.small {
		color: #9aa6b8;
		font-weight: 400;
	}
	.small {
		font-size: 0.78rem;
	}
	select {
		background: #0b0e12;
		color: inherit;
		border: 1px solid #2a313b;
	}
	.stage {
		position: relative;
		margin-top: 0.75rem;
	}
	canvas {
		display: block;
		width: 100%;
		height: 52vh;
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
		gap: 0.9rem;
	}
	figure {
		margin: 0;
		display: grid;
		justify-items: center;
		gap: 0.25rem;
		width: 8.5rem;
	}
	figcaption {
		display: grid;
		gap: 1px;
		text-align: center;
		font-size: 0.68rem;
		color: #9aa6b8;
	}
	figcaption strong {
		color: #e6ebf2;
		font-weight: 500;
	}
	code {
		font-size: 0.65rem;
		color: #7dd3fc;
	}
	.patched {
		color: #c4b5fd;
	}
	.change {
		font-family: ui-monospace, monospace;
		font-size: 0.6rem;
	}
	table {
		border-collapse: collapse;
		font-size: 0.78rem;
		width: 100%;
		max-width: 56rem;
	}
	th,
	td {
		text-align: left;
		padding: 3px 8px;
		border-bottom: 1px solid #1f2733;
	}
	tr.on td {
		background: #1b2a40;
	}
	.tag {
		padding: 0 6px;
		margin-right: 6px;
		border: 1px solid #3b82f6;
		border-radius: 999px;
		font-size: 0.65rem;
		color: #93c5fd;
	}
	button {
		background: #1d232b;
		color: inherit;
		border: 1px solid #2a313b;
		border-radius: 3px;
		padding: 1px 8px;
		cursor: pointer;
		font: inherit;
	}
	.looks {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		font-size: 0.75rem;
	}
	.look {
		display: inline-flex;
		gap: 6px;
		align-items: center;
	}
	.sw {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid #ffffff33;
	}
	.sw.style {
		width: auto;
		height: auto;
		padding: 0 4px;
		border-radius: 4px;
		font-size: 0.6rem;
	}
	.error {
		color: #ff8a80;
	}
</style>
