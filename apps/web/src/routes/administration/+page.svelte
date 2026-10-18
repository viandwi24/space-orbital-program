<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * Administration (plan 099, ADR 0186; refs W5 `Admin.dc.html`): the agency strip, then Contracts
	 * (Offered / Active / Completed, a contract's detail with Accept, Decline and Cancel) and
	 * Strategies (plan 101, ADR 0187: ratios, caps, upkeep and the projection; Activate and End).
	 * It runs the world's sim from its newest save and saves after a change.
	 */
	import { onMount } from 'svelte';
	import { calendarOf, homeBodyOf, type Snapshot } from '@orbital/core';
	import { loadContent, partLookup } from '../../lib/catalog';
	import { parseDesign, referenceTwoStage } from '../../lib/design';
	import { loadDraft } from '../../lib/storage';
	import { GAME_NAME } from '../../lib/public/about';
	import type { GameSave } from '../../lib/save/game-save';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import { startSimWorker, type SimClient } from '../../lib/sim-client';
	import BackButton from '../../lib/ui/BackButton.svelte';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import Segmented from '../../lib/ui/Segmented.svelte';
	import { activeWorldId } from '../../lib/worlds/worlds';
	import ContractsTab from '../../lib/administration/ContractsTab.svelte';
	import StrategiesTab from '../../lib/administration/StrategiesTab.svelte';
	import {
		strategyCards,
		strategyCommand,
		strategySlotsText
	} from '../../lib/administration/strategies-model';
	import {
		agencyStrip,
		contractCommand,
		type ContractTab
	} from '../../lib/administration/contracts-model';

	const { catalog, world: registries } = loadContent();
	const day = (() => {
		try {
			const c = calendarOf(catalog.bodies);
			return c.kind === 'fictional' ? c.dayLength : 86_400;
		} catch {
			return 86_400;
		}
	})();
	const hangarDesign = () => {
		const text = loadDraft();
		const parsed = text ? parseDesign(text, partLookup(catalog)) : null;
		return parsed?.ok && parsed.design.parts.length > 0 ? parsed.design : null;
	};
	let client: SimClient | null = null;
	let loaded: GameSave | undefined;
	let snapshot = $state.raw<Snapshot | null>(null);
	let section = $state<'contracts' | 'strategies'>('contracts');
	let tab = $state<ContractTab>('offered');
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
				design: loaded?.design ?? hangarDesign() ?? referenceTwoStage(),
				thumbnail: null,
				bodyRadius: homeBodyOf(catalog.bodies)?.radius ?? 0
			};
		}
	});

	const strip = $derived(agencyStrip(snapshot));
	const cards = $derived(
		snapshot
			? strategyCards(
					{
						snapshot,
						charges: registries.charges.list(),
						buildings: registries.buildings,
						strategies: registries.strategies
					},
					snapshot.t,
					day
				)
			: []
	);

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

	const DONE = {
		accept: 'Contract accepted; the advance is paid.',
		decline: 'Offer declined.',
		cancel: 'Contract cancelled; the penalty is booked.'
	} as const;

	async function strategy(action: 'activate' | 'end', id: string): Promise<void> {
		if (!client) return;
		const r = await client.dispatch(strategyCommand(action, id));
		if (!r.ok) {
			note = r.reason;
			return;
		}
		const done =
			action === 'activate' ? 'Strategy activated.' : 'Strategy ended; its cooldown starts.';
		note = (await saves.autosave()) ? done : `${done} The world could not be saved.`;
	}

	async function act(action: 'accept' | 'decline' | 'cancel', id: string): Promise<void> {
		if (!client) return;
		const r = await client.dispatch(contractCommand(action, id));
		if (!r.ok) {
			note = r.reason;
			return;
		}
		// the next flight runs this save (as the Astronaut Complex does, ADR 0152 point 2)
		note = (await saves.autosave())
			? DONE[action]
			: `${DONE[action]} The world could not be saved.`;
		if (action === 'accept') tab = 'active';
		if (action !== 'accept') selected = null;
	}
</script>

<PageMeta title="Administration · {GAME_NAME}" />

<main class="admin">
	<header>
		<BackButton href={resolve('/space-center')} label="Back to the Space Center" />
		<div class="title">
			<span class="cap">Space Center</span>
			<h1>Administration</h1>
		</div>
	</header>
	<dl class="strip" data-testid="admin-strip">
		<div>
			<dt>Funds</dt>
			<dd>{strip.funds}</dd>
		</div>
		<div>
			<dt>Reputation</dt>
			<dd>{strip.reputation}</dd>
		</div>
		<div>
			<dt>Science</dt>
			<dd>{strip.science}</dd>
		</div>
		<div>
			<dt>Contracts</dt>
			<dd>{strip.contracts}</dd>
		</div>
		<div>
			<dt>Strategies</dt>
			<dd>{strategySlotsText(snapshot?.strategies)}</dd>
		</div>
	</dl>
	<div class="bar">
		<Segmented
			label="Section"
			value={section}
			options={[
				{ value: 'contracts', label: 'Contracts' },
				{ value: 'strategies', label: 'Strategies' }
			]}
			onchange={(v) => (section = v)}
			testid="admin-section"
		/>
	</div>
	{#if note}<p class="note" role="status">{note}</p>{/if}
	{#if section === 'contracts'}
		<ContractsTab
			{snapshot}
			{day}
			{tab}
			{selected}
			disabled={!ready}
			ontab={(t) => {
				tab = t;
				selected = null;
			}}
			onselect={(id) => (selected = id)}
			onaction={(a, id) => void act(a, id)}
		/>
	{:else}
		<StrategiesTab {cards} disabled={!ready} onaction={(a, id) => void strategy(a, id)} />
	{/if}
</main>

<style>
	.admin {
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
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		line-height: 1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.strip {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		margin: 0 0 0.75rem;
	}
	.strip dt {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.strip dd {
		margin: 0.25rem 0 0;
		font-size: var(--t-button);
		font-variant-numeric: tabular-nums;
		color: var(--text-primary);
	}
	.bar {
		margin-bottom: 0.75rem;
	}
	.note {
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
</style>
