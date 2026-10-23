<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import Icon from '../ui/Icon.svelte';
	import {
		filterBlueprints,
		GOAL_LABELS,
		NO_FILTER,
		ORIGIN_LABELS,
		type BlueprintCard,
		type BlueprintFilter,
		type BlueprintOrigin,
		type BlueprintStats
	} from '../editor/blueprints';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();

	let filter = $state<BlueprintFilter>({ ...NO_FILTER });
	const shown = $derived(filterBlueprints(vab.blueprints, filter));
	const origins = $derived(
		(['learn', 'mission', 'mod'] as BlueprintOrigin[]).filter((o) =>
			vab.blueprints.some((b) => b.origin === o)
		)
	);
	const goals = $derived(
		(Object.keys(GOAL_LABELS) as BlueprintCard['goal'][]).filter((g) =>
			vab.blueprints.some((b) => b.goal === g)
		)
	);

	// stats and pictures are worked out once per card, when the dialog first shows it
	const stats = new Map<string, BlueprintStats | null>();
	const statsOf = (id: string): BlueprintStats | null => {
		if (!stats.has(id)) stats.set(id, vab.blueprintStats(id));
		return stats.get(id)!;
	};
	const thumbOf = (id: string): string | null =>
		vab.blueprintsOpen ? vab.blueprintThumbnail(id) : null;

	const fmt = (n: number, digits = 0): string =>
		n.toLocaleString(undefined, { maximumFractionDigits: digits });
</script>

<Dialog
	open={vab.blueprintsOpen}
	title="Blueprint Library"
	onclose={() => (vab.blueprintsOpen = false)}
>
	<div class="lib">
		<div class="filters">
			<input
				type="search"
				placeholder="Search: moon, shuttle, rover…"
				aria-label="Search blueprints"
				bind:value={filter.query}
			/>
			<div class="chips" role="group" aria-label="Origin">
				<button class:on={filter.origin === 'all'} onclick={() => (filter.origin = 'all')}
					>All</button
				>
				{#each origins as o (o)}
					<button class:on={filter.origin === o} onclick={() => (filter.origin = o)}
						>{ORIGIN_LABELS[o]}</button
					>
				{/each}
			</div>
			<div class="chips" role="group" aria-label="Goal">
				<button class:on={filter.goal === 'all'} onclick={() => (filter.goal = 'all')}
					>Any goal</button
				>
				{#each goals as g (g)}
					<button class:on={filter.goal === g} onclick={() => (filter.goal = g)}
						>{GOAL_LABELS[g]}</button
					>
				{/each}
				<button
					class:on={filter.crew === 'crewed'}
					onclick={() => (filter.crew = filter.crew === 'crewed' ? 'all' : 'crewed')}>Crewed</button
				>
				<button
					class:on={filter.crew === 'probe'}
					onclick={() => (filter.crew = filter.crew === 'probe' ? 'all' : 'probe')}>Probe</button
				>
			</div>
		</div>
		{#if shown.length === 0}
			<p class="dim empty">No blueprint matches. Clear the search or pick another goal.</p>
		{:else}
			<ul class="cards" aria-label="Blueprints">
				{#each shown as b (b.id)}
					{@const s = statsOf(b.id)}
					{@const thumb = thumbOf(b.id)}
					<li>
						<div class="pic">
							{#if thumb}
								<img src={thumb} alt="" width="192" height="128" />
							{:else}
								<Icon name="part" size={32} />
							{/if}
							<span class="origin">{ORIGIN_LABELS[b.origin]}</span>
						</div>
						<div class="meta">
							<strong>{b.title}</strong>
							{#if b.inspiredBy}<span class="dim">Inspired by {b.inspiredBy}</span>{/if}
							<span class="badges">
								<span class="badge">{GOAL_LABELS[b.goal]}</span>
								<span class="badge">{b.crew > 0 ? `${b.crew} crew` : 'Probe'}</span>
								<span
									class="badge"
									class:off={!b.fits}
									data-tip={b.fits
										? 'Designed for this world’s system'
										: 'Not designed for this world’s system: it may fall short'}>{b.systems}</span
								>
							</span>
							<p>{b.summary}</p>
							{#if s}
								<span class="dim num">
									{s.parts} parts · {fmt(s.mass, 1)} t · Δv {fmt(s.deltaV)} m/s{s.twr !== null
										? ` · TWR ${fmt(s.twr, 2)}`
										: ''}
								</span>
							{/if}
						</div>
						<Button onclick={() => vab.loadBlueprint(b.id)} aria-label={`Load ${b.title}`}
							>Load</Button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</Dialog>

<style>
	.lib {
		display: grid;
		gap: 0.75rem;
		min-width: min(36rem, calc(100vw - 4rem));
	}
	.filters {
		display: grid;
		gap: 0.5rem;
	}
	.filters input {
		padding: 0.4rem 0.6rem;
		border-radius: 0.5rem;
		border: 1px solid rgb(255 255 255 / 0.18);
		background: rgb(0 0 0 / 0.25);
		color: inherit;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.chips button {
		padding: 0.2rem 0.6rem;
		border-radius: 999px;
		border: 1px solid rgb(255 255 255 / 0.18);
		background: none;
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.chips button.on {
		background: var(--surface-chip, rgb(255 255 255 / 0.12));
		border-color: rgb(255 255 255 / 0.45);
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
		max-height: 60vh;
		overflow: auto;
	}
	.cards li {
		display: grid;
		grid-template-columns: 9rem 1fr auto;
		gap: 0.75rem;
		align-items: center;
		padding: 0.5rem;
		border-radius: 0.6rem;
		background: rgb(255 255 255 / 0.04);
	}
	/* the drawn card on a blue grid (ADR 0263 point 2) */
	.pic {
		position: relative;
		display: grid;
		place-items: center;
		height: 6rem;
		border-radius: 0.4rem;
		background-color: #12355e;
		background-image:
			linear-gradient(rgb(255 255 255 / 0.12) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.12) 1px, transparent 1px);
		background-size: 12px 12px;
		overflow: hidden;
	}
	.pic img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.origin {
		position: absolute;
		left: 0.3rem;
		top: 0.3rem;
		font-size: 0.65rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.8;
	}
	.meta {
		display: grid;
		gap: 0.2rem;
		min-width: 0;
	}
	.meta p {
		margin: 0;
		font-size: 0.85rem;
	}
	.badges {
		display: flex;
		gap: 0.3rem;
	}
	.badge {
		font-size: 0.7rem;
		padding: 0.05rem 0.45rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.1);
	}
	.badge.off {
		opacity: 0.55;
		text-decoration: line-through;
	}
	.dim {
		opacity: 0.7;
		font-size: 0.8rem;
	}
	.empty {
		padding: 1rem 0;
	}
	@media (max-width: 40rem) {
		.cards li {
			grid-template-columns: 1fr;
		}
	}
</style>
