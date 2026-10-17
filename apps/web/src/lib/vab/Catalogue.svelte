<script lang="ts">
	import type { PartDefinition } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import {
		CATEGORIES,
		categoryOf,
		sortParts,
		matchesQuery,
		type CategoryId,
		type ModuleLookup
	} from '../editor/categories';
	import type { PartFact } from '../editor/part-info';
	import { formatMass } from '../format';
	import type { LibraryEntry } from './library';

	let {
		parts,
		icons,
		armed,
		facts,
		modules,
		onarm,
		assemblies = [],
		armedAssembly = null,
		onarmAssembly = () => {},
		ondeleteAssembly = () => {}
	}: {
		parts: readonly PartDefinition[];
		/** Rendered thumbnails by part id (data URLs); a glyph is shown until one exists. */
		icons: Readonly<Record<string, string>>;
		armed: string | null;
		facts: (def: PartDefinition) => PartFact[];
		/** Module registry the categories are read through (descriptors, ADR 0033). */
		modules: ModuleLookup;
		onarm: (id: string) => void;
		/** Saved sub-assemblies (ADR 0041), valid and damaged. */
		assemblies?: readonly LibraryEntry[];
		armedAssembly?: string | null;
		onarmAssembly?: (id: string) => void;
		ondeleteAssembly?: (id: string) => void;
	} = $props();

	let query = $state('');
	let category = $state<CategoryId | 'all' | 'assemblies'>('all');
	let focusId = $state<string | null>(null);
	let search: HTMLInputElement;

	const tabs = $derived([
		{ id: 'all' as const, label: 'All parts', icon: 'part', count: parts.length },
		...CATEGORIES.map((c) => ({
			...c,
			count: parts.filter((p) => categoryOf(p, modules) === c.id).length
		})).filter((c) => c.count > 0),
		{
			id: 'assemblies' as const,
			label: 'Sub-assemblies',
			icon: 'assembly',
			count: assemblies.length
		}
	]);
	const shownAssemblies = $derived(
		assemblies.filter(
			(e) => query.trim() === '' || e.record.name.toLowerCase().includes(query.trim().toLowerCase())
		)
	);
	const shown = $derived(
		sortParts(parts).filter(
			(p) =>
				category !== 'assemblies' &&
				(category === 'all' || categoryOf(p, modules) === category) &&
				matchesQuery(p, query)
		)
	);
	const heading = $derived(tabs.find((t) => t.id === category)?.label ?? 'All parts');
	const info = $derived(parts.find((p) => p.id === (focusId ?? armed)) ?? null);

	function tabKey(e: KeyboardEvent, index: number): void {
		const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		e.preventDefault();
		const next = tabs[(index + step + tabs.length) % tabs.length]!;
		category = next.id;
		queueMicrotask(() => document.getElementById(`cat-tab-${next.id}`)?.focus());
	}

	let grid: HTMLDivElement;
	/** Arrow keys walk the cards (a two-column grid: Up and Down move a row). */
	function gridKey(e: KeyboardEvent): void {
		const cards = [...grid.querySelectorAll<HTMLButtonElement>('button.card')];
		const at = cards.indexOf(document.activeElement as HTMLButtonElement);
		if (at < 0) return;
		const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
		const step: Record<string, number> = {
			ArrowRight: 1,
			ArrowLeft: -1,
			ArrowDown: columns,
			ArrowUp: -columns
		};
		const next =
			e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : at + (step[e.key] ?? 0);
		if (next === at || !(e.key in step || e.key === 'Home' || e.key === 'End')) return;
		e.preventDefault();
		cards[Math.min(cards.length - 1, Math.max(0, next))]?.focus();
	}

	export function focusSearch(): void {
		search.focus();
		search.select();
	}
</script>

