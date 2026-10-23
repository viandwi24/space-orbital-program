<script lang="ts">
	/**
	 * The Blueprints tab (plan 375): every blueprint the Hangar's Library offers (the game's learn and
	 * famous-mission cards, and every plugin's registered blueprints), built against the loaded
	 * plugins and checked like the Hangar does: missing parts, node size mismatches, pre-flight
	 * checks. Each opens in the sandbox Hangar.
	 */
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { homeBodyOf } from '@orbital/core';
	import { GAME_NAME } from '../../../lib/public/about';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import { loadContent } from '../../../lib/catalog';
	import { allBlueprints, GOAL_LABELS, ORIGIN_LABELS } from '../../../lib/editor/blueprints';
	import { bodyMu } from '../../../lib/orbit-info';
	import {
		blueprintOwners,
		checkBlueprint,
		type BlueprintReport
	} from '../../../lib/dev/blueprint-check';
	import {
		devPlugins,
		readIncludeDisabled,
		saveIncludeDisabled
	} from '../../../lib/dev/dev-content';

	let reports = $state.raw<BlueprintReport[]>([]);
	let loading = $state(true);
	let error = $state('');
	let origin = $state<'all' | BlueprintReport['origin']>('all');
	let verdict = $state<'all' | BlueprintReport['verdict']>('all');
	let query = $state('');
	let modFilter = $state<string | null>(
		typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('mod')
	);
	const includeDisabled = readIncludeDisabled();

	onMount(() => {
		void (async () => {
			try {
				const dev = await devPlugins(includeDisabled);
				const loaded = loadContent(undefined, dev.plugins);
				const body = homeBodyOf(loaded.catalog.bodies);
				const gravity = body ? bodyMu(body) / (body.radius * body.radius) : 9.81;
				const input = {
					editor: { parts: loaded.content.parts, modules: loaded.content.modules },
					lookups: loaded.content,
					gravity,
					by: blueprintOwners(loaded.report)
				};
				reports = allBlueprints(loaded.blueprints).map((card) => checkBlueprint(card, input));
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
			} finally {
				loading = false;
			}
		})();
	});

	const owners = $derived([...new Set(reports.map((r) => r.by))]);
	const shown = $derived(
		reports.filter(
			(r) =>
				(origin === 'all' || r.origin === origin) &&
				(verdict === 'all' || r.verdict === verdict) &&
				(modFilter === null || r.by === modFilter) &&
				(query.trim() === '' ||
					`${r.title} ${r.id}`.toLowerCase().includes(query.trim().toLowerCase()))
		)
	);
	const count = (v: BlueprintReport['verdict']): number =>
		reports.filter((r) => r.verdict === v).length;
	const hangarHref = (id: string): string =>
		`${resolve('/developer/hangar')}?blueprint=${encodeURIComponent(id)}`;
	const VERDICT: Record<BlueprintReport['verdict'], string> = {
		ok: 'OK',
		warnings: 'Warnings',
		errors: 'Errors'
	};
</script>

<PageMeta
	title="Blueprints · Developer · {GAME_NAME}"
	description="Every blueprint the plugins register, checked: missing parts, size mismatches, pre-flight checks."
/>

<h1>Blueprints</h1>
<p class="lead">
	Every blueprint the Hangar's Library offers, built against the loaded plugins and checked the way
	the Hangar checks a design. The learn and famous-mission cards are still built into the game (ADR
	0311 lists their move to stock); a mod's come from <code>ctx.blueprints</code>.
</p>

