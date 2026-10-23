<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Mods page as a mod manager (plan 046, ADR 0057; redesigned by plan 376, ADR 0312): every
	 * mod, built-in or installed, as a card with its status chip, what it adds, its dependencies and
	 * API range, a switch and its actions; search, a filter and sort; a drop zone and an address to
	 * install, and the trust prompt as a review dialog. Nothing a package carries runs until the
	 * player confirms, and then only after a reload.
	 */
	import { onMount } from 'svelte';
	import { API_VERSION } from '@orbital/sdk';
	import { loadPlugins } from '@orbital/core';
	import { GAME_NAME } from '../../lib/public/about';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import Dialog from '../../lib/ui/Dialog.svelte';
	import Icon from '../../lib/ui/Icon.svelte';
	import Switch from '../../lib/ui/Switch.svelte';
	import {
		assetLabel,
		dependencyList,
		licenceLabel,
		shortHash,
		sizeLabel,
		sourceLabel
	} from '../../lib/mods/format';
	import { ModManager } from '../../lib/mods/manager.svelte';
	import ModPatches from '../../lib/mods/ModPatches.svelte';
	import { openModStore } from '../../lib/mods/store-idb';
	import { builtinModRows } from '../../lib/mods/builtin-list';
	import { activePlugins } from '../../lib/mods/runtime';
	import { BUILTIN_PLUGINS } from '../../lib/builtins';
	import { saveAndReload } from '../../lib/fatal-error.svelte';
	import { modBootLog, readBootLog } from '../../lib/mods/boot-log';
	import {
		countsByPlugin,
		countsFromLog,
		FILTER_LABELS,
		modCards,
		modHue,
		monogram,
		shownCards,
		SORT_LABELS,
		type ModCard,
		type ModFilter,
		type ModSort
	} from '../../lib/mods/mod-cards';

	const manager = new ModManager({
		open: openModStore,
		reload: () => void saveAndReload()
	});
	const builtins = builtinModRows(BUILTIN_PLUGINS);
	// what each booted plugin registered and its warnings: the loader log (plan 375, ADR 0312
	// point 3); without one (it was never stored), the registries' owners
	const bootLog = modBootLog() ?? readBootLog();
	const counts = bootLog
		? countsFromLog(bootLog.mods)
		: countsByPlugin(loadPlugins([...BUILTIN_PLUGINS, ...activePlugins()]).registries);
	const warningsOf = (id: string): readonly string[] =>
		bootLog?.mods.find((m) => m.id === id)?.warnings ?? [];
	let fileInput = $state<HTMLInputElement>();
	let url = $state('');
	let query = $state('');
	let filter = $state<ModFilter>('all');
	let sort = $state<ModSort>('order');
	let dragging = $state(false);
	let removing = $state<ModCard | null>(null);
	let patchesOpen = $state<string | null>(null);

	const cards = $derived(
		modCards({
			builtins,
			records: manager.records,
			statusOf: (r) => manager.statusOf(r),
			patchesOf: (id) => manager.patchesOf(id),
			counts,
			warningsOf,
			apiVersion: API_VERSION
		})
	);
	const shown = $derived(shownCards(cards, { query, filter, sort }));
	const installed = $derived(cards.filter((c) => !c.builtin));
	const problems = $derived(cards.filter((c) => c.chip.tone === 'bad' || c.chip.tone === 'warn'));

	onMount(() => void manager.load());

	async function picked(): Promise<void> {
		const file = fileInput?.files?.[0];
		if (file) await manager.inspectFile(file);
		if (fileInput) fileInput.value = '';
	}
	async function dropped(e: DragEvent): Promise<void> {
		e.preventDefault();
		dragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) await manager.inspectFile(file);
	}
	const recordOf = (id: string) => manager.records.find((r) => r.id === id);
</script>

<PageMeta
	title="Mods · {GAME_NAME}"
	description="Install, turn on, turn off and remove {GAME_NAME} mods. A mod is one file; the game asks before it runs anything."
/>