<section class="catalogue" aria-label="Part catalogue">
	<header>
		<h2>{heading}</h2>
		<span class="count num"
			>{category === 'assemblies' ? shownAssemblies.length : shown.length}</span
		>
	</header>

	<div class="search">
		<Icon name="search" size={16} />
		<input
			bind:this={search}
			type="search"
			placeholder="Search parts"
			aria-label="Search parts"
			bind:value={query}
			onkeydown={(e) => {
				if (e.key === 'Escape' && query) {
					query = '';
					e.stopPropagation();
				}
			}}
		/>
	</div>

	<div class="tabs" role="tablist" aria-label="Part categories">
		{#each tabs as t, i (t.id)}
			<button
				type="button"
				role="tab"
				id="cat-tab-{t.id}"
				class="tab"
				aria-selected={category === t.id}
				tabindex={category === t.id ? 0 : -1}
				title="{t.label} ({t.count})"
				onclick={() => (category = t.id)}
				onkeydown={(e) => tabKey(e, i)}
			>
				<Icon name={t.icon} size={20} />
				<span class="sr-only">{t.label}</span>
			</button>
		{/each}
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions: the keys bubble up from the card buttons -->
	<div class="grid" bind:this={grid} role="group" aria-label="Parts" onkeydown={gridKey}>
		{#if category === 'assemblies'}
			{#each shownAssemblies as e (e.record.id)}
				<div class="asm" class:armed={armedAssembly === e.record.id} class:damaged={!e.ok}>
					<button
						type="button"
						class="card"
						class:armed={armedAssembly === e.record.id}
						aria-pressed={armedAssembly === e.record.id}
						disabled={!e.ok}
						title={e.ok ? `Place ${e.record.name}` : `Damaged: ${e.errors.join('; ')}`}
						onclick={() => onarmAssembly(e.record.id)}
					>
						<span class="thumb">
							{#if e.record.thumbnail}
								<img src={e.record.thumbnail} alt="" width="104" height="69" draggable="false" />
							{:else}
								<Icon name="assembly" size={40} />
							{/if}
						</span>
						<span class="name">{e.record.name}</span>
						<span class="mass num">{e.ok ? `${e.design.parts.length} parts` : 'damaged'}</span>
					</button>
					<button
						type="button"
						class="del"
						aria-label="Delete the sub-assembly {e.record.name}"
						title="Delete"
						onclick={() => ondeleteAssembly(e.record.id)}
					>
						<Icon name="trash" size={14} />
					</button>
				</div>
			{:else}
				<div class="none">
					<p>
						{assemblies.length === 0
							? 'No sub-assemblies yet. Select a part on the vessel and press A (or Keep as sub-assembly): it and everything attached to it can then be placed again.'
							: `No sub-assembly matches “${query}”.`}
					</p>
				</div>
			{/each}
		{:else}
			{#each shown as p (p.id)}
				<button
					type="button"
					class="card"
					class:armed={armed === p.id}
					aria-pressed={armed === p.id}
					onclick={() => onarm(p.id)}
					onmouseenter={() => (focusId = p.id)}
					onmouseleave={() => (focusId = null)}
					onfocus={() => (focusId = p.id)}
					onblur={() => (focusId = null)}
				>
					<span class="thumb">
						{#if icons[p.id]}
							<img src={icons[p.id]} alt="" width="104" height="104" draggable="false" />
						{:else}
							<Icon name={p.stagingIcon ?? 'part'} size={40} />
						{/if}
					</span>
					<span class="name">{p.title}</span>
					<span class="mass num">{formatMass(p.mass)}</span>
				</button>
			{:else}
				<div class="none">
					<p>No part matches “{query}”.</p>
					<button type="button" class="link" onclick={() => ((query = ''), (category = 'all'))}>
						Clear search
					</button>
				</div>
			{/each}
		{/if}
	</div>

	<div class="info" aria-live="polite">
		{#if info}
			<h3>{info.title}</h3>
			<dl>
				{#each facts(info) as f (f.label)}
					<dt>{f.label}</dt>
					<dd class="num">{f.value}</dd>
				{/each}
			</dl>
		{:else}
			<p class="hint">Pick a part, then click a glowing ring on the vessel to attach it.</p>
		{/if}
	</div>
</section>

<style>
	.catalogue {
		display: flex;
		flex-direction: column;
		gap: var(--s-3);
		min-height: 0;
		height: 100%;
		padding: var(--s-3);
		box-sizing: border-box;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}
	h2 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
	}
	.count {
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
	.search {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		padding: 0 var(--s-2);
		height: 36px;
		color: var(--text-dim);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.search:focus-within {
		border-color: var(--c-accent);
	}
	.search input {
		flex: 1;
		min-width: 0;
		height: 100%;
		background: transparent;
		border: 0;
		outline: none;
		color: var(--text);
		font-size: var(--t-md);
	}
	.search input::placeholder {
		color: var(--text-faint);
	}
	.search input::-webkit-search-cancel-button {
		display: none;
	}
	.tabs {
		display: flex;
		gap: 2px;
		padding: 2px;
		background: var(--field);
		border-radius: var(--r-control);
	}
	.tab {
		flex: 1;
		display: grid;
		place-items: center;
		height: 34px;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-radius: var(--r-control);
		transition:
			color var(--dur-fast) var(--ease),
			background var(--dur-fast) var(--ease);
	}
	.tab:hover {
		color: var(--text);
	}
	.tab[aria-selected='true'] {
		color: var(--c-accent);
		background: color-mix(in srgb, var(--c-accent) 16%, transparent);
	}
	.grid {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-auto-rows: min-content;
		gap: var(--s-2);
		padding-right: 2px;
		scrollbar-width: thin;
	}
	.card {
		display: grid;
		justify-items: center;
		gap: 2px;
		padding: var(--s-2) var(--s-2) var(--s-2);
		text-align: center;
		background: var(--panel-raised);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		transition:
			border-color var(--dur-fast) var(--ease),
			background var(--dur-fast) var(--ease);
	}
	.card:hover {
		border-color: var(--line-strong);
		background: color-mix(in srgb, var(--c-accent) 8%, var(--panel-raised));
	}
	.card.armed {
		border-color: var(--c-accent);
		background: color-mix(in srgb, var(--c-accent) 16%, var(--panel-raised));
	}
	.asm {
		position: relative;
		display: grid;
	}
	.asm .del {
		position: absolute;
		top: 4px;
		right: 4px;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		color: var(--text-dim);
		background: var(--panel-solid);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	.asm .del:hover {
		color: var(--c-danger);
		border-color: var(--c-danger);
	}
	.asm .card:disabled {
		opacity: 0.6;
	}
	.thumb {
		display: grid;
		place-items: center;
		width: 100%;
		aspect-ratio: 1;
		color: var(--text-dim);
		background: radial-gradient(ellipse at 50% 38%, var(--panel-solid), var(--field) 78%);
		border-radius: var(--r-control);
	}
	.thumb img {
		width: 88%;
		height: 88%;
		object-fit: contain;
		pointer-events: none;
	}
	.name {
		margin-top: var(--s-1);
		font-size: var(--t-sm);
		font-weight: 500;
		line-height: 1.2;
		color: var(--text);
	}
	.mass {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.none {
		grid-column: 1 / -1;
		padding: var(--s-4) var(--s-2);
		text-align: center;
		color: var(--text-dim);
	}
	.none p {
		margin: 0 0 var(--s-2);
	}
	.link {
		background: none;
		border: 0;
		padding: 0;
		color: var(--c-accent);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.info {
		min-height: 108px;
		padding-top: var(--s-3);
		border-top: 1px solid var(--line);
	}
	.info h3 {
		margin: 0 0 var(--s-1);
		font-size: var(--t-md);
		font-weight: 600;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px var(--s-3);
		margin: 0;
		font-size: var(--t-sm);
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		text-align: right;
	}
	@media (max-height: 800px) {
		.catalogue {
			gap: var(--s-2);
		}
		.card {
			grid-template-columns: 56px 1fr;
			justify-items: start;
			align-items: center;
			column-gap: var(--s-2);
			text-align: left;
		}
		.thumb {
			grid-row: 1 / 3;
			width: 56px;
		}
		.name {
			margin-top: 0;
		}
		.grid {
			grid-template-columns: 1fr;
		}
		.info {
			min-height: 0;
			padding-top: var(--s-2);
		}
		.info dl,
		.info .hint {
			display: none;
		}
		.info h3 {
			margin: 0;
		}
	}
	.hint {
		margin: 0;
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
</style>
