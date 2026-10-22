<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import MenuShell from '../../lib/ui/MenuShell.svelte';
	import PageHead from '../../lib/ui/PageHead.svelte';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import { downloadText } from '../../lib/download';
	import {
		clearLoadLogs,
		formatLoadLog,
		readLoadLogs,
		summaryLine,
		type LoadLogEntry
	} from '../../lib/load-log';

	/**
	 * The Developer page (plan 370, the owner's request of 2026-10-22): every stored world load's log
	 * (newest first) to read, copy or download, and the developer tools that need no world.
	 */
	let logs = $state.raw<LoadLogEntry[]>([]);
	let note = $state('');
	onMount(() => {
		logs = readLoadLogs().reverse();
	});

	const OUTCOME: Record<LoadLogEntry['outcome'], string> = {
		loading: 'still loading',
		ready: 'ready',
		error: 'failed',
		left: 'left while loading'
	};

	async function copy(text: string, what: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			note = `Copied ${what}`;
		} catch {
			note = 'The browser did not allow copying';
		}
	}
	const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-');
	function clear(): void {
		if (!confirm('Delete every stored load log?')) return;
		clearLoadLogs();
		logs = [];
		note = 'Load logs cleared';
	}
</script>

<PageMeta
	title="Developer · {GAME_NAME}"
	description="Load logs of the worlds opened in this browser and the developer tools."
/>

<MenuShell wide>
	<PageHead title="Developer" />
	<p class="lead">
		What this browser recorded while loading worlds: the graphics backend, how long each step and each
		shader took, and whether the browser had compiled the shaders before. Kept here only, the last 20
		loads.
	</p>

	<section aria-labelledby="load-logs">
		<h2 id="load-logs">Load logs</h2>
		{#if logs.length === 0}
			<p class="dim" data-testid="developer-no-logs">No world was loaded in this browser yet.</p>
		{:else}
			<div class="actions">
				<Button
					onclick={() => void copy(logs.map(formatLoadLog).join('\n\n----\n\n'), `${logs.length} logs`)}
					data-testid="developer-copy-all">Copy all as text</Button
				>
				<Button
					onclick={() => downloadText(JSON.stringify(logs, null, 1), `orbital-load-logs-${stamp()}.json`)}
					data-testid="developer-download-all">Download all .json</Button
				>
				<Button variant="danger" onclick={clear} data-testid="developer-clear">Clear logs</Button>
			</div>
			<ul class="logs" data-testid="developer-logs">
				{#each logs as log (log.id)}
					{@const s = summaryLine(log)}
					<li>
						<details>
							<summary>
								<span class="when">{s.when}</span>
								<span class="tag">{s.backend}</span>
								<span class="total" class:bad={log.outcome !== 'ready'}
									>{log.outcome === 'ready' ? s.total : OUTCOME[log.outcome]}</span
								>
								<span class="dim">{log.report.compile.pipelines} shaders · slowest {s.slowest}</span>
								{#if log.lowered}<span class="tag">lower quality</span>{/if}
							</summary>
							<div class="actions">
								<Button onclick={() => void copy(formatLoadLog(log), 'the log')}>Copy as text</Button>
								<Button
									onclick={() =>
										downloadText(JSON.stringify(log, null, 1), `orbital-load-log-${log.id}.json`)}
									>Download .json</Button
								>
							</div>
							<pre>{formatLoadLog(log)}</pre>
						</details>
					</li>
				{/each}
			</ul>
		{/if}
		{#if note}<p class="dim" role="status">{note}</p>{/if}
	</section>

	<section aria-labelledby="dev-tools">
		<h2 id="dev-tools">Developer tools</h2>
		<p class="dim">For mod authors and debugging; no world is loaded.</p>
		<ul class="tools">
			<li>
				<a href={resolve('/dev/parts')}>Part viewer</a>
				<span class="dim"
					>Every part on its own: turn, zoom, wireframe, attach nodes, colliders, deploy states and
					size classes side by side.</span
				>
			</li>
			<li>
				<a href={resolve('/dev/crew')}>Crew viewer</a>
				<span class="dim">The crew character in its poses and outfits.</span>
			</li>
		</ul>
	</section>
</MenuShell>

<style>
	h2 {
		margin: var(--s-6) 0 var(--s-3);
		font-size: var(--t-lg);
		font-weight: 600;
	}
	.lead,
	.dim {
		color: var(--text-dim);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 0 0 var(--s-3);
	}
	.logs,
	.tools {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 8px;
	}
	.tools li {
		display: grid;
		gap: 2px;
	}
	details {
		padding: 10px 12px;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
	}
	summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 12px;
		cursor: pointer;
	}
	details[open] summary {
		margin-bottom: var(--s-3);
	}
	.when {
		font-variant-numeric: tabular-nums;
	}
	.tag {
		padding: 0 6px;
		font-size: var(--t-small);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
	}
	.total {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.total.bad {
		color: var(--text-warning, #f5a524);
	}
	pre {
		margin: 0;
		max-height: 28rem;
		overflow: auto;
		padding: 10px;
		font-size: 0.75rem;
		line-height: 1.45;
		white-space: pre-wrap;
		word-break: break-word;
		background: rgb(0 0 0 / 0.3);
		border-radius: 8px;
	}
</style>
