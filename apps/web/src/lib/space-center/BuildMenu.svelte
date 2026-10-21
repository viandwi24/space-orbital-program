<script lang="ts">
	/**
	 * The Space Center's build bar (V3 §1.2, plan 273, ADR 0254 point 3; first plan 235, ADR 0227):
	 * row one is BUILD, the category tabs, the Place and Demolish tools and Done; row two is the open
	 * category's cards (thumbnail, chip, name, facts, why it cannot be built here), the placement
	 * chip while a ghost is out, or the Demolish hint. Hover or focus shows a card's levels.
	 */
	import type { Snippet } from 'svelte';
	import type { CategoryIcon } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import { cardFacts, stepIndex, type BuildCard, type BuildCategory } from './build-menu';
	import { cardChip } from './sc-mode';

	let {
		menu,
		thumbnail,
		onpick,
		tool = 'place',
		ontool = () => {},
		ondone = () => {},
		built = {},
		placing
	}: {
		menu: readonly BuildCategory[];
		/** A card's picture (a data URL), or null when it has none; resolves once drawn. */
		thumbnail?: (card: BuildCard) => Promise<string> | null;
		onpick: (kind: string) => void;
		/** The tool (V3 §1.2): place a building, or demolish one by clicking it. */
		tool?: 'place' | 'demolish';
		ontool?: (tool: 'place' | 'demolish') => void;
		/** Done: back to Overview. */
		ondone?: () => void;
		/** How many of each kind stand on this site, for the cards' ×n chips. */
		built?: Readonly<Record<string, number>>;
		/** The placement chip, drawn in place of the cards while a ghost is out. */
		placing?: Snippet;
	} = $props();

	// the first category is open when the bar opens (V3 §1.2: a tab is always chosen)
	// svelte-ignore state_referenced_locally
	let open = $state<string | null>(menu[0]?.id ?? null);
	let detail = $state<string | null>(null);
	let pictures = $state<Record<string, string>>({});
	const row = $derived(menu.find((c) => c.id === open) ?? null);
	const shown = $derived(row?.cards.find((k) => k.id === detail) ?? null);
	let bar = $state<HTMLElement>();
	let cardsEl = $state<HTMLElement>();

	$effect(() => {
		// the open row's pictures, drawn once per session (the renderer's cache)
		for (const card of row?.cards ?? []) {
			if (pictures[card.id]) continue;
			void thumbnail?.(card)
				?.then((url) => (pictures = { ...pictures, [card.id]: url }))
				.catch(() => {});
		}
	});

	/** The bulldozer (SpaceCenterV3's path). */
	const DOZER =
		'M5 16 H12 A2.5 2.5 0 0 1 12 21 H5 A2.5 2.5 0 0 1 5 16 Z M4 16 V10 H9 L11 13 V16 M6 10 V7 M11 14 H16 M16 9 L20 11 V21 H16 Z';
	const iconProps = (icon: CategoryIcon) =>
		typeof icon === 'string' ? { name: icon } : { path: icon.path };

	$effect(() => {
		// the menu arrives after the registries: open the first category then
		if (open === null && menu[0]) open = menu[0].id;
	});
	function pickCat(id: string): void {
		open = id;
		detail = null;
		ontool('place');
	}
	function focusIn(el: HTMLElement | undefined, selector: string, index: number): void {
		(el?.querySelectorAll<HTMLElement>(selector)[index] ?? null)?.focus();
	}
	function onBarKey(e: KeyboardEvent): void {
		const index = menu.findIndex((c) => document.activeElement?.id === `sc-cat-${c.id}`);
		if (e.key === 'ArrowDown' && row) {
			e.preventDefault();
			focusIn(cardsEl, 'button.card', 0);
			return;
		}
		const next = stepIndex(menu.length, Math.max(0, index), e.key);
		if (next !== index && next >= 0) {
			e.preventDefault();
			focusIn(bar, 'button.cat', next);
		}
	}
	function onCardsKey(e: KeyboardEvent): void {
		if (!row) return;
		const index = row.cards.findIndex((k) => document.activeElement?.id === `sc-card-${k.id}`);
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusIn(bar, 'button.cat', menu.indexOf(row));
			return;
		}
		const next = stepIndex(row.cards.length, Math.max(0, index), e.key);
		if (next !== index && next >= 0) {
			e.preventDefault();
			focusIn(cardsEl, 'button.card', next);
		}
	}
