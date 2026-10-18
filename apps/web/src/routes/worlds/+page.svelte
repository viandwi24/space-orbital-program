<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Worlds screen (plan 087, ADRs 0094 and 0143; refs `SCREENS.md` Worlds): every world as a card,
	 * the chosen one's details, Enter, Duplicate, Rename, Delete, and Create World.
	 */
	import type { WorldInfo } from '@orbital/core';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import { ago } from '../../lib/save/describe';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import type { WorldRecord } from '../../lib/save/world-record';
	import BackButton from '../../lib/ui/BackButton.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import Chip from '../../lib/ui/Chip.svelte';
	import Dialog from '../../lib/ui/Dialog.svelte';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import StatCell from '../../lib/ui/StatCell.svelte';
	import { loadWorldCatalog, type WorldCatalog } from '../../lib/worlds/catalog';
	import CreateWorld from '../../lib/worlds/CreateWorld.svelte';
	import WorldHistory from '../../lib/worlds/WorldHistory.svelte';
	import AchievementsPanel from '../../lib/achievements/AchievementsPanel.svelte';
	import { profileStore } from '../../lib/achievements/store';
	import type { Epoch, MilestoneRecord } from '@orbital/core';
	import { enterWorld } from '../../lib/worlds/enter';
	import { homeBodyOf } from '@orbital/core';
	import { createWorldInfo } from '../../lib/worlds/world-model';
	import {
		bookStore,
		challengeWorldInput,
		importChallenge,
		markWorld
	} from '../../lib/challenges/challenge-model';
	import {
		activeWorldId,
		browserWorldsEnv,
		type WorldEntry,
		type Worlds
	} from '../../lib/worlds/worlds';

	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(resolve(`/flight?load=${encodeURIComponent(id)}`))
	});
	const env = browserWorldsEnv();

	let worlds = $state.raw<Worlds | null>(null);
	let entries = $state<WorldEntry[]>([]);
	let selected = $state<string | null>(null);
	let catalog = $state.raw<WorldCatalog | null>(null);
	let createOpen = $state(false);
	let renameOpen = $state(false);
	let renameTo = $state('');
	let deleteOpen = $state(false);
	let note = $state<string | null>(null);
	let now = $state(Date.now());

	const records = $derived(entries.flatMap((e) => (e.ok ? [e.record] : [])));
	const chosen = $derived(records.find((r) => r.id === selected) ?? records[0] ?? null);
	const loaded = bootedMods();

	// the chosen world's firsts (plan 102, ADR 0147), read from its newest save
	let history = $state.raw<{ id: string; records: MilestoneRecord[]; epoch: Epoch } | null>(null);
	$effect(() => {
		const id = chosen?.id;
		if (!worlds || id === undefined) return;
		void worlds.milestones(id).then((h) => {
			if (chosen?.id === id) history = { id, ...h };
		});
	});

	async function refresh(select?: string): Promise<void> {
		if (!worlds) return;
		now = Date.now();
		entries = await worlds.list();
		if (select) selected = select;
	}

	onMount(() => {
		catalog = loadWorldCatalog();
		void saves.worldsService().then((w) => {
			worlds = w;
			selected = activeWorldId();
			return refresh();
		});
	});

	const presetLabel = (preset: string): string => {
		const found =
			catalog?.presets.find((p) => p.id === preset) ??
			catalog?.presets.find((p) => p.id === `stock.${preset}`);
		return found?.label ?? preset;
	};
	const missingMod = (r: WorldRecord): boolean => r.mods.some((m) => !loaded.has(m.id));
	const days = (simTime: number): string =>
		simTime < 86_400 ? `${Math.round(simTime / 3600)} h` : `${Math.round(simTime / 86_400)} days`;

	async function guard(work: () => Promise<void>): Promise<void> {
		note = null;
		try {
			await work();
		} catch (e) {
			note = e instanceof Error ? e.message : String(e);
		}
	}

	async function create(world: WorldInfo, name: string, scenario?: string): Promise<void> {
		await guard(async () => {
			const record = await worlds!.create(world, name, catalog!.mods, scenario);
			createOpen = false;
			await refresh(record.id);
			note = `Created "${record.name}".`;
		});
	}
	// challenges (plan 131, ADR 0159 point 6): a file makes a world marked with its challenge
	const challenges = bookStore(typeof localStorage === 'undefined' ? null : localStorage);
	let challengeInput = $state<HTMLInputElement>();
	const importChallengeFile = (file: File) =>
		guard(async () => {
			const imported = importChallenge(challenges, await file.text());
			if (!imported.ok) throw new Error(`This file cannot be imported: ${imported.reason}.`);
			const c = imported.challenge;
			const system =
				catalog!.systems.find((x) => x.id === (c.system?.id ?? 'stock')) ?? catalog!.systems[0]!;
			const result = createWorldInfo(
				{
					...challengeWorldInput(c, env.newId(), env.newSeed(), system.version),
					home: homeBodyOf(system.bodies)?.id
				},
				catalog!,
				system.calendar,
				Date.now()
			);
			if (!result.ok) throw new Error(`This challenge cannot be played: ${result.reason}.`);
			const record = await worlds!.create(result.world, c.title, catalog!.mods);
			markWorld(challenges, record.id, c.id);
			await refresh(record.id);
			note = `Imported the challenge "${c.title}": reach ${c.goal} in this world to score it.`;
		});
	const enter = (id: string) => guard(() => enterWorld(worlds!, id, (url) => goto(url)));
	const duplicate = (id: string) =>
		guard(async () => {
			const copy = await worlds!.duplicate(id);
			await refresh(copy.id);
			note = `Duplicated as "${copy.name}".`;
		});
	const rename = (id: string) =>
		guard(async () => {
			const r = await worlds!.rename(id, renameTo);
			renameOpen = false;
			await refresh(r.id);
		});
	const remove = (id: string) =>
		guard(async () => {
			await worlds!.remove(id);
			deleteOpen = false;
			selected = null;
			await refresh();
			note = 'Deleted the world and its saves.';
		});
