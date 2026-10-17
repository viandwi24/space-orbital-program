<script lang="ts">
	/** The world's history book (plan 102, ADR 0147 point 4): its firsts by date, with the exports. */
	import type { BodyDefinition, Epoch, MilestoneRecord } from '@orbital/core';
	import { downloadText, fileNameOf } from '../download';
	import Button from '../ui/Button.svelte';
	import { historyJson, historyMarkdown, historyOf } from './history';

	let {
		world,
		records,
		bodies,
		epoch
	}: {
		world: string;
		records: readonly MilestoneRecord[];
		bodies: readonly BodyDefinition[];
		epoch: Epoch;
	} = $props();

	const entries = $derived(historyOf(records, { bodies, epoch }));
</script>

<section class="history" aria-label="History" data-testid="world-history">
	<span class="label">History</span>
	{#if entries.length === 0}
		<p class="empty">No firsts yet. Launch something.</p>
	{:else}
		<ol>
			{#each entries as e (e.record.id)}
				<li><span class="date num">{e.date}</span> {e.text}</li>
			{/each}
		</ol>
		<div class="actions">
			<Button
				onclick={() =>
					downloadText(
						historyMarkdown(world, entries),
						fileNameOf(`${world} history`, 'md'),
						'text/markdown'
					)}>Export Markdown</Button
			>
			<Button
				onclick={() =>
					downloadText(historyJson(world, entries), fileNameOf(`${world} history`, 'json'))}
				>Export JSON</Button
			>
		</div>
	{/if}
</section>

<style>
	.history {
		display: grid;
		gap: var(--s-2);
	}
	.label {
		font-size: var(--t-label);
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	ol {
		display: grid;
		gap: var(--s-1);
		max-height: 12rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
		font-size: var(--t-sm);
	}
	.date {
		color: var(--text-dim);
		margin-right: var(--s-2);
	}
	.empty {
		margin: 0;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
</style>
