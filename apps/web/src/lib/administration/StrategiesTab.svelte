<script lang="ts">
	/**
	 * The Strategies tab of Administration (plan 101, ADR 0187; refs W5): a card per strategy on
	 * offer with its ratios and caps, upkeep and the 90-day projection with and without it, and
	 * Activate or End.
	 */
	import Button from '../ui/Button.svelte';
	import Panel from '../ui/Panel.svelte';
	import type { StrategyCard } from './strategies-model';

	let {
		cards,
		disabled = false,
		onaction
	}: {
		cards: StrategyCard[];
		disabled?: boolean;
		onaction: (action: 'activate' | 'end', id: string) => void;
	} = $props();
</script>

{#if cards.length === 0}
	<p class="empty" data-testid="strategies-off">Strategies need the economy.</p>
{:else}
	<div class="cards" data-testid="strategies">
		{#each cards as c (c.id)}
			<Panel title={c.label} data-testid="strategy-{c.id}">
				{#snippet aside()}{#if c.active}<span class="on">Active</span>{/if}{/snippet}
				<p class="desc">{c.description}</p>
				<ul class="effects">
					{#each c.effects as e (e)}<li>{e}</li>{/each}
				</ul>
				<p class="line">Upkeep: {c.upkeep}</p>
				<p class="line" data-testid="strategy-projection">{c.projection}</p>
				{#if c.blocked}<p class="blocked">{c.blocked}</p>{/if}
				{#if c.action}
					<div class="actions">
						<Button
							{disabled}
							variant={c.action === 'activate' ? 'primary' : 'default'}
							onclick={() => onaction(c.action!, c.id)}
							data-testid="strategy-{c.action}-{c.id}"
							>{c.action === 'activate' ? 'Activate' : 'End'}</Button
						>
					</div>
				{/if}
			</Panel>
		{/each}
	</div>
{/if}

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
		gap: 0.75rem;
		align-items: start;
	}
	.desc,
	.line,
	.empty,
	.blocked {
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.line {
		color: var(--text-secondary);
	}
	.blocked {
		color: var(--warn);
	}
	.effects {
		margin: 0.5rem 0.25rem;
		padding-left: 1rem;
		font-size: var(--t-small);
		color: var(--text-primary);
	}
	.on {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-primary);
	}
	.actions {
		margin: 0.5rem 0.25rem 0.25rem;
	}
</style>
