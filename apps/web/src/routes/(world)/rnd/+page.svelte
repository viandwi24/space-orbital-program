<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * Research and Development (plan 105, ADR 0154 point 5): the world's tech tree in tier columns,
	 * a node's detail, and Research. Its sim runs from the world's newest save (or its start info),
	 * and a research is saved at once.
	 */
	import { homeBodyOf, loadPlugins, type Snapshot } from '@orbital/core';
	import Stock from '@orbital/mod-stock';
	import { onMount } from 'svelte';
	import { referenceTwoStage } from '../../../lib/design';
	import { activePlugins } from '../../../lib/mods/runtime';
	import { GAME_NAME } from '../../../lib/public/about';
	import type { GameSave } from '../../../lib/save/game-save';
	import { bootedMods, modHint } from '../../../lib/save/mods';
	import { SaveController } from '../../../lib/save/save-controller.svelte';
	import type { SimClient } from '../../../lib/sim-client';
	import { worldSession } from '../../../lib/world-session';
	import { bootWorld } from '../../../lib/world-boot';
	import { goto } from '$app/navigation';
	import { STATE_LABEL, techColumns } from '../../../lib/tech/rnd-model';
	import BackButton from '../../../lib/ui/BackButton.svelte';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import Panel from '../../../lib/ui/Panel.svelte';
	import { activeWorldId } from '../../../lib/worlds/worlds';

	const { registries } = loadPlugins([Stock, ...activePlugins()]);
	const nodes = registries.techNodes.list();
	const partTitle = (id: string): string => registries.parts.get(id)?.title ?? id;

	let client: SimClient | null = null;
	let loaded: GameSave | undefined;
	let snapshot = $state.raw<Snapshot | null>(null);
	let ready = $state(false);
	let selected = $state<string | null>(null);
	let note = $state<string | null>(null);
	let busy = $state(false);

	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`)),
		world: () => activeWorldId(),
		collect: async () => {
			if (!client) throw new Error('The world is not running.');
			return {
				sim: await client.save(),
				focus: loaded?.focus ?? null,
				design: loaded?.design ?? referenceTwoStage(),
				thumbnail: null,
				bodyRadius: homeBodyOf(registries.bodies.list())?.radius ?? 0
			};
		}
	});

	const columns = $derived(techColumns(nodes, snapshot, partTitle));
	const on = $derived(snapshot?.tech?.enabled === true);
	const detail = $derived(
		columns.flatMap((c) => c.nodes).find((n) => n.id === selected) ?? columns[0]?.nodes[0] ?? null
	);
	const science = $derived(snapshot?.economy?.science ?? 0);

	async function research(): Promise<void> {
		if (!client || !detail) return;
		busy = true;
		const r = await client.dispatch({ type: 'research', node: detail.id });
		note = r.ok ? null : r.reason;
		if (r.ok && !(await saves.autosave())) note = saves.note;
		busy = false;
	}

	onMount(() => {
		let gone = false;
		const offs: Array<() => void> = [];
		void (async () => {
			// the world's one sim (plan 204, ADR 0201): the page reads it and leaves it running
			const shared = await bootWorld(worldSession, activeWorldId());
			loaded = worldSession.base ?? undefined;
			if (gone) return;
			client = shared;
			snapshot = shared.latest;
			offs.push(shared.onSnapshot((s) => (snapshot = s)));
			offs.push(shared.onError((m) => (note = m)));
			shared.ready.then(
				() => (ready = true),
				(e: unknown) => (note = e instanceof Error ? e.message : String(e))
			);
		})();
		return () => {
			gone = true;
			for (const off of offs) off();
		};
	});
</script>

<PageMeta
	title="R&D · {GAME_NAME}"
	description="The world's tech tree: research nodes with science to unlock parts."
/>

<main class="rnd">
	<header>
		<BackButton href={resolve('/(world)/space-center')} label="Back to the Space Center" />
		<div class="title">
			<span class="cap">Research and Development</span>
			<h1>Tech tree</h1>
		</div>
		<span class="science" data-testid="rnd-science">{science.toFixed(1)} science</span>
	</header>

	{#if ready && !on}
		<p class="empty" data-testid="rnd-off">
			This world has no tech tree: every part is available. Turn it on in a new Career world.
		</p>
	{/if}

	<div class="body">
		<div class="tiers" data-testid="rnd-tiers">
			{#each columns as col (col.tier)}
				<section class="tier" aria-label="Tier {col.tier}">
					<span class="cap">Tier {col.tier}</span>
					{#each col.nodes as n (n.id)}
						<button
							type="button"
							class="node {n.state}"
							aria-pressed={detail?.id === n.id}
							data-testid="rnd-node-{n.id}"
							data-state={n.state}
							onclick={() => (selected = n.id)}
						>
							<span class="name">{n.label}</span>
							<span class="sub">{STATE_LABEL[n.state]}{n.cost > 0 ? ` · ${n.cost} sci` : ''}</span>
						</button>
					{/each}
				</section>
			{/each}
		</div>

		{#if detail}
			<Panel title={detail.label} data-testid="rnd-detail">
				<p class="state" data-state={detail.state}>{STATE_LABEL[detail.state]}</p>
				{#if detail.description}<p class="desc">{detail.description}</p>{/if}
				<span class="cap">Unlocks</span>
				<ul class="parts">
					{#each detail.unlocks as t (t)}<li>{t}</li>{:else}<li class="muted">No parts</li>{/each}
				</ul>
				{#if detail.reason && detail.state === 'locked'}
					<p class="reason" data-testid="rnd-reason">Locked: {detail.reason}.</p>
				{/if}
				<button
					type="button"
					class="go"
					data-testid="rnd-research"
					disabled={!ready || !on || busy || detail.state !== 'available'}
					onclick={() => void research()}
				>
					{detail.state === 'unlocked' ? 'Researched' : `Research · ${detail.cost} science`}
				</button>
				{#if note}<p class="reason" role="status" data-testid="rnd-note">{note}</p>{/if}
			</Panel>
		{/if}
	</div>
</main>

<style>
	.rnd {
		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		padding: var(--margin-hud);
		background: var(--bg-ground);
		color: var(--text-primary);
	}
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.title {
		display: grid;
		gap: 0.25rem;
	}
	.science {
		margin-left: auto;
		font-size: var(--t-button);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
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
	}
	.body {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 20rem;
		gap: 0.75rem;
		align-items: start;
	}
	.tiers {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: minmax(10rem, 1fr);
		gap: 0.75rem;
		overflow-x: auto;
	}
	.tier {
		display: grid;
		align-content: start;
		gap: 0.375rem;
	}
	.node {
		display: grid;
		gap: 0.25rem;
		padding: 0.625rem 0.75rem;
		border: 1px solid transparent;
		border-radius: 0.6875rem;
		background: var(--surface-tile);
		color: var(--text-primary);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.node.locked {
		color: var(--text-muted);
		background: var(--surface-inset);
	}
	.node.available {
		border-color: var(--accent-text);
	}
	.node[aria-pressed='true'] {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
	}
	.sub,
	.muted {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.state,
	.desc {
		margin: 0.375rem;
		font-size: var(--t-small);
	}
	.parts {
		margin: 0.375rem;
		padding-left: 1.25rem;
		font-size: var(--t-small);
	}
	.reason,
	.empty {
		margin: 0.5rem 0.375rem 0;
		font-size: var(--t-small);
		color: var(--warn);
	}
	.empty {
		margin: 0 0 1rem;
		color: var(--text-muted);
	}
	.go {
		width: 100%;
		height: 2.75rem;
		margin-top: 0.75rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--selected-bg);
		color: var(--selected-fg);
		font: inherit;
		font-size: var(--t-button);
		font-weight: 700;
		cursor: pointer;
	}
	.go:disabled {
		background: var(--surface-button);
		color: var(--text-disabled);
		cursor: default;
	}
	@media (max-width: 899px) {
		.body {
			grid-template-columns: 1fr;
		}
	}
</style>