<div class="screen">
	<header class="top">
		<a class="round" href={resolve('/')} aria-label="Back to the main menu" data-tip="Back"
			><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
				><path d="M19 12 H5 M11 6 L5 12 L11 18" /></svg
			></a
		>
		<div class="title">
			<span class="cap">Library</span>
			<h1>Mods</h1>
		</div>
		<div class="facts" aria-label="Summary">
			<span><b>{cards.length}</b> mods</span>
			<span><b>{installed.length}</b> installed</span>
			<span class:bad={problems.length > 0}><b>{problems.length}</b> with problems</span>
			<span class="api" data-tip="The mod API this game provides">API {API_VERSION}</span>
		</div>
		<a class="devlink" href={resolve('/developer')} data-testid="mods-developer"
			><Icon name="script" size={14} /> Developer tools</a
		>
	</header>

	{#if manager.changed}
		<div class="banner" role="status">
			<span class="bico"><Icon name="info" size={16} /></span>
			<span
				><strong>Reload to apply.</strong> Changes to mods take effect when the page reloads. A world
				in progress is saved first.</span
			>
			<Button variant="primary" onclick={() => manager.reload()}>Reload to apply</Button>
		</div>
	{/if}
	{#if manager.volatile}
		<p class="note warn" role="status">
			<Icon name="alert" size={16} /> This browser would not keep mods, so they last until you close the
			tab.
		</p>
	{/if}
	{#if manager.error}
		<p class="note bad" role="alert"><Icon name="alert" size={16} /> {manager.error}</p>
	{/if}

	<div class="layout">
		<section class="list" aria-label="Mods">
			<div class="tools">
				<label class="search">
					<Icon name="search" size={14} />
					<span class="sr-only">Search mods</span>
					<input bind:value={query} placeholder="Search mods" spellcheck="false" />
				</label>
				<div class="chips" role="radiogroup" aria-label="Show">
					{#each Object.entries(FILTER_LABELS) as [id, label] (id)}
						<button
							type="button"
							role="radio"
							class="chip"
							aria-checked={filter === id}
							onclick={() => (filter = id as ModFilter)}>{label}</button
						>
					{/each}
				</div>
				<label class="sort">
					<span class="sr-only">Sort by</span>
					<select bind:value={sort}>
						{#each Object.entries(SORT_LABELS) as [id, label] (id)}
							<option value={id}>{label}</option>
						{/each}
					</select>
				</label>
			</div>

			{#if manager.loading}
				<p class="dim">Loading…</p>
			{:else if shown.length === 0}
				<p class="dim empty">No mod matches. Clear the search or the filter.</p>
			{/if}
			<ul class="cards" aria-label="Installed mods">
				{#each shown as c (c.id)}
					{@const record = recordOf(c.id)}
					<li class="card" class:off={!c.enabled} data-state={c.chip.tone} data-testid="mod-{c.id}">
						<div class="head">
							<span class="tile" style="--hue:{modHue(c.id)}" aria-hidden="true"
								>{monogram(c.title)}</span
							>
							<div class="name">
								<strong>{c.title}</strong>
								<span class="sub num">{c.id} · v{c.version}{c.author ? ` · ${c.author}` : ''}</span>
							</div>
							<span class="status {c.chip.tone}" data-tip={c.chip.reason}
								><span class="dot" aria-hidden="true"></span>{c.chip.label}</span
							>
						</div>
						{#if c.description}<p class="desc">{c.description}</p>{/if}
						{#if c.chip.reason && (c.chip.tone === 'bad' || c.chip.tone === 'warn')}
							<p class="why {c.chip.tone}">{c.chip.reason}</p>
						{/if}
						{#if c.counts.length > 0}
							<div class="adds" aria-label="What it adds">
								{#each c.counts as n (n.key)}
									<a
										class="count"
										href={resolve('/developer') + n.href.slice('/developer'.length)}
										data-tip="Open the {n.label} in the developer viewer"><b>{n.n}</b> {n.label}</a
									>
								{/each}
							</div>
						{/if}
						<div class="badges">
							<span class="badge" class:bad={!c.api.ok} data-tip="Mod API range it was written for"
								>API {c.api.range}{c.api.ok ? '' : ' · not compatible'}</span
							>
							{#each c.deps as d (d.id)}
								<span class="badge" class:bad={!d.ok} data-tip={d.why ?? 'Dependency met'}
									>needs {d.id} {d.range}{d.ok ? '' : ` · ${d.why}`}</span
								>
							{/each}
							<span class="badge plain">{c.builtin ? 'Built-in' : c.licence}</span>
							{#if !c.builtin}
								<span class="badge plain" data-tip={c.source}>{c.source}</span>
								{#if c.size !== null}<span class="badge plain">{sizeLabel(c.size)}</span>{/if}
							{/if}
						</div>
						{#if patchesOpen === c.id}
							<div class="patches"><ModPatches patches={manager.patchesOf(c.id)} /></div>
						{/if}
						<div class="foot">
							{#if c.builtin}
								<span class="always" data-tip="Built into the game: always on, can't be removed"
									>Built-in · always on</span
								>
							{:else if record}
								<Switch
									checked={c.enabled}
									label="Enabled"
									disabled={manager.busy}
									testid="mod-toggle-{c.id}"
									onchange={(on) => void manager.setEnabled(c.id, on)}
								/>
								<span class="dim small">{c.enabled ? 'On' : 'Off'}</span>
							{/if}
							<span class="grow"></span>
							{#if c.patches.total > 0}
								<button
									type="button"
									class="act"
									aria-expanded={patchesOpen === c.id}
									onclick={() => (patchesOpen = patchesOpen === c.id ? null : c.id)}
									>Patches ({c.patches.total})</button
								>
							{/if}
							{#if c.updateUrl}
								<button
									type="button"
									class="act"
									disabled={manager.busy}
									data-tip="Download it again from {c.updateUrl}"
									onclick={() => void manager.inspectUrl(c.updateUrl!)}>Update</button
								>
							{/if}
							{#if c.removable}
								<button
									type="button"
									class="act danger"
									disabled={manager.busy}
									aria-label="Remove {c.title}"
									onclick={() => (removing = c)}>Remove</button
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<aside class="install" aria-labelledby="install">
			<h2 id="install">Install a mod</h2>
			<input
				bind:this={fileInput}
				type="file"
				accept=".json,application/json"
				aria-label="Mod package file"
				hidden
				onchange={() => void picked()}
			/>
			<button
				type="button"
				class="drop"
				class:over={dragging}
				disabled={manager.busy}
				data-testid="mods-drop"
				onclick={() => fileInput?.click()}
				ondragover={(e) => {
					e.preventDefault();
					dragging = true;
				}}
				ondragleave={() => (dragging = false)}
				ondrop={(e) => void dropped(e)}
			>
				<Icon name="download" size={22} />
				<strong>Drop a <code>.orbital-mod.json</code> here</strong>
				<span>or click to choose a file</span>
			</button>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					void manager.inspectUrl(url);
				}}
			>
				<input
					type="url"
					bind:value={url}
					placeholder="https://example.com/my-mod.orbital-mod.json"
					aria-label="Mod package address"
				/>
				<Button type="submit" disabled={manager.busy || url.trim() === ''}>Download</Button>
			</form>
			<ol class="steps">
				<li>The game reads the package and checks it. Nothing runs yet.</li>
				<li>You review what it is, who made it and its fingerprint.</li>
				<li>Trust and install, then reload: the mod starts on the next load.</li>
			</ol>
			<p class="dim small">
				A mod is a program with the same access as this page. Install only mods from people you
				trust. To write one, read <code>docs/guides/writing-a-mod.md</code> in the project's repository.
			</p>
		</aside>
	</div>
</div>

<Dialog open={manager.pending !== null} title="Install this mod?" onclose={() => manager.cancel()}>
	{#if manager.pending}
		{@const p = manager.pending}
		<div class="prompt">
			<div class="rhead">
				<span class="tile big" style="--hue:{modHue(p.package.manifest.id)}" aria-hidden="true"
					>{monogram(p.package.manifest.title ?? p.package.manifest.id)}</span
				>
				<div>
					<strong>{p.package.manifest.title ?? p.package.manifest.id}</strong>
					<span class="sub num">{p.package.manifest.id} · v{p.package.manifest.version}</span>
				</div>
			</div>
			<p class="note warn">
				<Icon name="alert" size={16} />
				<span>
					<strong>A mod is a program.</strong> If you install it, it runs inside this game with access
					to everything this page can reach: your saves, your designs and the network. Install it only
					if you trust where it came from.
				</span>
			</p>
			<dl>
				<dt>Author</dt>
				<dd>{p.package.manifest.author ?? 'not stated'}</dd>
				<dt>Licence</dt>
				<dd class="num">{licenceLabel(p.package.manifest)}</dd>
				<dt>Mod API</dt>
				<dd class="num">{p.package.manifest.api}</dd>
				<dt>Needs</dt>
				<dd class="num">{dependencyList(p.package.manifest.dependencies)}</dd>
				<dt>Source</dt>
				<dd class="num">{sourceLabel(p.source)}</dd>
				<dt>Size</dt>
				<dd class="num">{sizeLabel(p.size)}</dd>
				<dt>Also ships</dt>
				<dd>
					{#if p.assets.length === 0}
						no files, only code
					{:else}
						<ul class="files" aria-label="Files in the package">
							{#each p.assets as a (a.path)}
								<li class="num">{a.path}: {assetLabel(a)}</li>
							{/each}
						</ul>
						<span class="dim">Models are drawn by the game; they cannot run code.</span>
					{/if}
				</dd>
				<dt>Fingerprint</dt>
				<dd class="num" data-tip={p.package.sha256}>{shortHash(p.package.sha256)}</dd>
			</dl>
			{#if p.package.manifest.description}<p class="dim">{p.package.manifest.description}</p>{/if}
			{#if p.replaces}
				<p class="dim">This replaces version {p.replaces.manifest.version} of the same mod.</p>
			{/if}
			<div class="dfoot">
				<Button onclick={() => manager.cancel()}>Cancel</Button>
				<Button variant="primary" disabled={manager.busy} onclick={() => void manager.confirm()}
					>Trust and install</Button
				>
			</div>
		</div>
	{/if}
</Dialog>

<Dialog
	open={removing !== null}
	title="Remove {removing?.title ?? 'this mod'}?"
	onclose={() => (removing = null)}
>
	<div class="prompt">
		<p class="dim">
			It is deleted from this browser and stops after a reload. Worlds that use its parts may not
			load without it.
		</p>
		<div class="dfoot">
			<Button onclick={() => (removing = null)}>Cancel</Button>
			<Button
				variant="danger"
				data-testid="mods-remove-confirm"
				onclick={() => {
					const id = removing?.id;
					removing = null;
					if (id) void manager.remove(id);
				}}>Remove</Button
			>
		</div>
	</div>
</Dialog>

<style>
	.screen {
		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		padding: 2rem clamp(1rem, 4vw, 3rem) 3rem;
		background:
			radial-gradient(70rem 40rem at 85% -10%, rgb(90 120 255 / 0.12), transparent 60%),
			radial-gradient(50rem 30rem at 0% 110%, rgb(255 255 255 / 0.04), transparent 60%),
			var(--bg-ground);
		color: var(--text-primary);
	}
	.top {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		flex-wrap: wrap;
	}
	.round {
		flex: none;
		width: 2.75rem;
		height: 2.75rem;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		color: var(--text-primary);
	}
	.round svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.title {
		display: grid;
		gap: 0.25rem;
	}
	.cap {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		font-weight: 300;
		line-height: 1;
	}
	.facts {
		display: flex;
		gap: 1rem;
		margin-left: 1rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.facts b {
		color: var(--text-primary);
		font-weight: 600;
	}
	.facts .bad b,
	.facts .bad {
		color: var(--warn);
	}
	.api {
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.08);
		font-variant-numeric: tabular-nums;
	}
	.devlink {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		height: 2.25rem;
		padding: 0 0.875rem;
		border-radius: var(--radius-pill);
		border: 1px solid var(--border-subtle);
		color: var(--text-secondary);
		font-size: var(--t-small);
		font-weight: 600;
		text-decoration: none;
	}
	.devlink:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 1.25rem 0 0;
		padding: 0.75rem 0.875rem;
		border-radius: var(--radius-card);
		background: rgb(90 140 255 / 0.12);
		border: 1px solid rgb(90 140 255 / 0.35);
		font-size: var(--t-small);
	}
	.banner > span:nth-child(2) {
		flex: 1;
	}
	.bico {
		display: grid;
		place-items: center;
		color: #8fb0ff;
	}
	.note {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 1rem 0 0;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-card);
		background: var(--surface-inset);
		font-size: var(--t-small);
	}
	.note.warn {
		color: var(--warn);
	}
	.note.bad {
		color: var(--danger);
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 22rem;
		gap: 1.25rem;
		margin-top: 1.5rem;
		align-items: start;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1 1 14rem;
		height: 2.25rem;
		padding: 0 0.75rem;
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		color: var(--text-muted);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		outline: none;
	}
	.chips {
		display: flex;
		gap: 0.25rem;
		padding: 0.1875rem;
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	.chip {
		height: 1.75rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.chip[aria-checked='true'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.sort select {
		height: 2.25rem;
		padding: 0 0.625rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
	}
	.cards {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
		gap: 0.75rem;
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 0.875rem;
		border-radius: 1rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.card[data-state='bad'] {
		border-color: rgb(255 90 95 / 0.45);
	}
	.card[data-state='warn'] {
		border-color: rgb(245 165 36 / 0.4);
	}
	.card.off .head,
	.card.off .desc {
		opacity: 0.6;
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.tile {
		flex: none;
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 0.75rem;
		background:
			radial-gradient(circle at 30% 25%, hsl(var(--hue) 80% 70% / 0.55), transparent 60%),
			linear-gradient(135deg, hsl(var(--hue) 55% 32%), hsl(calc(var(--hue) + 40) 50% 18%));
		color: #fff;
		font-size: 0.9375rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
	}
	.tile.big {
		width: 3.25rem;
		height: 3.25rem;
		font-size: 1.125rem;
	}
	.name {
		display: grid;
		gap: 0.1875rem;
		min-width: 0;
		flex: 1;
	}
	.name strong {
		font-size: var(--t-button);
		font-weight: 600;
	}
	.sub {
		font-size: var(--t-label);
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.status {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
		height: 1.375rem;
		padding: 0 0.5rem;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--tone) 15%, transparent);
		color: var(--tone);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		text-transform: uppercase;
	}
	.status .dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}
	.status.ok {
		--tone: var(--ok);
	}
	.status.warn {
		--tone: var(--warn);
	}
	.status.bad {
		--tone: var(--danger);
	}
	.status.pending {
		--tone: #8fb0ff;
	}
	.status.off {
		--tone: var(--text-muted);
	}
	.desc {
		margin: 0;
		font-size: var(--t-small);
		line-height: 1.45;
		color: var(--text-secondary);
	}
	.why {
		margin: 0;
		font-size: var(--t-small);
	}
	.why.bad {
		color: var(--danger);
	}
	.why.warn {
		color: var(--warn);
	}
	.adds {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}
	.count {
		padding: 0.25rem 0.5rem;
		border-radius: 0.5rem;
		background: var(--surface-inset);
		color: var(--text-secondary);
		font-size: var(--t-label);
		text-decoration: none;
	}
	.count b {
		color: var(--text-primary);
	}
	.count:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3125rem;
	}
	.badge {
		max-width: 16rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		padding: 0.125rem 0.5rem;
		border-radius: var(--radius-pill);
		border: 1px solid rgb(120 220 160 / 0.35);
		color: #9be3b7;
		font-size: var(--t-label);
		font-variant-numeric: tabular-nums;
	}
	.badge.bad {
		border-color: rgb(255 90 95 / 0.45);
		color: var(--danger);
	}
	.badge.plain {
		border-color: var(--border-subtle);
		color: var(--text-muted);
	}
	.patches {
		padding: 0.5rem 0.625rem;
		border-radius: 0.625rem;
		background: var(--surface-inset);
		font-size: var(--t-small);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border-divider);
	}
	.grow {
		flex: 1;
	}
	.always {
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.act {
		height: 1.875rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.act:hover {
		background: var(--surface-hover);
	}
	.act.danger {
		color: var(--danger);
	}
	.act:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.install {
		position: sticky;
		top: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem;
		border-radius: 1rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	h2 {
		margin: 0;
		font-size: var(--t-button);
		font-weight: 600;
	}
	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.375rem;
		padding: 1.5rem 1rem;
		border: 1.5px dashed rgb(255 255 255 / 0.22);
		border-radius: 0.875rem;
		background: rgb(255 255 255 / 0.03);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
		cursor: pointer;
	}
	.drop strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	.drop:hover,
	.drop.over {
		border-color: var(--text-primary);
		background: rgb(255 255 255 / 0.07);
	}
	.install form {
		display: flex;
		gap: 0.5rem;
	}
	.install input[type='url'] {
		flex: 1;
		min-width: 0;
		height: 2.25rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
		background: var(--surface-inset);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
	}
	.steps {
		margin: 0;
		padding-left: 1.125rem;
		display: grid;
		gap: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.dim {
		color: var(--text-muted);
	}
	.small {
		font-size: var(--t-small);
	}
	.empty {
		margin: 1rem 0;
	}
	.prompt {
		display: grid;
		gap: 0.75rem;
		max-width: 34rem;
	}
	.rhead {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.rhead div {
		display: grid;
		gap: 0.1875rem;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 1rem;
		margin: 0;
		font-size: var(--t-small);
	}
	dt {
		color: var(--text-muted);
	}
	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}
	.files {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.dfoot {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	code {
		font-family: var(--font-mono);
		font-size: 0.9em;
	}
	@media (max-width: 1099px) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.install {
			position: static;
			order: -1;
		}
	}
</style>
