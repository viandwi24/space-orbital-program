<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { GAME_NAME } from '../../../lib/public/about';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import Button from '../../../lib/ui/Button.svelte';
	import { downloadText } from '../../../lib/download';
	import { devHref } from '../../../lib/dev/href';
	import {
		bootSummary,
		countsLine,
		formatBootLog,
		modBootLog,
		problemLabel,
		readBootLog,
		type ModBootLog
	} from '../../../lib/mods/boot-log';

	/**
	 * The mod loader log (plan 375, ADR 0311 point 3): what this page load booted, in order, and why
	 * the rest did not: problems with their kind and stack, patches, registrations per kind, assets.
	 */
	let log = $state.raw<ModBootLog | null>(null);
	let note = $state('');
	let filter = $state<'all' | 'problems'>('all');
	/** `?mod=<id>` shows one mod (the Mods page's links, plan 376). */
	let only = $state<string | null>(null);
	onMount(() => {
		log = modBootLog() ?? readBootLog();
		const q = new URLSearchParams(location.search);
		if (q.get('show') === 'problems') filter = 'problems';
		only = q.get('mod');
	});

	const summary = $derived(log ? bootSummary(log) : null);
	const shown = $derived(
		!log
			? []
			: log.mods.filter(
					(m) =>
						(only === null || m.id === only) &&
						(filter === 'all' || m.problem !== undefined || m.warnings.length > 0)
				)
	);
	/** Kinds with a viewer: a count links to it, filtered to the mod. */
	const VIEWER: Record<string, '/developer/parts' | '/developer/crew' | '/developer/blueprints'> = {
		part: '/developer/parts',
		'crew-outfit': '/developer/crew',
		'crew-look': '/developer/crew',
		'crew-expression': '/developer/crew',
		'crew-animation': '/developer/crew',
		'crew-portrait': '/developer/crew',
		blueprint: '/developer/blueprints'
	};
	const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');

	async function copy(): Promise<void> {
		if (!log) return;
		try {
			await navigator.clipboard.writeText(formatBootLog(log));
			note = 'Copied the log';
		} catch {
			note = 'The browser did not allow copying';
		}
	}
</script>

<PageMeta
	title="Mod loader log · Developer · {GAME_NAME}"
	description="What this browser booted: every mod's result, errors with their stack, patches and registrations."
/>

<h1>Mod loader log</h1>
<p class="lead">
	What the game booted when this page loaded: the built-in plugins, then the mods installed and turned
	on in <a href={resolve('/mods')}>Mods</a>. A world boots the same list. The last boot's log is kept in
	this browser.
</p>