<div class="bar">
	<input type="search" placeholder="Search title or id" bind:value={query} />
	<select bind:value={origin} aria-label="Origin">
		<option value="all">All origins</option>
		{#each Object.entries(ORIGIN_LABELS) as [id, label] (id)}<option value={id}>{label}</option>{/each}
	</select>
	<select
		value={modFilter ?? ''}
		onchange={(e) => (modFilter = e.currentTarget.value || null)}
		aria-label="Provided by"
	>
		<option value="">Every provider</option>
		{#each owners as o (o)}<option value={o}>{o}</option>{/each}
	</select>
	<select bind:value={verdict} aria-label="Result">
		<option value="all">Every result</option>
		<option value="ok">OK ({count('ok')})</option>
		<option value="warnings">Warnings ({count('warnings')})</option>
		<option value="errors">Errors ({count('errors')})</option>
	</select>
	<label class="switch"
		><input
			type="checkbox"
			checked={includeDisabled}
			onchange={(e) => {
				saveIncludeDisabled(e.currentTarget.checked);
				location.reload();
			}}
		/> Include disabled mods</label
	>
</div>

{#if loading}
	<p class="dim">Building every blueprint…</p>
{:else if error}
	<p class="error" role="alert">{error}</p>
{:else}
	<p class="dim" data-testid="blueprint-summary">
		{reports.length} blueprints · {count('ok')} OK · {count('warnings')} with warnings · {count(
			'errors'
		)} with errors
	</p>
	<ul class="list" data-testid="blueprint-list">
		{#each shown as r (r.id)}
			<li data-verdict={r.verdict}>
				<div class="head">
					<span class="verdict">{VERDICT[r.verdict]}</span>
					<strong>{r.title}</strong>
					<code>{r.id}</code>
					<span class="tag">{ORIGIN_LABELS[r.origin]}</span>
					<span class="dim">by {r.by} · {GOAL_LABELS[r.goal]} · {r.crew ? `${r.crew} crew` : 'probe'}</span>
					<a class="open" href={hangarHref(r.id)} data-testid="blueprint-open">Open in the Hangar</a>
				</div>
				{#if r.stats}
					<div class="nums">
						{r.stats.parts} parts · {r.stats.mass.toFixed(1)} t · Δv {Math.round(r.stats.deltaV)} m/s ·
						TWR {r.stats.twr === null ? '—' : r.stats.twr.toFixed(2)}
					</div>
				{/if}
				{#if r.buildError}<div class="bad">Could not be built: {r.buildError}</div>{/if}
				{#if r.missing.length > 0}
					<div class="bad">Missing parts: {r.missing.join(', ')}</div>
				{/if}
				{#each r.sizes as m, i (i)}
					<div class="warn">
						Size mismatch: {m.partId} #{m.part} ({m.node}, {m.size} m) on {m.parentId} #{m.parent} ({m.parentNode},
						{m.parentSize} m)
					</div>
				{/each}
				{#if r.checks.length > 0}
					<details>
						<summary>Pre-flight checks: {r.checks.length}</summary>
						<ul class="checks">
							{#each r.checks as c (c.id)}
								<li class={c.severity === 'error' ? 'bad' : 'warn'}>
									<strong>{c.text}</strong> <span class="dim">{c.hint}</span>
								</li>
							{/each}
						</ul>
					</details>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

<style>
	h1 {
		margin: 0 0 1rem;
		font-size: var(--t-display);
		font-weight: 300;
	}
	.lead,
	.dim {
		color: var(--text-dim, var(--text-muted));
	}
	.bar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin: var(--s-3, 12px) 0;
	}
	input[type='search'],
	select {
		padding: 0.35rem 0.6rem;
		border-radius: var(--radius-tile);
		border: 1px solid var(--border-subtle);
		background: var(--surface-inset);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-button);
	}
	.switch {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		font-size: var(--t-small);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.list > li {
		display: grid;
		gap: 4px;
		padding: 10px 12px;
		border-radius: var(--radius-card);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	li[data-verdict='errors'] {
		border-color: color-mix(in srgb, var(--danger) 45%, transparent);
	}
	li[data-verdict='warnings'] {
		border-color: color-mix(in srgb, var(--warn) 35%, transparent);
	}
	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: baseline;
	}
	.verdict {
		min-width: 4.5rem;
		font-size: var(--t-label);
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--ok);
	}
	li[data-verdict='errors'] .verdict {
		color: var(--danger);
	}
	li[data-verdict='warnings'] .verdict {
		color: var(--warn);
	}
	code {
		font-size: var(--t-small);
		color: var(--accent-text);
	}
	.tag {
		padding: 0 6px;
		font-size: var(--t-small);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
	}
	.open {
		margin-left: auto;
		font-size: var(--t-button);
	}
	.nums {
		font-size: var(--t-small);
		color: var(--text-secondary);
		font-variant-numeric: tabular-nums;
	}
	.bad {
		color: var(--danger);
		font-size: var(--t-small);
	}
	.warn {
		color: var(--warn);
		font-size: var(--t-small);
	}
	details {
		font-size: var(--t-small);
	}
	.checks {
		margin: 4px 0 0;
		padding-left: 1.2rem;
		display: grid;
		gap: 2px;
	}
	.error {
		color: var(--danger);
	}
</style>
