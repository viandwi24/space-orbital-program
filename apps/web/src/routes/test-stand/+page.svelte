<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The test stand (plan 130, ADR 0156 points 5 to 7): the world's part models that can fail, their
	 * reliability, experience and grade, static fires, and the anomaly reports with their fixes. Its
	 * sim runs from the world's newest save (or its start info); every change is saved at once.
	 */
	import {
		GRADES,
		homeBodyOf,
		loadPlugins,
		type Command,
		type Grade,
		type Snapshot
	} from '@orbital/core';
	import Stock from '@orbital/mod-stock';
	import { onMount } from 'svelte';
	import { referenceTwoStage } from '../../lib/design';
	import { formatFunds } from '../../lib/format';
	import { activePlugins } from '../../lib/mods/runtime';
	import { GAME_NAME } from '../../lib/public/about';
	import {
		GRADE_TEXT,
		modelRows,
		percent,
		reportRows
	} from '../../lib/reliability/reliability-model';
	import type { GameSave } from '../../lib/save/game-save';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import { startSimWorker, type SimClient } from '../../lib/sim-client';
	import BackButton from '../../lib/ui/BackButton.svelte';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import Panel from '../../lib/ui/Panel.svelte';
	import { activeWorldId } from '../../lib/worlds/worlds';

	const { registries } = loadPlugins([Stock, ...activePlugins()]);
	const part = (id: string) => registries.parts.get(id);
	const mode = (id: string) => registries.failureModes.get(id);

	let client: SimClient | null = null;
	let loaded: GameSave | undefined;
	let snapshot = $state.raw<Snapshot | null>(null);
	let ready = $state(false);
	let note = $state<string | null>(null);
	let busy = $state(false);

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
				design: loaded?.design ?? referenceTwoStage(),
				thumbnail: null,
				bodyRadius: homeBodyOf(registries.bodies.list())?.radius ?? 0
			};
		}
	});

	const on = $derived(snapshot?.reliability !== undefined);
	const models = $derived(modelRows(snapshot?.reliability, part));
	const reports = $derived(reportRows(snapshot?.reliability, part, mode));
	const funds = $derived(snapshot?.economy?.enabled ? snapshot.economy.funds : null);

	async function send(command: Command): Promise<void> {
		if (!client) return;
		busy = true;
		const r = await client.dispatch(command);
		note = r.ok ? null : r.reason;
		if (r.ok && !(await saves.autosave())) note = saves.note;
		busy = false;
	}

	onMount(() => {
		let gone = false;
		void (async () => {
			try {
				await saves.refresh();
				const newest = saves.entries.find((e) => e.ok);
				loaded = newest?.ok ? await saves.read(newest.meta.id) : undefined;
			} catch (e) {
				note = e instanceof Error ? e.message : String(e);
			}
			const world = loaded ? undefined : await saves.worldStartInfo(activeWorldId());
			if (gone) return;
			client = startSimWorker(loaded ? { resume: loaded.sim } : world ? { world } : {});
			client.onSnapshot((s) => (snapshot = s));
			client.onError((m) => (note = m));
			client.ready.then(
				() => (ready = true),
				(e: unknown) => (note = e instanceof Error ? e.message : String(e))
			);
		})();
		return () => {
			gone = true;
			client?.dispose();
		};
	});
</script>

<PageMeta
	title="Test stand · {GAME_NAME}"
	description="Part reliability: grades, static fires and anomaly reports."
/>

<main class="stand">
	<header>
		<BackButton href={resolve('/space-center')} label="Back to the Space Center" />
		<div class="title">
			<span class="cap">Engineering</span>
			<h1>Test stand</h1>
		</div>
		{#if funds !== null}<span class="funds">{formatFunds(funds)}</span>{/if}
	</header>

	{#if ready && !on}
		<p class="empty" data-testid="stand-off">
			Parts never fail in this world. Part reliability is a world rule: the Career (engineering)
			preset turns it on.
		</p>
	{/if}
	{#if note}<p class="note" role="status" data-testid="stand-note">{note}</p>{/if}

	{#if on}
		<div class="cols">
			<Panel title="Part models" data-testid="stand-models">
				<div class="rows">
					{#each models as m (m.part)}
						<div class="row" data-testid="stand-model-{m.part}">
							<span class="text">
								<span class="name">{m.title}</span>
								<span class="sub">{percent(m.reliability)} reliable · {m.experience} trials</span>
							</span>
							<select
								aria-label="Grade of {m.title}"
								value={m.grade}
								disabled={busy}
								onchange={(e) =>
									void send({
										type: 'set-grade',
										part: m.part,
										grade: (e.currentTarget as HTMLSelectElement).value as Grade
									})}
							>
								{#each GRADES as g (g)}<option value={g}>{GRADE_TEXT[g]}</option>{/each}
							</select>
							<button
								type="button"
								class="act"
								disabled={busy}
								data-testid="stand-fire-{m.part}"
								onclick={() => void send({ type: 'static-fire', part: m.part })}
							>
								Static fire{m.fireCost > 0 && funds !== null ? ` · ${formatFunds(m.fireCost)}` : ''}
							</button>
						</div>
					{/each}
				</div>
			</Panel>

			<Panel title="Anomaly reports" data-testid="stand-reports">
				<div class="rows">
					{#each reports as r (r.id)}
						<div class="row" data-testid="stand-report">
							<span class="text">
								<span class="name">{r.mode}</span>
								<span class="sub">{r.title} · {r.where}</span>
							</span>
							{#if r.fixed}
								<span class="sub">Fixed</span>
							{:else}
								<button
									type="button"
									class="act"
									disabled={busy}
									onclick={() => void send({ type: 'fix-anomaly', report: r.id })}
								>
									Fix{r.fixCost > 0 && funds !== null ? ` · ${formatFunds(r.fixCost)}` : ''}
								</button>
							{/if}
						</div>
					{:else}
						<p class="empty">No anomaly yet.</p>
					{/each}
				</div>
			</Panel>
		</div>
	{/if}
</main>

<style>
	.stand {
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
	.funds {
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
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		gap: 0.75rem;
		align-items: start;
		max-width: 72rem;
	}
	.rows {
		display: grid;
		gap: 2px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		min-height: 3.25rem;
		padding: 0 0.5rem;
		border-radius: 0.6875rem;
	}
	.row:hover {
		background: var(--surface-tile);
	}
	.text {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
		margin-right: auto;
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
	}
	.sub {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	select,
	.act {
		height: 2rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-button);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		padding: 0 0.75rem;
	}
	.act {
		cursor: pointer;
	}
	.act:disabled {
		color: var(--text-disabled);
		cursor: default;
	}
	.empty,
	.note {
		margin: 0 0 1rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.note {
		color: var(--warn);
	}
	@media (max-width: 899px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
