<script lang="ts">
	import type { Dossier } from '@orbital/core';

	/** A body's dossier (plan 104, ADR 0180): unlocked facts, and what unlocks the rest. */
	let { dossier }: { dossier: Dossier } = $props();
</script>

<section class="card" data-testid="body-card" aria-label="Dossier">
	<h3>Dossier</h3>
	{#each dossier.entries as entry (entry.id)}
		<div class="entry" class:locked={!entry.unlocked} data-testid="dossier-{entry.fact}">
			<div class="title">{entry.label}</div>
			{#if entry.unlocked}
				<dl>
					{#each entry.lines as line (line.label)}
						<dt>{line.label}</dt>
						<dd>{line.value}</dd>
					{/each}
				</dl>
			{:else}
				<small class="needs">Locked: needs {entry.needs}</small>
			{/if}
		</div>
	{/each}
</section>

<style>
	.card {
		margin-top: var(--s-3);
		font-size: var(--t-sm);
	}
	h3 {
		margin: 0 0 var(--s-1);
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--text-dim);
	}
	.entry {
		margin-top: var(--s-2);
	}
	.title {
		color: var(--text);
	}
	.locked .title {
		color: var(--text-dim);
	}
	.needs {
		display: block;
		color: var(--text-dim);
		font-size: var(--t-xs);
		line-height: 1.3;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 2px var(--s-4);
		margin: 2px 0 0;
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		text-align: right;
	}
</style>
