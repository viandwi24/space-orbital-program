<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Astronaut Complex (plan 108, ADR 0152; refs W3): Roster, Applicants and Lost, a profession
	 * filter, a profile. It runs the world's sim from its newest save and saves after a hire.
	 */
	import { onMount } from 'svelte';
	import { homeBodyOf, type Profession, type Snapshot } from '@orbital/core';
	import { loadContent } from '../../../lib/catalog';
	import { parseDesign, referenceTwoStage } from '../../../lib/design';
	import { loadDraft } from '../../../lib/storage';
	import { partLookup } from '../../../lib/catalog';
	import { formatFunds } from '../../../lib/format';
	import { GAME_NAME } from '../../../lib/public/about';
	import type { GameSave } from '../../../lib/save/game-save';
	import { bootedMods, modHint } from '../../../lib/save/mods';
	import { SaveController } from '../../../lib/save/save-controller.svelte';
	import { startSimWorker, type SimClient } from '../../../lib/sim-client';
	import BackButton from '../../../lib/ui/BackButton.svelte';
	import Button from '../../../lib/ui/Button.svelte';
	import Chip from '../../../lib/ui/Chip.svelte';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import Panel from '../../../lib/ui/Panel.svelte';
	import Segmented from '../../../lib/ui/Segmented.svelte';
	import StatCell from '../../../lib/ui/StatCell.svelte';
	import { activeWorldId } from '../../../lib/worlds/worlds';
	import {
		applicants,
		profileOf,
		rosterRows,
		type ProfessionFilter,
		type RosterTab
	} from '../../../lib/astronauts/roster-model';

	const { catalog } = loadContent();
	const hangarDesign = () => {
		const text = loadDraft();
		const parsed = text ? parseDesign(text, partLookup(catalog)) : null;
		return parsed?.ok && parsed.design.parts.length > 0 ? parsed.design : null;
	};
	let client: SimClient | null = null;
	let loaded: GameSave | undefined;
	let snapshot = $state.raw<Snapshot | null>(null);
	let tab = $state<RosterTab>('roster');
	let filter = $state<ProfessionFilter>('all');
	let selected = $state<string | null>(null);
	let note = $state<string | null>(null);
	let ready = $state(false);

	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => location.assign(resolve(`/flight?load=${encodeURIComponent(id)}`)),
		world: () => activeWorldId(),
		collect: async () => {
			if (!client) throw new Error('The world is not running.');
			return {
				sim: await client.save(),
				focus: loaded?.focus ?? null,
				// a save needs a readable design: the last one flown, the Hangar's, or the reference rocket
				design: loaded?.design ?? hangarDesign() ?? referenceTwoStage(),
				thumbnail: null,
				bodyRadius: homeBodyOf(catalog.bodies)?.radius ?? 0
			};
		}
	});

	const rows = $derived(tab === 'applicants' ? [] : rosterRows(snapshot?.crew, tab, filter));
	const offers = $derived(applicants(snapshot?.rules, filter));
	const member = $derived(snapshot?.crew?.find((m) => m.id === selected) ?? rows[0] ?? null);
	const profile = $derived(
		member
			? profileOf(member, (id) => snapshot?.vessels.find((v) => v.id === id)?.name ?? null)
			: null
	);
	const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

	onMount(() => {
		let gone = false;
		void (async () => {
			await saves.refresh();
			const newest = saves.entries.find((e) => e.ok);
			loaded = newest?.ok ? await saves.read(newest.meta.id) : undefined;
			const world = loaded ? undefined : await saves.worldStartInfo(activeWorldId());
			if (gone) return;
			client = startSimWorker(loaded ? { resume: loaded.sim } : world ? { world } : {});
			client.onSnapshot((s) => (snapshot = s));
			void client.ready.then(() => (ready = true));
			client.onError((m) => (note = m));
		})();
		return () => {
			gone = true;
			client?.dispose();
		};
	});

	async function hire(profession: Profession): Promise<void> {
		if (!client) return;
		const r = await client.dispatch({ type: 'crew-hire', profession });
		if (!r.ok) {
			note = `Not hired: ${r.reason}`;
			return;
		}
		// the next launch flies in this save (ADR 0152 point 2)
		note = (await saves.autosave())
			? `A new ${profession} joined.`
			: 'Hired, but the world could not be saved.';
		tab = 'roster';
	}
