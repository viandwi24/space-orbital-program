<script lang="ts">
	/**
	 * The Space Center's build menu (plan 235, ADR 0227 point 6): the category bar at the bottom in
	 * the v2 dock's style, and above it the open category's cards, each with a thumbnail, its facts
	 * and, when it cannot be built here, why. Hover or focus shows a card's levels; choosing a card
	 * starts the placement preview.
	 */
	import type { CategoryIcon } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import { cardFacts, stepIndex, type BuildCard, type BuildCategory } from './build-menu';

	let {
		menu,
		thumbnail,
		onpick
	}: {
		menu: readonly BuildCategory[];
		/** A card's picture (a data URL), or null when it has none; resolves once drawn. */
		thumbnail?: (card: BuildCard) => Promise<string> | null;
		onpick: (kind: string) => void;
	} = $props();

	let open = $state<string | null>(null);
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

	const iconProps = (icon: CategoryIcon) =>
		typeof icon === 'string' ? { name: icon } : { path: icon.path };

	function toggle(id: string): void {
		open = open === id ? null : id;
		detail = null;
	}
	function focusIn(el: HTMLElement | undefined, selector: string, index: number): void {
		(el?.querySelectorAll<HTMLElement>(selector)[index] ?? null)?.focus();
	}
	function onBarKey(e: KeyboardEvent): void {
		const index = menu.findIndex((c) => document.activeElement?.id === `sc-cat-${c.id}`);
		if (e.key === 'Escape' && open) {
			e.preventDefault();
			open = null;
			return;
		}
		if (e.key === 'ArrowUp' && row) {
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
		if (e.key === 'Escape' || e.key === 'ArrowDown') {
			e.preventDefault();
			focusIn(bar, 'button.cat', menu.indexOf(row));
			if (e.key === 'Escape') open = null;
			return;
		}
		const next = stepIndex(row.cards.length, Math.max(0, index), e.key);
		if (next !== index && next >= 0) {
			e.preventDefault();
			focusIn(cardsEl, 'button.card', next);
		}
	}
</script>

<div class="menu" data-testid="build-menu">
	{#if row}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<section
			class="row"
			aria-label="{row.label} buildings"
			data-testid="build-row"
			bind:this={cardsEl}
			onkeydown={onCardsKey}
		>
			{#each row.cards as card (card.id)}
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
					<span class="thumb">
						{#if pictures[card.id]}
							<img src={pictures[card.id]} alt="" data-testid="sc-thumb-{card.id}" />
						{:else}
							<Icon {...iconProps(row.icon)} size={28} />
						{/if}
					</span>
					<span class="name">{card.label}</span>
					<span class="facts">{cardFacts(card)}</span>
					{#if card.reason}<span class="why" id="sc-why-{card.id}">{card.reason}</span>{/if}
				</button>
			{/each}
		</section>
		{#if shown}
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
	{/if}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<nav class="bar" aria-label="Build" bind:this={bar} onkeydown={onBarKey}>
		{#each menu as c (c.id)}
			<button
				type="button"
				class="cat"
				class:on={open === c.id}
				id="sc-cat-{c.id}"
				data-testid="sc-cat-{c.id}"
				aria-expanded={open === c.id}
				aria-label={c.label}
				title={c.label}
				onclick={() => toggle(c.id)}
			>
				<Icon {...iconProps(c.icon)} size={18} />
				<span class="short">{c.label}</span>
				<span class="dot" aria-hidden="true"></span>
			</button>
		{/each}
	</nav>
</div>

<style>
	.menu {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		max-width: calc(100vw - 3rem);
	}
	/* the v2 dock (SpaceCenterV2): a glass pill, 4 padding, 2 gap, radius 18 */
	.bar,
	.row,
	.detail {
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid rgb(255 255 255 / 0.08);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-radius: 18px;
		max-width: 100%;
		overflow-x: auto;
	}
	.cat {
		position: relative;
		flex: none;
		min-width: 4rem;
		height: 3.5rem;
		padding: 0 0.5rem;
		border: 0;
		border-radius: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		background: transparent;
		color: #8b8b93;
		cursor: pointer;
		font: inherit;
	}
	.cat:hover,
	.cat.on {
		color: #fff;
	}
	.cat:hover {
		background: rgb(255 255 255 / 0.05);
	}
	.short {
		font-size: max(9px, 0.5625rem);
		line-height: 1;
		font-weight: 600;
		white-space: nowrap;
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
	.cat.on .dot {
		background: #fff;
	}
	.row {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 16px;
		/* centred, clear of the 320 px right column on both sides */
		max-width: max(18rem, calc(100vw - 46rem));
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.card {
		flex: none;
		width: 12rem;
		min-height: 2.75rem;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.3rem;
		padding: 0.375rem 0.375rem 0.5rem;
		border: 1px solid transparent;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.04);
		color: #fff;
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.card:hover,
	.card:focus-visible {
		border-color: rgb(255 255 255 / 0.18);
		background: rgb(255 255 255 / 0.07);
	}
	.card[aria-disabled='true'] {
		cursor: not-allowed;
	}
	.card[aria-disabled='true'] .thumb,
	.card[aria-disabled='true'] .name {
		opacity: 0.5;
	}
	/* 256 × 160 pictures at 11.25 rem wide */
	.thumb {
		display: grid;
		place-items: center;
		aspect-ratio: 256 / 160;
		border-radius: 8px;
		background: rgb(255 255 255 / 0.05);
		color: #8b8b93;
		overflow: hidden;
	}
	.thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.name {
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.2;
	}
	.facts {
		font-size: max(10px, 0.625rem);
		line-height: 1.3;
		color: #a1a1aa;
	}
	.why {
		font-size: max(10px, 0.625rem);
		line-height: 1.3;
		color: var(--c-warning);
	}
	.detail {
		position: absolute;
		bottom: calc(100% + 0.5rem);
		left: 50%;
		transform: translateX(-50%);
		width: min(30rem, calc(100vw - 3rem));
		padding: 0.75rem 0.875rem;
		border-radius: 14px;
		font-size: max(10px, 0.6875rem);
		color: #e4e4e7;
		pointer-events: none;
	}
	.detail p {
		margin: 0.25rem 0 0.5rem;
		color: #a1a1aa;
	}
	.detail table {
		width: 100%;
		border-collapse: collapse;
	}
	.detail th {
		text-align: left;
		font-weight: 600;
		color: #fff;
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
		color: #a1a1aa;
	}
</style>