{#if !log}
	<p class="dim" data-testid="modlog-none">No boot was recorded yet. Reload the page.</p>
{:else}
	<div class="head">
		<span class="when">{new Date(log.at).toLocaleString()}</span>
		<span class="tag">mod API {log.api}</span>
		{#if summary}
			<span class="tag ok">{summary.loaded} loaded</span>
			{#if summary.failed}<span class="tag bad">{summary.failed} failed</span>{/if}
			{#if summary.disabled}<span class="tag">{summary.disabled} turned off</span>{/if}
			{#if summary.warnings}<span class="tag warn">{summary.warnings} warnings</span>{/if}
		{/if}
	</div>
	<div class="actions">
		<Button onclick={() => void copy()} data-testid="modlog-copy">Copy as text</Button>
		<Button
			onclick={() => downloadText(JSON.stringify(log, null, 1), `orbital-mod-log-${stamp()}.json`)}
			data-testid="modlog-download">Download .json</Button
		>
		<label class="switch">
			<input
				type="checkbox"
				checked={filter === 'problems'}
				onchange={(e) => (filter = e.currentTarget.checked ? 'problems' : 'all')}
			/> Only problems and warnings
		</label>
		{#if note}<span class="dim" role="status">{note}</span>{/if}
	</div>

	{#if log.error}
		<div class="error" role="alert">
			<strong>The boot failed:</strong>
			{log.error.message}
			{#if log.error.stack}<pre>{log.error.stack}</pre>{/if}
		</div>
	{/if}

	<section aria-labelledby="order">
		<h2 id="order">Boot order</h2>
		<ol class="order">
			{#each log.order as id, i (id)}<li><span class="dim">{i + 1}.</span> <code>{id}</code></li>{/each}
		</ol>
	</section>

	<section aria-labelledby="results">
		<h2 id="results">Mods</h2>
		{#if only}
			<p class="dim">
				Showing <code>{only}</code> only.
				<button type="button" class="link" onclick={() => (only = null)}>Show every mod</button>
			</p>
		{/if}
		<ul class="mods" data-testid="modlog-mods">
			{#each shown as m (m.id)}
				<li data-state={m.state} data-testid="modlog-{m.id}">
					<div class="row">
						<span class="state">{m.state}</span>
						<strong>{m.title}</strong>
						<code class="dim">{m.id} {m.version}</code>
						<span class="dim">{m.source === 'builtin' ? 'built in' : 'installed'} · api {m.api}</span>
						{#if m.index !== undefined}<span class="dim">#{m.index + 1}</span>{/if}
					</div>
					{#if m.problem}
						<div class="problem">
							<span class="tag bad">{problemLabel(m.problem.code)}</span>
							{m.problem.message}
							{#if m.problem.stack}
								<details>
									<summary>Stack</summary>
									<pre>{m.problem.stack}</pre>
								</details>
							{/if}
						</div>
					{/if}
					{#if Object.keys(m.counts).length > 0}
						<div class="counts">
							{#each Object.entries(m.counts).sort((a, b) => b[1] - a[1]) as [kind, n] (kind)}
								{@const to = VIEWER[kind]}
								{#if to}
									<a class="count" href="{devHref(to)}?mod={encodeURIComponent(m.id)}">{n} {kind}</a>
								{:else}
									<span class="count">{n} {kind}</span>
								{/if}
							{/each}
						</div>
					{:else if m.state === 'loaded'}
						<div class="dim">{countsLine(m.counts) || 'registers nothing'}</div>
					{/if}
					{#if m.patches.applied || m.patches.failed}
						<div class="dim">
							Patches: {m.patches.applied} applied{m.patches.failed
								? `, ${m.patches.failed} failed`
								: ''}
						</div>
					{/if}
					{#each m.warnings as w, i (i)}<div class="warnline">⚠ {w}</div>{/each}
				</li>
			{/each}
		</ul>
	</section>

	<section aria-labelledby="patches">
		<h2 id="patches">Patches <small>{log.patches.length}</small></h2>
		{#if log.patches.length === 0}
			<p class="dim">No plugin patches another's data.</p>
		{:else}
			<table>
				<thead><tr><th>Patch</th><th>By</th><th>Target</th><th>Result</th></tr></thead>
				<tbody>
					{#each log.patches as p (p.id)}
						<tr class:bad={!!p.disabled}>
							<td><code>{p.id}</code></td>
							<td>{p.by}</td>
							<td>{p.target}</td>
							<td
								>{p.disabled
									? `failed: ${p.disabled}`
									: p.applied.length === 0
										? 'matched nothing'
										: `${p.applied.length} changed: ${p.applied.slice(0, 8).join(', ')}${p.applied.length > 8 ? ', …' : ''}`}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section aria-labelledby="assets">
		<h2 id="assets">Asset problems <small>{log.assets.length}</small></h2>
		{#if log.assets.length === 0}
			<p class="dim">Every model and image the mods ship loaded.</p>
		{:else}
			<ul class="plain">
				{#each log.assets as a, i (i)}
					<li><strong>{a.mod}</strong>: {a.what}: {a.message}</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	h1 {
		margin: 0 0 1rem;
		font-size: var(--t-display);
		font-weight: 300;
	}
	h2 {
		margin: var(--s-6) 0 var(--s-3);
		font-size: var(--t-lg);
		font-weight: 600;
	}
	small {
		color: var(--text-muted);
		font-weight: 400;
	}
	.lead,
	.dim {
		color: var(--text-dim);
	}
	.head,
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin: 0 0 var(--s-3);
	}
	.link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--accent-text);
		font: inherit;
		cursor: pointer;
		text-decoration: underline;
	}
	.switch {
		display: inline-flex;
		gap: 6px;
		align-items: center;
		font-size: var(--t-small);
	}
	.tag {
		padding: 1px 8px;
		font-size: var(--t-small);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
	}
	.tag.ok {
		color: var(--ok);
	}
	.tag.bad {
		color: var(--danger);
	}
	.tag.warn {
		color: var(--warn);
	}
	.order {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 18px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.mods,
	.plain {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.mods li {
		display: grid;
		gap: 6px;
		padding: 10px 12px;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-card);
	}
	.mods li[data-state='failed'],
	.mods li[data-state='untrusted'] {
		border-color: color-mix(in srgb, var(--danger) 45%, transparent);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		align-items: baseline;
	}
	.state {
		min-width: 4.5rem;
		font-size: var(--t-label);
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--ok);
	}
	li[data-state='failed'] .state,
	li[data-state='untrusted'] .state {
		color: var(--danger);
	}
	li[data-state='disabled'] .state {
		color: var(--text-muted);
	}
	.problem {
		display: grid;
		gap: 4px;
		justify-items: start;
	}
	.counts {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.count {
		padding: 1px 8px;
		font-size: var(--t-small);
		border-radius: var(--radius-pill);
		background: var(--surface-inset);
		color: var(--text-secondary);
		text-decoration: none;
	}
	a.count:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.warnline {
		color: var(--warn);
		font-size: var(--t-small);
	}
	.error {
		padding: 10px 12px;
		border-radius: var(--radius-card);
		background: color-mix(in srgb, var(--danger) 14%, transparent);
	}
	pre {
		margin: 4px 0 0;
		max-height: 20rem;
		overflow: auto;
		padding: 8px;
		font-size: 0.72rem;
		white-space: pre-wrap;
		word-break: break-word;
		background: rgb(0 0 0 / 0.35);
		border-radius: 8px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--t-small);
	}
	th,
	td {
		text-align: left;
		padding: 4px 6px;
		border-bottom: 1px solid var(--border-divider);
		vertical-align: top;
	}
	tr.bad td {
		color: var(--danger);
	}
</style>
