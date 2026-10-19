<script lang="ts">
	import type { PartDefinition } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import {
		categoryOf,
		sortParts,
		matchesQuery,
		type Category,
		type CategoryId,
		type ModuleLookup
	} from '../editor/categories';
	import type { PartFact } from '../editor/part-info';
	import { formatFunds, formatMass } from '../format';
	import type { LibraryEntry } from './library';

	let {
		parts,
		icons,
		armed,
		facts,
		modules,
		categories,
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
		/** The rail's categories in order (plan 069, ADR 0146). */
		categories: readonly Category[];
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
		{
			id: 'all' as const,
			label: 'All parts',
			icon: 'part' as Category['icon'],
			count: parts.length
		},
		...categories
			.map((c) => ({
				...c,
				count: parts.filter((p) => categoryOf(p, modules, categories) === c.id).length
			}))
			.filter((c) => c.count > 0),
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
				(category === 'all' || categoryOf(p, modules, categories) === category) &&
				matchesQuery(p, query)
		)
	);
	const heading = $derived(tabs.find((t) => t.id === category)?.label ?? 'All parts');
	const info = $derived(parts.find((p) => p.id === (focusId ?? armed)) ?? null);

	function tabKey(e: KeyboardEvent, index: number): void {
		// a vertical rail (plan 093): Up and Down, and Left and Right as before
		const step =
			e.key === 'ArrowDown' || e.key === 'ArrowRight'
				? 1
				: e.key === 'ArrowUp' || e.key === 'ArrowLeft'
					? -1
					: 0;
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
	<div class="tabs" role="tablist" aria-orientation="vertical" aria-label="Part categories">
		{#each tabs as t, i (t.id)}
			<button
				type="button"
				role="tab"
				id="cat-tab-{t.id}"
				class="tab"
				aria-selected={category === t.id}
				tabindex={category === t.id ? 0 : -1}
				data-tip="{t.label} ({t.count})"
				onclick={() => (category = t.id)}
				onkeydown={(e) => tabKey(e, i)}
			>
				<Icon
					name={typeof t.icon === 'string' ? t.icon : undefined}
					path={typeof t.icon === 'string' ? undefined : t.icon.path}
					size={20}
				/>
				<span class="sr-only">{t.label}</span>
				<span class="dot" aria-hidden="true"></span>
			</button>
		{/each}
	</div>
	<div class="body">
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
							data-tip={e.ok ? `Place ${e.record.name}` : `Damaged: ${e.errors.join('; ')}`}
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
							data-tip="Delete"
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
						<span class="mass num"
							>{formatMass(p.mass)} · {p.cost === undefined ? '[—]' : formatFunds(p.cost)}</span
						>
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
	</div>
</section>

<style>
	/* refs Hangar catalogue: one glass panel, a 36 px rail of categories, two columns of cards */
	.catalogue {
		display: flex;
		gap: 0.5rem;
		height: 100%;
		min-height: 0;
		box-sizing: border-box;
		padding: var(--panel-pad);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.tabs {
		display: flex;
		flex: none;
		flex-direction: column;
		gap: 2px;
		width: 2.25rem;
		overflow-y: auto;
	}
	.tab {
		position: relative;
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 0;
		border-radius: var(--radius-icon);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}
	.tab:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.tab[aria-selected='true'] {
		background: var(--surface-tile);
		color: var(--text-primary);
	}
	.tab:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: -2px;
	}
	/* the dot on the right of the chosen category (refs) */
	.dot {
		position: absolute;
		right: 2px;
		top: 50%;
		width: 4px;
		height: 4px;
		margin-top: -2px;
		border-radius: 50%;
		background: transparent;
	}
	.tab[aria-selected='true'] .dot {
		background: var(--text-primary);
	}
	.body {
		display: flex;
		flex: 1;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
		min-height: 0;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 1.125rem;
		padding: 0 2px;
	}
	h2 {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.count {
		font-size: var(--t-label);
		font-weight: 600;
		color: var(--text-subtle);
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		height: 1.75rem;
		padding: 0 0.5rem;
		border-radius: var(--radius-tile);
		background: var(--surface-tile);
		color: var(--text-muted);
	}
	.search:focus-within {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.search input {
		flex: 1;
		min-width: 0;
		height: 1.625rem;
		padding: 0;
		border: 0;
		outline: none;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
	}
	.search input::placeholder {
		color: var(--text-muted);
	}
	.search input::-webkit-search-cancel-button {
		filter: invert(1);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		grid-auto-rows: min-content;
		gap: 0.375rem;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		align-content: start;
	}
	/* refs card: 96 high, padding 10, radius 10 */
	.card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.25rem;
		width: 100%;
		min-height: 6rem;
		box-sizing: border-box;
		padding: 0.625rem;
		border: 1px solid var(--surface-tile);
		border-radius: var(--radius-row);
		background: var(--surface-inset);
		color: var(--text-secondary);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.card:hover {
		background: var(--surface-hover);
	}
	.card:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.card.armed {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.card.armed .name {
		color: var(--selected-fg);
	}
	.card.armed .mass {
		color: var(--selected-muted);
	}
	.asm {
		position: relative;
	}
	.asm .del {
		position: absolute;
		top: 0.375rem;
		right: 0.375rem;
		display: flex;
		padding: 0.25rem;
		border: 0;
		border-radius: 50%;
		background: var(--surface-button);
		color: var(--text-muted);
		cursor: pointer;
	}
	.asm .del:hover {
		color: var(--danger);
	}
	.asm .card:disabled {
		opacity: 0.5;
	}
	.thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.name {
		font-size: var(--t-label);
		line-height: 1.15;
		font-weight: 600;
		color: var(--text-primary);
	}
	.mass {
		font-size: var(--t-label);
		line-height: 1;
		color: var(--text-subtle);
	}
	.none {
		grid-column: 1 / -1;
		padding: var(--s-3) 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.none p {
		margin: 0 0 var(--s-2);
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent-text);
		font: inherit;
		cursor: pointer;
	}
	.info {
		flex: none;
		min-height: 5.5rem;
		padding: 0.5rem 0.375rem 0;
		border-top: 1px solid var(--border-divider);
	}
	.info h3 {
		margin: 0 0 0.25rem;
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px var(--s-3);
		margin: 0;
		font-size: var(--t-label);
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		text-align: right;
		color: var(--text-body);
	}
	.hint {
		margin: 0;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	@media (max-height: 800px) {
		.card {
			min-height: 4.5rem;
		}
		.thumb {
			width: 1.75rem;
			height: 1.75rem;
		}
		.info {
			min-height: 0;
		}
		.info dl,
		.info .hint {
			display: none;
		}
	}
</style>
