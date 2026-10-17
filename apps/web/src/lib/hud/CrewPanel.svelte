<script lang="ts">
	/**
	 * The crew card (refs `Main` bottom right; ADR 0144 point 4). With crew aboard it shows their
	 * condition and why (plan 107, ADR 0181 point 8); the roster and seating come with plan 108.
	 */
	import Panel from '../ui/Panel.svelte';
	import type { CrewCard } from '../crew-card';

	let { card = null }: { card?: CrewCard | null } = $props();
</script>

<Panel title="Crew" data-testid="crew-panel">
	{#snippet aside()}<span class="num">[{card ? card.rows.length : '—'}]</span>{/snippet}
	{#if card}
		{#each card.rows as row (row.member)}
			<div class="row" data-testid="crew-row">
				<div class="name">{row.name}</div>
				{#if row.stats.length > 0}<div class="stats">{row.stats.join(' · ')}</div>{/if}
				{#each row.causes as cause (cause)}<small class="cause">{cause}</small>{/each}
			</div>
		{/each}
		{#if card.supplies.length > 0}
			<div class="supplies" data-testid="crew-supplies">
				{#each card.supplies as line (line)}<small>{line}</small>{/each}
			</div>
		{/if}
	{:else}
		<p>Crew comes with plan 108.</p>
	{/if}
</Panel>

<style>
	p {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.row + .row {
		margin-top: var(--s-2);
	}
	.name {
		font-size: var(--t-sm);
		color: var(--text);
	}
	.stats {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.cause,
	.supplies small {
		display: block;
		font-size: var(--t-xs);
		line-height: 1.3;
		color: var(--text-dim);
	}
	.supplies {
		margin-top: var(--s-2);
	}
</style>