</script>

<PageMeta title="Astronaut Complex · {GAME_NAME}" />

<main class="astro">
	<header>
		<BackButton href={resolve('/space-center')} label="Back to the Space Center" />
		<div class="title">
			<span class="cap">Space Center</span>
			<h1>Astronaut Complex</h1>
		</div>
	</header>
	<div class="bar">
		<Segmented
			label="List"
			value={tab}
			options={[
				{ value: 'roster', label: 'Roster' },
				{ value: 'applicants', label: 'Applicants' },
				{ value: 'lost', label: 'Lost' }
			]}
			onchange={(v) => (tab = v)}
			testid="astro-tab"
		/>
		<Segmented
			label="Profession"
			value={filter}
			options={[
				{ value: 'all', label: 'All' },
				{ value: 'pilot', label: 'Pilot' },
				{ value: 'engineer', label: 'Engineer' },
				{ value: 'scientist', label: 'Scientist' }
			]}
			onchange={(v) => (filter = v)}
			testid="astro-filter"
		/>
	</div>
	{#if note}<p class="note" role="status">{note}</p>{/if}

	<div class="cols">
		<Panel title={cap(tab)} data-testid="astro-list">
			{#if tab === 'applicants'}
				{#each offers as a (a.profession)}
					<div class="row">
						<span class="text"
							><span class="name">{cap(a.profession)}</span><span class="sub"
								>{a.cost > 0 ? `${formatFunds(a.cost)} to recruit` : 'Free to recruit'}</span
							></span
						>
						<Button
							disabled={!ready}
							onclick={() => void hire(a.profession)}
							data-testid="astro-hire-{a.profession}">Hire</Button
						>
					</div>
				{/each}
			{:else}
				{#each rows as m (m.id)}
					<button
						type="button"
						class="row pick"
						aria-pressed={member?.id === m.id}
						data-testid="astro-member"
						onclick={() => (selected = m.id)}
					>
						<span class="text"
							><span class="name">{m.name}</span><span class="sub"
								>{cap(m.profession)} · level {m.level}</span
							></span
						>
					</button>
				{:else}
					<p class="empty">
						{tab === 'roster' ? 'Nobody yet. Hire from the Applicants.' : 'Nobody lost.'}
					</p>
				{/each}
			{/if}
		</Panel>

		<Panel title="Profile" data-testid="astro-profile">
			{#if profile && tab !== 'applicants'}
				<h2>{profile.name}</h2>
				<div class="chips">
					{#each profile.chips as c (c)}<Chip>{c}</Chip>{/each}
				</div>
				<div class="stats">
					{#each profile.stats as s (s.label)}<StatCell label={s.label} value={s.value} />{/each}
				</div>
				<span class="cap">Traits</span>
				<p class="list">{profile.traits.length ? profile.traits.join(', ') : '[—]'}</p>
				<span class="cap">This flight</span>
				<p class="list">{profile.places.length ? profile.places.join(', ') : '[—]'}</p>
			{:else}
				<p class="empty">Choose someone on the list.</p>
			{/if}
		</Panel>
	</div>
</main>

<style>
	.astro {
		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		padding: var(--margin-hud);
		background: var(--bg-ground);
	}
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	.title {
		display: grid;
		gap: 0.25rem;
	}
	.cap {
		display: block;
		margin: 0.75rem 0.25rem 0.25rem;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.title .cap {
		margin: 0;
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		line-height: 1;
		font-weight: 300;
		color: var(--text-primary);
	}
	h2 {
		margin: 0 0.25rem 0.5rem;
		font-size: 1.25rem;
		font-weight: 300;
		color: var(--text-primary);
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 22rem) minmax(0, 30rem);
		gap: 0.75rem;
		align-items: start;
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		width: 100%;
		min-height: 3rem;
		padding: 0 0.5rem;
		border: 0;
		border-radius: var(--radius-row);
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		font: inherit;
	}
	.pick {
		cursor: pointer;
	}
	.pick:hover,
	.pick[aria-pressed='true'] {
		background: var(--surface-tile);
	}
	.text {
		display: grid;
		gap: 0.25rem;
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
	}
	.sub,
	.empty,
	.list,
	.note {
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin: 0 0.25rem;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.25rem;
		margin-top: 0.75rem;
	}
	@media (max-width: 760px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