</script>

<section class="menu" aria-label="Build" data-testid="build-menu">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="top" bind:this={bar} onkeydown={onBarKey}>
		<span class="cap">Build</span>
		<div class="cats" role="tablist" aria-label="Building categories">
			{#each menu as c (c.id)}
				<button
					type="button"
					role="tab"
					class="cat"
					class:on={open === c.id && tool === 'place'}
					id="sc-cat-{c.id}"
					data-testid="sc-cat-{c.id}"
					aria-selected={open === c.id}
					aria-expanded={open === c.id && tool === 'place'}
					onclick={() => pickCat(c.id)}
				>
					<Icon {...iconProps(c.icon)} size={14} />
					<span>{c.label}</span>
					<span class="dot" aria-hidden="true"></span>
				</button>
			{/each}
		</div>
		<div class="tools">
			<button
				type="button"
				class="tool"
				class:on={tool === 'place'}
				aria-pressed={tool === 'place'}
				aria-label="Place"
				data-tip="Place"
				data-testid="sc-tool-place"
				onclick={() => ontool('place')}
				><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"
					><path d="M6 3 L18 13 L12.5 14 L15.5 20.5 L13 21.5 L10 15 L6 19 Z" /></svg
				><span class="dot" aria-hidden="true"></span></button
			>
			<button
				type="button"
				class="tool red"
				class:on={tool === 'demolish'}
				aria-pressed={tool === 'demolish'}
				aria-label="Demolish"
				data-tip="Demolish: click a building to remove it"
				data-testid="sc-tool-demolish"
				onclick={() => ontool('demolish')}
				><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d={DOZER} /></svg
				><span class="dot" aria-hidden="true"></span></button
			>
			<span class="rule" aria-hidden="true"></span>
			<button type="button" class="done" data-testid="sc-build-done" onclick={ondone}>Done</button>
		</div>
	</div>
	{#if tool === 'demolish'}
		<div class="hint" data-testid="sc-demolish-hint">
			<span class="hint-ico"
				><svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path d={DOZER} /></svg
				></span
			>
			<span class="hint-text"
				><strong>Demolish</strong><span>Click a building to remove it. This can't be undone.</span
				></span
			>
		</div>
	{:else if placing}
		{@render placing()}
	{:else if row}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_interactive_supports_focus -->
		<div
			class="row"
			role="tabpanel"
			aria-label="{row.label} buildings"
			data-testid="build-row"
			bind:this={cardsEl}
			onkeydown={onCardsKey}
		>
			{#each row.cards as card (card.id)}
				{@const chip = cardChip(card.reason, built[card.id] ?? 0)}
				<button
					type="button"
					class="card"
					id="sc-card-{card.id}"
					data-testid="sc-build-{card.id}"
					aria-disabled={card.reason !== null}
					aria-describedby={card.reason ? `sc-why-${card.id}` : undefined}
					onclick={() => card.reason === null && onpick(card.id)}
					onmouseenter={() => (detail = card.id)}
					onmouseleave={() => detail === card.id && (detail = null)}
					onfocus={() => (detail = card.id)}
					onblur={() => detail === card.id && (detail = null)}
				>
					<span class="head">
						<span class="thumb">
							{#if pictures[card.id]}
								<img src={pictures[card.id]} alt="" data-testid="sc-thumb-{card.id}" />
							{:else}
								<Icon {...iconProps(row.icon)} size={16} />
							{/if}
						</span>
						{#if chip}<span class="chip">{chip}</span>{/if}
					</span>
					<span class="name">{card.label}</span>
					{#if card.reason}<span class="why" id="sc-why-{card.id}">{card.reason}</span>
					{:else}<span class="facts">{cardFacts(card)}</span>{/if}
				</button>
			{/each}
		</div>
	{/if}
	{#if shown && tool === 'place' && !placing}
		<div class="detail" role="tooltip" data-testid="build-detail">
			<strong>{shown.label}</strong>
			{#if shown.description}<p>{shown.description}</p>{/if}
			<table>
				<tbody>
					{#each shown.levels as l (l.level)}
						<tr>
							<th>Level {l.level}</th>
							<td>{l.cost.toLocaleString('en-US')} funds</td>
							<td>{l.days} d</td>
							<td>upkeep {l.upkeep.toLocaleString('en-US')} / 30 d</td>
							<td class="cap">{l.capacity}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if shown.reason}<p class="why">{shown.reason}</p>{/if}
		</div>
	{/if}
</section>

<style>
	/* V3 §1.2: 1040 wide at most, padding 8, gap 8, radius 18, the bars' glass */
	.menu {
		position: relative;
		width: min(65rem, calc(100vw - 3rem));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 18px;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 2.5rem;
	}
	.cap {
		flex: none;
		padding: 0 0.625rem 0 0.5rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.cats {
		display: flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.cat {
		position: relative;
		flex: none;
		height: 2.25rem;
		padding: 0 0.6875rem;
		display: flex;
		align-items: center;
		gap: 0.4375rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-subtle);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.cat:hover,
	.cat.on {
		color: var(--text-primary);
	}
	.cat:hover {
		background: var(--surface-hover);
	}
	.dot {
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: transparent;
	}
	.cat.on .dot,
	.tool.on .dot {
		background: currentColor;
	}
	.tools {
		margin-left: auto;
		flex: none;
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.tool {
		position: relative;
		width: 2.25rem;
		height: 2.25rem;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-subtle);
		cursor: pointer;
	}
	.tool:hover {
		background: var(--surface-hover);
	}
	.tool.on {
		color: var(--text-primary);
	}
	.tool.red.on {
		color: var(--danger);
	}
	.tool svg,
	.hint svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.rule {
		width: 1px;
		height: 1.125rem;
		margin: 0 0.375rem;
		background: rgb(255 255 255 / 0.12);
	}
	.done {
		height: 2rem;
		padding: 0 0.875rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-button);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 700;
		cursor: pointer;
	}
	.done:hover {
		background: var(--surface-track);
	}
	.cat:focus-visible,
	.tool:focus-visible,
	.done:focus-visible,
	.card:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: -2px;
	}
	.row {
		display: flex;
		gap: 0.375rem;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.card {
		position: relative;
		flex: 1 0 11rem;
		max-width: 15rem;
		min-height: 5.75rem;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.625rem;
		border: 1px solid transparent;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.035);
		color: var(--text-primary);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.card:hover {
		border-color: rgb(255 255 255 / 0.22);
		background: rgb(255 255 255 / 0.08);
	}
	.card[aria-disabled='true'] {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}
	.thumb {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 1.75rem;
		border-radius: 7px;
		background: var(--surface-tile);
		color: var(--text-secondary);
		overflow: hidden;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.chip {
		height: 1rem;
		padding: 0 0.375rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.1);
		color: var(--text-secondary);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
		line-height: 1;
	}
	.facts,
	.why {
		font-size: var(--t-label);
		line-height: 1.3;
		color: var(--text-muted);
	}
	.why {
		color: var(--warn);
	}
	.hint {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-height: 3.25rem;
		padding: 0 0.625rem;
		border-radius: 12px;
		background: rgb(255 138 142 / 0.06);
	}
	.hint-ico {
		display: grid;
		place-items: center;
		width: 1.875rem;
		height: 1.875rem;
		border-radius: 8px;
		background: rgb(255 138 142 / 0.12);
		color: var(--danger);
	}
	.hint-text {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.hint-text strong {
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.detail {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%);
		width: min(30rem, calc(100vw - 3rem));
		padding: 0.75rem 0.875rem;
		border-radius: 14px;
		font-size: var(--t-small);
		color: var(--text-secondary);
		pointer-events: none;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
	}
	.detail p {
		margin: 0.25rem 0 0.5rem;
		color: var(--text-muted);
	}
	.detail table {
		width: 100%;
		border-collapse: collapse;
	}
	.detail th {
		text-align: left;
		font-weight: 600;
		color: var(--text-primary);
		padding: 0.15rem 0.5rem 0.15rem 0;
		white-space: nowrap;
	}
	.detail td {
		padding: 0.15rem 0.5rem 0.15rem 0;
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.detail td.cap {
		white-space: normal;
		color: var(--text-muted);
	}
</style>
