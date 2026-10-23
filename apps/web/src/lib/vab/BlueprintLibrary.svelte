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
	import { gapsOf } from '../editor/blueprint-checklist';
	import {
		editedText,
		FILTER_LABELS,
		SORT_LABELS,
		shownLibrary,
		type VesselFilter,
		type VesselSort
	} from '../launch/vessel-library';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();

	/** Blueprints, the player's saved designs and their sub-assemblies (plan 312). */
	type Tab = 'blueprints' | 'designs' | 'assemblies';
	let tab = $state<Tab>('blueprints');
	let open = $state<string | null>(null);
	let query = $state('');
	let vesselFilter = $state<VesselFilter>('all');
	let sort = $state<VesselSort>('recent');
	// the saved lists reuse the Launch page's library: dedupe, search, sort (decision in the plan's log)
	const saved = $derived(
		tab === 'blueprints'
			? null
			: shownLibrary(vab.savedItems(tab === 'designs' ? 'vessel' : 'assembly'), {
					query,
					filter: vesselFilter,
					sort
				}).library
	);
	$effect(() => {
		if (vab.blueprintsOpen && tab !== 'blueprints') void vab.refreshLibrary();
	});
	/** The part kinds of a card, counted: the labels of its detail panel. */
	const labelsOf = (id: string): { title: string; n: number }[] => {
		const card = vab.blueprints.find((b) => b.id === id);
		if (!card) return [];
		const counts = new Map<string, number>();
		for (const p of card.build(vab.editorContent).parts) {
			const title = vab.registriesParts.get(p.part)?.title ?? p.part;
			counts.set(title, (counts.get(title) ?? 0) + 1);
		}
		return [...counts].map(([title, n]) => ({ title, n }));
	};

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
		<div class="chips tabs" role="tablist" aria-label="Library">
			<button role="tab" class:on={tab === 'blueprints'} onclick={() => (tab = 'blueprints')}
				>Blueprints</button
			>
			<button role="tab" class:on={tab === 'designs'} onclick={() => (tab = 'designs')}
				>My designs</button
			>
			<button role="tab" class:on={tab === 'assemblies'} onclick={() => (tab = 'assemblies')}
				>Sub-assemblies</button
			>
		</div>
		{#if saved}
			<div class="filters">
				<input
					type="search"
					placeholder="Search by name"
					aria-label="Search saved designs"
					bind:value={query}
				/>
				<div class="chips" role="group" aria-label="Kind">
					{#each Object.entries(FILTER_LABELS) as [value, label] (value)}
						<button
							class:on={vesselFilter === value}
							onclick={() => (vesselFilter = value as VesselFilter)}>{label}</button
						>
					{/each}
					<select aria-label="Sort" bind:value={sort}>
						{#each Object.entries(SORT_LABELS) as [value, label] (value)}<option {value}
								>{label}</option
							>{/each}
					</select>
				</div>
			</div>
			{#if saved.length === 0}
				<p class="dim empty">
					{tab === 'designs'
						? 'Nothing saved yet: your designs are kept as you build.'
						: 'No sub-assemblies yet: select a part and keep it as one.'}
				</p>
			{:else}
				<ul class="cards" aria-label={tab === 'designs' ? 'My designs' : 'Sub-assemblies'}>
					{#each saved as v (v.key)}
						<li>
							<div class="pic">
								{#if v.thumbnail}<img
										src={v.thumbnail}
										alt=""
										width="192"
										height="128"
									/>{:else}<Icon name="part" size={32} />{/if}
							</div>
							<div class="meta">
								<strong
									>{v.name}{#if v.variant}<span class="dim">
											· variant {v.variant}</span
										>{/if}</strong
								>
								<span class="dim num"
									>{v.parts} parts · {fmt(v.wet / 1000, 1)} t · {fmt(v.cost)} funds{v.seats > 0
										? ` · ${v.seats} seats`
										: ''}</span
								>
								<span class="dim">Edited {editedText(v.updatedAt, Date.now())}</span>
							</div>
							{#if tab === 'designs'}
								<Button
									onclick={() => {
										void vab.openEntry(v.key);
										vab.blueprintsOpen = false;
									}}
									aria-label={`Open ${v.name}`}>Open</Button
								>
							{:else}
								<Button
									onclick={() => {
										vab.armAssembly(v.key);
										vab.blueprintsOpen = false;
									}}
									aria-label={`Place ${v.name}`}>Place</Button
								>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
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
						onclick={() => (filter.crew = filter.crew === 'crewed' ? 'all' : 'crewed')}
						>Crewed</button
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
						{@const locks = vab.blueprintLocks(b.id)}
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
							<div class="act">
								<Button onclick={() => vab.loadBlueprint(b.id)} aria-label={`Load ${b.title}`}
									>{locks.length > 0 ? 'Open read-only' : 'Load'}</Button
								>
								<button
									class="more"
									onclick={() => (open = open === b.id ? null : b.id)}
									aria-expanded={open === b.id}
									aria-label={`Details of ${b.title}`}>{open === b.id ? 'Less' : 'Details'}</button
								>
							</div>
							{#if open === b.id}
								{@const items = vab.blueprintChecklist(b.id)}
								{@const gaps = gapsOf(items)}
								<div class="detail" data-testid="blueprint-detail">
									<p class="verdict" class:off={!b.fits}>
										{#if b.fits}
											Designed for this world's system ({b.systems}).
										{:else}
											Not designed for this world's system ({b.systems}): it may fall short, or be
											more than the trip needs.
										{/if}
										{#if s && s.twr !== null && s.twr < 1}
											Its thrust-to-weight at liftoff is under 1: it will not leave the pad.
										{/if}
									</p>
									<ul class="check" aria-label="Completeness">
										{#each items as item (item.id)}
											<li
												class:missing={item.expected && !item.present}
												class:dim={!item.expected && !item.present}
											>
												<span aria-hidden="true"
													>{item.present ? '✓' : item.expected ? '✗' : '–'}</span
												>
												{item.label}
												{#if item.expected && !item.present}<span class="why">
														{item.why}</span
													>{/if}
											</li>
										{/each}
									</ul>
									{#if gaps.length > 0}
										<p class="dim">Missing for this trip: {gaps.map((g) => g.label).join(', ')}.</p>
									{/if}
									<p class="parts">
										{#each labelsOf(b.id) as l, i (l.title)}{i > 0 ? ' · ' : ''}{l.n > 1
												? `${l.n} × `
												: ''}{l.title}{/each}
									</p>
									{#if locks.length > 0}
										<p class="lock" role="note">
											Locked in this world: {locks.map((l) => `${l.title} (${l.node})`).join(', ')}.
											It opens read-only.
										</p>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
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
	.act {
		display: grid;
		gap: 0.3rem;
		justify-items: end;
	}
	.more {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		font-size: 0.75rem;
		opacity: 0.7;
		cursor: pointer;
		text-decoration: underline;
	}
	.detail {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.4rem;
		padding-top: 0.4rem;
		border-top: 1px solid rgb(255 255 255 / 0.1);
		font-size: 0.85rem;
	}
	.detail p {
		margin: 0;
	}
	.verdict.off {
		opacity: 0.8;
	}
	.check {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 0.15rem 0.75rem;
	}
	.check li {
		display: block;
		padding: 0;
		background: none;
	}
	.check .missing {
		color: var(--warn, #ffb454);
	}
	.why {
		display: block;
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.parts {
		opacity: 0.75;
		font-size: 0.8rem;
	}
	.lock {
		color: var(--warn, #ffb454);
	}
	select {
		padding: 0.2rem 0.4rem;
		border-radius: 0.5rem;
		border: 1px solid rgb(255 255 255 / 0.18);
		background: rgb(0 0 0 / 0.25);
		color: inherit;
		font: inherit;
		font-size: 0.8rem;
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