</script>

<PageMeta
	title="Worlds · {GAME_NAME}"
	description="Choose or create a world: each keeps its own vessels, crew and progress."
/>

<main class="worlds">
	<header>
		<BackButton href={resolve('/')} label="Back to the main menu" />
		<div class="title">
			<h1>Worlds</h1>
			<p class="sub">
				{records.length}
				{records.length === 1 ? 'world' : 'worlds'} · each keeps its own vessels, crew and progress ·
				mods apply to every world
			</p>
		</div>
		<input
			bind:this={challengeInput}
			type="file"
			accept=".json,application/json"
			hidden
			data-testid="worlds-challenge-file"
			onchange={(e) => {
				const file = e.currentTarget.files?.[0];
				if (file) void importChallengeFile(file);
				e.currentTarget.value = '';
			}}
		/>
		<Button
			disabled={!catalog}
			onclick={() => challengeInput?.click()}
			data-testid="worlds-challenge">Import challenge</Button
		>
		<Button
			variant="primary"
			disabled={!catalog}
			onclick={() => (createOpen = true)}
			data-testid="worlds-create">Create world</Button
		>
	</header>

	{#if note}<p class="note" role="status">{note}</p>{/if}

	<div class="layout">
		<ul class="grid" aria-label="Worlds">
			{#each records as r, i (r.id)}
				<li>
					<button
						type="button"
						class="card"
						class:on={chosen?.id === r.id}
						aria-pressed={chosen?.id === r.id}
						data-testid="world-card"
						data-world={r.id}
						onclick={() => (selected = r.id)}
					>
						<span class="planet" aria-hidden="true"></span>
						<span class="name">{r.name}</span>
						<span class="chips">
							<Chip>{presetLabel(r.preset)}</Chip>
							{#if i === 0}<Chip outline>Last played</Chip>{/if}
							{#if r.usedCheats}<span data-testid="used-cheats"
									><Chip outline>Used cheats</Chip></span
								>{/if}
						</span>
						<span class="meta">
							{r.summary.saves}
							{r.summary.saves === 1 ? 'save' : 'saves'} · {ago(r.lastPlayedAt, now)}
						</span>
						{#if missingMod(r)}
							<span class="warn">Uses a mod that is no longer installed</span>
						{/if}
					</button>
				</li>
			{/each}
			{#each entries as e (e.ok ? e.record.id : e.id)}
				{#if !e.ok}
					<li class="broken">World {e.id}: {e.error}</li>
				{/if}
			{/each}
			{#if records.length === 0 && worlds}
				<li class="empty">No worlds yet. Create one, or start a flight from the main menu.</li>
			{/if}
		</ul>

		{#if chosen}
			<section class="details" aria-label="Selected world" data-testid="world-details">
				<span class="label">Selected world</span>
				<h2>{chosen.name}</h2>
				<div class="chips">
					<Chip>{presetLabel(chosen.preset)}</Chip>
					<Chip outline
						>{chosen.world?.systemId === 'stock' || !chosen.world
							? 'Stock system'
							: chosen.world.systemId}</Chip
					>
				</div>
				<div class="stats">
					<StatCell label="Saves" value={chosen.summary.saves} />
					<StatCell label="Last vessel" value={chosen.summary.vessel} />
					<StatCell
						label="Flight time"
						value={chosen.summary.saves > 0 ? days(chosen.summary.simTime) : null}
					/>
					<StatCell label="Mode" value={presetLabel(chosen.preset)} />
					<StatCell label="Created" value={ago(chosen.createdAt, now)} />
					<StatCell label="Seed" value={chosen.world?.seed} />
				</div>
				{#if catalog && history?.id === chosen.id}
					<WorldHistory
						world={chosen.name}
						records={history.records}
						bodies={catalog.bodies}
						epoch={history.epoch}
					/>
				{/if}
				<div class="actions">
					<Button variant="primary" onclick={() => void enter(chosen.id)} data-testid="world-enter"
						>Enter world</Button
					>
					<Button onclick={() => void duplicate(chosen.id)} aria-label="Duplicate world"
						>Duplicate</Button
					>
					<Button
						onclick={() => {
							renameTo = chosen.name;
							renameOpen = true;
						}}
						aria-label="Rename world">Rename</Button
					>
					<Button variant="danger" onclick={() => (deleteOpen = true)} aria-label="Delete world"
						>Delete</Button
					>
				</div>
			</section>
		{/if}
	</div>

	{#if catalog}
		<AchievementsPanel
			achievements={catalog.achievements}
			store={profileStore()}
			usedCheats={chosen?.usedCheats ? chosen.name : null}
		/>
	{/if}
</main>

{#if catalog && createOpen}
	<CreateWorld
		open={createOpen}
		{catalog}
		onclose={() => (createOpen = false)}
		oncreate={create}
		newId={env.newId}
		newSeed={env.newSeed}
	/>
{/if}

{#if chosen}
	<Dialog open={renameOpen} title="Rename world" onclose={() => (renameOpen = false)}>
		<form
			class="small-form"
			onsubmit={(e) => {
				e.preventDefault();
				void rename(chosen.id);
			}}
		>
			<input type="text" bind:value={renameTo} maxlength="48" aria-label="World name" />
			<div class="actions">
				<Button variant="ghost" onclick={() => (renameOpen = false)}>Cancel</Button>
				<Button variant="primary" type="submit">Rename</Button>
			</div>
		</form>
	</Dialog>
	<Dialog open={deleteOpen} title="Delete {chosen.name}?" onclose={() => (deleteOpen = false)}>
		<p>
			The world and its {chosen.summary.saves}
			{chosen.summary.saves === 1 ? 'save' : 'saves'} are deleted. This cannot be undone.
		</p>
		<div class="actions">
			<Button variant="ghost" onclick={() => (deleteOpen = false)}>Keep it</Button>
			<Button
				variant="danger"
				onclick={() => void remove(chosen.id)}
				data-testid="world-delete-confirm">Delete world</Button
			>
		</div>
	</Dialog>
{/if}

<style>
	.worlds {
		min-height: 100dvh;
		box-sizing: border-box;
		padding: var(--margin-hud) clamp(var(--margin-hud), 5vw, var(--margin-menu));
		background: var(--bg-ground);
		color: var(--text-body);
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--s-4);
		margin-bottom: var(--s-5);
	}
	.title {
		flex: 1;
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		font-weight: 300;
		color: var(--text-primary);
	}
	.sub,
	.note {
		margin: var(--s-1) 0 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		gap: var(--panel-gap);
		align-items: start;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: var(--panel-gap);
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.card {
		position: relative;
		display: grid;
		gap: var(--s-2);
		width: 100%;
		padding: var(--panel-pad) var(--s-3) var(--s-3);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		background: var(--surface-glass);
		color: var(--text-body);
		text-align: left;
	}
	.card.on {
		border-color: var(--border-strong);
		background: var(--surface-hover);
	}
	.card.on::after {
		content: '';
		position: absolute;
		top: var(--s-3);
		right: var(--s-3);
		width: var(--dot);
		height: var(--dot);
		border-radius: 50%;
		background: var(--text-primary);
	}
	.planet {
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		background: radial-gradient(
			circle at 35% 35%,
			var(--mnv-radial),
			var(--accent) 55%,
			var(--bg-hangar)
		);
	}
	.name {
		font-weight: 600;
		color: var(--text-primary);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1);
	}
	.meta {
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.warn {
		font-size: var(--t-small);
		color: var(--warn);
	}
	.broken,
	.empty {
		color: var(--text-muted);
	}
	.details {
		display: grid;
		gap: var(--s-3);
		padding: var(--s-4);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		background: var(--surface-glass);
	}
	.label {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h2 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
		color: var(--text-primary);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--s-2);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.small-form {
		display: grid;
		gap: var(--s-3);
	}
	.small-form input {
		min-height: var(--round-btn);
		padding: 0 var(--s-3);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		color: var(--text-body);
	}
	@media (max-width: 760px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
</style>
