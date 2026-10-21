<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Worlds screen (plan 087, ADRs 0094 and 0143; the v3 console-style library since plan 317,
	 * V3_CHANGES §3): the chosen world fills the screen as its planet, the worlds are tiles along the
	 * top with "+ New world", the hero holds its facts, Continue/Enter and four round actions, and the
	 * history and achievements sit under it; Achievements has its own tab. Create World is a full page.
	 */
	import type { WorldInfo } from '@orbital/core';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import { ago } from '../../lib/save/describe';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import type { WorldRecord } from '../../lib/save/world-record';
	import Button from '../../lib/ui/Button.svelte';
	import Dialog from '../../lib/ui/Dialog.svelte';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import { loadWorldCatalog, type WorldCatalog } from '../../lib/worlds/catalog';
	import CreateWorld from '../../lib/worlds/CreateWorld.svelte';
	import { historyJson, historyMarkdown, historyOf } from '../../lib/worlds/history';
	import { milestoneIcon } from '../../lib/worlds/milestone-icons';
	import { worldHue } from '../../lib/worlds/system-art';
	import { formatLatLon } from '../../lib/worlds/world-model';
	import { downloadText, fileNameOf } from '../../lib/download';
	import type { Profile } from '../../lib/achievements/profile';
	import AchievementsPanel from '../../lib/achievements/AchievementsPanel.svelte';
	import { profileStore } from '../../lib/achievements/store';
	import type { Epoch, MilestoneRecord } from '@orbital/core';
	import { enterWorld } from '../../lib/worlds/enter';
	import { leaveLesson } from '../../lib/onboarding/lesson-world';
	import { homeBodyOf } from '@orbital/core';
	import { createWorldInfo } from '../../lib/worlds/world-model';
	import { requestSavePersistence } from '../../lib/save/open-store';
	import { markPersistenceWarned, persistenceWarned } from '../../lib/save/backup-state';
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
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`))
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
	/** The tab (V3 §3) and the hero's open menu: Export or the Delete confirm. */
	let tab = $state<'worlds' | 'achievements'>('worlds');
	let menu = $state<'export' | 'delete' | null>(null);
	let profile = $state.raw<Profile | null>(null);
	const store = profileStore();
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
		void saves.worldsService().then(async (w) => {
			// a lesson quit from the pause menu ends here: the player's world comes back (plan 229)
			await leaveLesson(w);
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
			// save safety (plan 230): ask the browser to keep the saves; say so once when it will not
			if (!(await requestSavePersistence()) && !persistenceWarned()) {
				note +=
					' This browser may delete saves when it runs short of space: export a backup from Settings → Saves.';
				markPersistenceWarned();
			}
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
			menu = null;
			selected = null;
			await refresh();
			note = 'Deleted the world and its saves.';
		});

	// what the hero shows of the chosen world (V3 §3.2)
	const systemOf = (r: WorldRecord) =>
		catalog?.systems.find((s) => s.id === (r.world?.systemId ?? 'stock')) ?? catalog?.systems[0];
	const hueOf = (r: WorldRecord): string[] => {
		const system = systemOf(r);
		return worldHue(r.id, system ? homeBodyOf(system.bodies) : undefined);
	};
	const hue = $derived(chosen ? hueOf(chosen) : ['#555', '#333', '#222', '#111']);
	const systemLabel = (r: WorldRecord): string => systemOf(r)?.label ?? 'Stock system';
	const siteText = (r: WorldRecord): string => {
		const site = r.world?.sites[0];
		return site ? `Site ${formatLatLon(site.latitude, site.longitude)}` : 'Default site (0°, 0°)';
	};
	const lineOf = (r: WorldRecord): string =>
		[
			systemLabel(r),
			r.world ? `Seed ${r.world.seed}` : null,
			siteText(r),
			r.world?.gravityModel === 'n-body' ? 'N-body' : 'Patched conics'
		]
			.filter(Boolean)
			.join(' · ');
	const entriesOf = $derived(
		catalog && history && chosen && history.id === chosen.id
			? historyOf(history.records, { bodies: catalog.bodies, epoch: history.epoch })
			: []
	);
	const achDone = $derived(
		catalog ? catalog.achievements.filter((a) => profile?.unlocked[a.id] !== undefined).length : 0
	);
	$effect(() => {
		void store.get().then((p) => (profile = p));
	});
	function exportHistory(kind: 'md' | 'json'): void {
		if (!chosen) return;
		menu = null;
		if (kind === 'md')
			downloadText(
				historyMarkdown(chosen.name, entriesOf),
				fileNameOf(`${chosen.name} history`, 'md'),
				'text/markdown'
			);
		else
			downloadText(
				historyJson(chosen.name, entriesOf),
				fileNameOf(`${chosen.name} history`, 'json'),
				'application/json'
			);
	}
	function pickTile(id: string): void {
		selected = id;
		menu = null;
	}
	function onTilesKey(e: KeyboardEvent): void {
		const i = records.findIndex((r) => r.id === chosen?.id);
		const next =
			e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : -2;
		if (next === -2 || records.length === 0) return;
		e.preventDefault();
		const r = records[(next + records.length) % records.length]!;
		pickTile(r.id);
		document.querySelector<HTMLElement>(`[data-world="${r.id}"]`)?.focus();
	}
</script>

<PageMeta
	title="Worlds · {GAME_NAME}"
	description="Choose or create a world: each keeps its own vessels, crew and progress."
/>

<main
	class="worlds"
	style:--h0={hue[0]}
	style:--h1={hue[1]}
	style:--h2={hue[2]}
	style:--h3={hue[3]}
>
	<!-- the chosen world fills the screen (V3 §3.2): its planet at the right, shaded from the left -->
	<div class="planet" aria-hidden="true"></div>
	<div class="shade" class:dim={tab === 'achievements'} aria-hidden="true"></div>

	<header class="top">
		<a class="round" href={resolve('/')} aria-label="Back to the main menu" data-tip="Back"
			><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
				><path d="M19 12 H5 M11 6 L5 12 L11 18" /></svg
			></a
		>
		<div class="tabs" role="tablist" aria-label="Library">
			<button
				type="button"
				role="tab"
				class="tab"
				aria-selected={tab === 'worlds'}
				data-testid="worlds-tab"
				onclick={() => ((tab = 'worlds'), (menu = null))}
				>Worlds <span class="count">{records.length}</span></button
			>
			<button
				type="button"
				role="tab"
				class="tab"
				aria-selected={tab === 'achievements'}
				data-testid="achievements-tab"
				onclick={() => ((tab = 'achievements'), (menu = null))}>Achievements</button
			>
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
		<button
			type="button"
			class="pill"
			disabled={!catalog}
			onclick={() => challengeInput?.click()}
			data-testid="worlds-challenge">Import challenge</button
		>
	</header>

	{#if note}<p class="note" role="status">{note}</p>{/if}

	{#if tab === 'worlds'}
		<!-- the tile row (V3 §3.2): + New world, then a tile per world; the chosen one grows -->
		<div class="tiles">
			<button
				type="button"
				class="tile new"
				disabled={!catalog}
				onclick={() => (createOpen = true)}
				data-testid="worlds-create"
				><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"
					><path d="M12 5 V19 M5 12 H19" /></svg
				><span>New world</span></button
			>
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<div class="list" role="listbox" aria-label="Worlds" onkeydown={onTilesKey}>
				{#each records as r (r.id)}
					{@const h = hueOf(r)}
					{@const on = chosen?.id === r.id}
					<div class="slot">
						<button
							type="button"
							role="option"
							class="tile"
							class:on
							aria-selected={on}
							aria-label={r.name}
							tabindex={on ? 0 : -1}
							data-testid="world-card"
							data-world={r.id}
							style:--t0={h[0]}
							style:--t1={h[1]}
							style:--t2={h[2]}
							style:--t3={h[3]}
							onclick={() => pickTile(r.id)}
						>
							<span class="ball" aria-hidden="true"></span>
							{#if r.usedCheats}<span class="cheatdot" aria-hidden="true"></span>{/if}
						</button>
						<span class="tname" class:on>{r.name}</span>
					</div>
				{/each}
			</div>
		</div>

		{#each entries as e (e.ok ? e.record.id : e.id)}
			{#if !e.ok}
				<p class="broken">World {e.id}: {e.error}</p>
			{/if}
		{/each}

		{#if chosen}
			<section class="hero" aria-label="Selected world" data-testid="world-details">
				<div class="chips">
					<span class="chip">{presetLabel(chosen.preset).toUpperCase()}</span>
					<span class="chip">{systemLabel(chosen).toUpperCase()}</span>
					{#if chosen.usedCheats}<span
							class="chip warn"
							data-testid="used-cheats"
							data-tip="Cheats were used in this world, so achievements can't unlock here."
							><svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"
								><path d="M12 4 L21 20 H3 Z M12 10 V14 M12 17 H12.01" /></svg
							>CHEATS USED · NO ACHIEVEMENTS</span
						>{/if}
					{#if chosen.changelog.length > 0}<span class="chip" data-testid="rules-changed"
							>RULES CHANGED</span
						>{/if}
				</div>
				<h1>{chosen.name}</h1>
				<p class="line">{lineOf(chosen)}</p>
				{#if missingMod(chosen)}<p class="warnline">Uses a mod that is no longer installed</p>{/if}
				<dl class="stats">
					<div>
						<dt>Saves</dt>
						<dd>{chosen.summary.saves}</dd>
					</div>
					<div>
						<dt>Last vessel</dt>
						<dd>{chosen.summary.vessel ?? '—'}</dd>
					</div>
					<div>
						<dt>Flight time</dt>
						<dd>{chosen.summary.saves > 0 ? days(chosen.summary.simTime) : '0 h'}</dd>
					</div>
					<div>
						<dt>Created</dt>
						<dd>{ago(chosen.createdAt, now)}</dd>
					</div>
					<div>
						<dt>Last played</dt>
						<dd>{ago(chosen.lastPlayedAt, now)}</dd>
					</div>
				</dl>
				<div class="acts">
					<button
						type="button"
						class="play"
						onclick={() => void enter(chosen.id)}
						data-testid="world-enter"
						><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
							><path d="M7 4 L20 12 L7 20 Z" /></svg
						>{chosen.summary.saves > 0 ? 'Continue' : 'Enter world'}</button
					>
					<button
						type="button"
						class="act"
						aria-label="Duplicate world"
						data-tip="Duplicate world"
						onclick={() => void duplicate(chosen.id)}
						><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"
							><path d="M8 8 H20 V20 H8 Z M4 16 V4 H16" /></svg
						></button
					>
					<button
						type="button"
						class="act"
						aria-label="Rename world"
						data-tip="Rename world"
						onclick={() => {
							renameTo = chosen.name;
							menu = null;
							renameOpen = true;
						}}
						><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"
							><path d="M4 20 L5 15 L15 5 L19 9 L9 19 Z M13 7 L17 11" /></svg
						></button
					>
					<button
						type="button"
						class="act"
						class:open={menu === 'export'}
						aria-label="Export history"
						aria-expanded={menu === 'export'}
						data-tip="Export history"
						onclick={() => (menu = menu === 'export' ? null : 'export')}
						><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"
							><path d="M12 3 V15 M7 10 L12 15 L17 10 M4 19 H20" /></svg
						></button
					>
					<button
						type="button"
						class="act danger"
						class:open={menu === 'delete'}
						aria-label="Delete world"
						aria-expanded={menu === 'delete'}
						data-tip="Delete world"
						onclick={() => (menu = menu === 'delete' ? null : 'delete')}
						><svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"
							><path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7 M10 11 V16 M14 11 V16" /></svg
						></button
					>
					{#if menu === 'export'}
						<div class="menu" role="menu">
							<button type="button" role="menuitem" onclick={() => exportHistory('md')}
								>Export history · Markdown</button
							>
							<button type="button" role="menuitem" onclick={() => exportHistory('json')}
								>Export history · JSON</button
							>
						</div>
					{:else if menu === 'delete'}
						<div class="menu confirm" role="dialog" aria-label="Delete world">
							<strong>Delete “{chosen.name}”?</strong>
							<span
								>Its {chosen.summary.saves}
								{chosen.summary.saves === 1 ? 'save' : 'saves'}, vessels, crew and history are
								removed. This can’t be undone.</span
							>
							<span class="row">
								<button type="button" class="soft" onclick={() => (menu = null)}>Cancel</button>
								<button
									type="button"
									class="soft red"
									onclick={() => void remove(chosen.id)}
									data-testid="world-delete-confirm">Delete</button
								>
							</span>
						</div>
					{/if}
				</div>
			</section>

			<section class="activity" aria-label="History" data-testid="world-history">
				<div class="ahead">
					<span class="cap">History</span>
					{#if entriesOf.length}<span class="hcount"
							>{entriesOf.length} {entriesOf.length === 1 ? 'milestone' : 'milestones'}</span
						>{/if}
				</div>
				<div class="cards">
					{#each entriesOf.slice(-4) as e (e.record.id)}
						<div class="hcard">
							<span class="hwhen"
								><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
									><path d={milestoneIcon(e.record.kind, e.record.crewed)} /></svg
								>{e.date}</span
							>
							<span class="htitle">{e.text}</span>
						</div>
					{:else}
						<div class="hcard empty">
							Nothing yet. Milestones like your first launch and first orbit appear here.
						</div>
					{/each}
					{#if catalog}
						<button
							type="button"
							class="hcard ach"
							data-testid="achievements-card"
							onclick={() => ((tab = 'achievements'), (menu = null))}
						>
							<span class="ahead2"
								><span class="cap">Achievements</span><svg
									viewBox="0 0 24 24"
									width="12"
									height="12"
									aria-hidden="true"><path d="M9 6 L15 12 L9 18" /></svg
								></span
							>
							<span class="adone"
								>{achDone} <span class="aof">/ {catalog.achievements.length} unlocked</span></span
							>
							<span class="abar"
								><span
									style:width="{catalog.achievements.length
										? (achDone / catalog.achievements.length) * 100
										: 0}%"
								></span></span
							>
						</button>
					{/if}
				</div>
			</section>
		{:else if worlds}
			<section class="hero">
				<h1>No worlds</h1>
				<p class="line">Create a world to start playing, or start a flight from the main menu.</p>
			</section>
		{/if}
	{:else if catalog}
		<div class="achtab">
			<AchievementsPanel
				achievements={catalog.achievements}
				{store}
				usedCheats={chosen?.usedCheats ? chosen.name : null}
				onprofile={(p) => (profile = p)}
			/>
		</div>
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
			<div class="dactions">
				<Button variant="ghost" onclick={() => (renameOpen = false)}>Cancel</Button>
				<Button variant="primary" type="submit">Rename</Button>
			</div>
		</form>
	</Dialog>
{/if}

<style>
	/* V3_CHANGES §3: the console-style library */
	.worlds {
		position: relative;
		min-height: 100dvh;
		box-sizing: border-box;
		overflow: hidden;
		padding: 2rem 3rem 3rem;
		background: #03050a;
		color: var(--text-body);
		font-variant-numeric: tabular-nums;
	}
	.planet {
		position: absolute;
		left: 46%;
		top: 9.5rem;
		width: 94rem;
		height: 94rem;
		border-radius: 50%;
		background: radial-gradient(
			circle at 30% 26%,
			var(--h0) 0%,
			var(--h1) 22%,
			var(--h2) 48%,
			var(--h3) 72%
		);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--h0) 33%, transparent),
			0 0 160px 40px color-mix(in srgb, var(--h1) 27%, transparent);
		transition:
			background 600ms ease,
			box-shadow 600ms ease;
		pointer-events: none;
	}
	.shade {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(
				90deg,
				rgb(3 5 10 / 0.96) 0%,
				rgb(3 5 10 / 0.78) 38%,
				rgb(3 5 10 / 0.15) 70%,
				rgb(3 5 10 / 0) 100%
			),
			linear-gradient(0deg, rgb(3 5 10 / 0.95) 0%, rgb(3 5 10 / 0) 36%);
		pointer-events: none;
	}
	.shade.dim {
		background-color: rgb(3 5 10 / 0.72);
	}
	.top,
	.tiles,
	.hero,
	.activity,
	.achtab,
	.note,
	.broken {
		position: relative;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 1.75rem;
		height: 2.75rem;
	}
	.round {
		flex: none;
		width: 2.75rem;
		height: 2.75rem;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--text-primary);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.play svg {
		fill: currentColor;
		stroke: none;
	}
	.tabs {
		display: flex;
		gap: 1.75rem;
	}
	.tab {
		position: relative;
		height: 2.75rem;
		padding: 0;
		border: 0;
		background: transparent;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-subtle);
		font: inherit;
		font-size: 1.25rem;
		font-weight: 400;
		cursor: pointer;
	}
	.tab[aria-selected='true'] {
		color: var(--text-primary);
		font-weight: 600;
	}
	.tab[aria-selected='true']::after {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 0;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: #fff;
	}
	.count {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-subtle);
	}
	.pill {
		margin-left: auto;
		height: 2.5rem;
		padding: 0 1rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.note {
		margin: 1rem 0 0;
		font-size: 0.8125rem;
		color: var(--text-muted);
	}
	.broken {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		color: var(--danger);
	}
	/* tiles: 112 px, 128 when chosen, radius 24, a white ring offset 4 */
	.tiles {
		display: flex;
		align-items: flex-start;
		gap: 1.125rem;
		margin-top: 2.25rem;
		overflow-x: auto;
		padding: 6px;
		scrollbar-width: none;
	}
	.list {
		display: flex;
		align-items: flex-start;
		gap: 1.125rem;
	}
	.slot {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.625rem;
	}
	.tile {
		position: relative;
		flex: none;
		width: 7rem;
		height: 7rem;
		padding: 0;
		border: 0;
		border-radius: 24px;
		overflow: hidden;
		background: linear-gradient(160deg, #15171c, #07080b);
		outline: 1px solid rgb(255 255 255 / 0.08);
		opacity: 0.72;
		cursor: pointer;
		transition:
			width 200ms ease,
			height 200ms ease,
			opacity 200ms ease;
	}
	.tile.on {
		width: 8rem;
		height: 8rem;
		opacity: 1;
		outline: 2px solid #fff;
		outline-offset: 4px;
	}
	.tile:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
		opacity: 1;
	}
	.ball {
		position: absolute;
		left: 22%;
		top: 22%;
		width: 130%;
		height: 130%;
		border-radius: 50%;
		background: radial-gradient(
			circle at 30% 28%,
			var(--t0),
			var(--t1) 30%,
			var(--t2) 60%,
			var(--t3) 85%
		);
	}
	.cheatdot {
		position: absolute;
		right: 10px;
		top: 10px;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--warn);
	}
	.tile.new {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		border: 1.5px dashed rgb(255 255 255 / 0.28);
		border-radius: 22px;
		background: rgb(255 255 255 / 0.03);
		outline: none;
		opacity: 1;
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.6875rem;
		font-weight: 600;
	}
	.tname {
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
		color: transparent;
	}
	.tname.on {
		color: var(--text-primary);
	}
	/* the hero */
	.hero {
		display: flex;
		flex-direction: column;
		gap: 1.125rem;
		max-width: 56.25rem;
		margin: clamp(2rem, 9vh, 6rem) 0 0 1rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		height: 1.375rem;
		padding: 0 0.5625rem;
		display: flex;
		align-items: center;
		gap: 6px;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.12);
		color: var(--text-primary);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	.chip.warn {
		background: rgb(255 184 107 / 0.12);
		color: var(--warn);
	}
	h1 {
		margin: 0;
		font-size: clamp(3rem, 5.4vw, 4.75rem);
		line-height: 1;
		font-weight: 300;
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}
	.line {
		margin: 0;
		font-size: 0.9375rem;
		line-height: 1.4;
		color: #c4c4cc;
	}
	.warnline {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--warn);
	}
	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 1.25rem 2.5rem;
		margin: 0;
		padding-top: 0.625rem;
	}
	.stats div {
		display: flex;
		flex-direction: column;
		gap: 0.4375rem;
	}
	.stats dt {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.stats dd {
		margin: 0;
		font-size: 1.0625rem;
		font-weight: 500;
		color: var(--text-primary);
		white-space: nowrap;
		max-width: 16rem;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.acts {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-top: 1rem;
	}
	.play {
		height: 3.5rem;
		padding: 0 2rem 0 1.625rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--selected-bg);
		color: var(--selected-fg);
		font: inherit;
		font-size: 0.9375rem;
		font-weight: 700;
		cursor: pointer;
	}
	.act {
		width: 3.5rem;
		height: 3.5rem;
		box-sizing: border-box;
		display: grid;
		place-items: center;
		padding: 0;
		border-radius: 50%;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid rgb(255 255 255 / 0.1);
		color: var(--text-primary);
		cursor: pointer;
	}
	.act.open {
		background: rgb(255 255 255 / 0.16);
		border-color: rgb(255 255 255 / 0.24);
	}
	.act.danger {
		color: var(--danger);
	}
	.play:focus-visible,
	.act:focus-visible,
	.tab:focus-visible,
	.pill:focus-visible,
	.round:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 2px;
	}
	.menu {
		position: absolute;
		left: 21rem;
		top: 5.25rem;
		z-index: 2;
		width: 12.5rem;
		display: flex;
		flex-direction: column;
		padding: 6px;
		border-radius: 14px;
		background: rgb(22 23 26 / 0.92);
		-webkit-backdrop-filter: blur(24px);
		backdrop-filter: blur(24px);
		border: 1px solid rgb(255 255 255 / 0.1);
	}
	.menu button[role='menuitem'] {
		height: 2.25rem;
		padding: 0 0.625rem;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
	}
	.menu button[role='menuitem']:hover {
		background: var(--surface-hover);
	}
	.menu.confirm {
		left: 25.5rem;
		width: 17.5rem;
		box-sizing: border-box;
		gap: 0.625rem;
		padding: 0.875rem;
		border-color: rgb(255 138 142 / 0.35);
	}
	.confirm strong {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.confirm span {
		font-size: 0.6875rem;
		line-height: 1.45;
		color: var(--text-muted);
	}
	.confirm .row {
		display: flex;
		gap: 6px;
	}
	.soft {
		flex: 1;
		height: 2.125rem;
		border: 0;
		border-radius: 9px;
		background: rgb(255 255 255 / 0.08);
		color: var(--text-secondary);
		font: inherit;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}
	.soft.red {
		background: rgb(255 138 142 / 0.14);
		color: var(--danger);
	}
	/* the activity row: history cards and the achievements card */
	.activity {
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		margin: clamp(2rem, 6vh, 4rem) 1rem 0;
	}
	.ahead {
		display: flex;
		align-items: baseline;
		gap: 0.625rem;
	}
	.cap {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.hcount {
		font-size: 0.6875rem;
		color: var(--text-subtle);
	}
	.cards {
		display: flex;
		flex-wrap: wrap;
		gap: 0.875rem;
	}
	.hcard {
		width: 15.625rem;
		height: 7rem;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: 1rem;
		border-radius: 16px;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
	}
	.hcard.empty {
		width: 32.5rem;
		justify-content: center;
		border-style: dashed;
		border-color: rgb(255 255 255 / 0.18);
		background: transparent;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.hwhen {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.hwhen svg {
		color: var(--text-secondary);
	}
	.htitle {
		font-size: 0.9375rem;
		line-height: 1.2;
		font-weight: 600;
		color: var(--text-primary);
	}
	.hcard.ach {
		margin-left: auto;
		width: 18.75rem;
		text-align: left;
		color: var(--text-primary);
		font: inherit;
		cursor: pointer;
	}
	.ahead2 {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		color: var(--text-muted);
	}
	.adone {
		font-size: 1.625rem;
		line-height: 1;
		font-weight: 300;
	}
	.aof {
		font-size: 0.875rem;
		color: var(--text-muted);
	}
	.abar {
		display: block;
		width: 100%;
		height: 4px;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.12);
		overflow: hidden;
	}
	.abar span {
		display: block;
		height: 100%;
		background: var(--selected-bg);
	}
	.achtab {
		margin: 3rem 1rem 0;
	}
	.small-form {
		display: grid;
		gap: var(--s-3);
	}
	.small-form input {
		height: 2.5rem;
		padding: 0 0.75rem;
		border-radius: 10px;
		border: 1px solid rgb(255 255 255 / 0.1);
		background: rgb(255 255 255 / 0.04);
		color: var(--text-primary);
		font: inherit;
	}
	.dactions {
		display: flex;
		justify-content: flex-end;
		gap: var(--s-2);
	}
	@media (max-width: 900px) {
		.worlds {
			padding: 1.5rem;
		}
		.planet {
			left: 30%;
			top: 20rem;
		}
		.hcard.ach {
			margin-left: 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.planet,
		.tile {
			transition: none;
		}
	}
</style>
