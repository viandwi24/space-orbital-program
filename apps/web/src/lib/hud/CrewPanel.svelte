<script lang="ts">
	/**
	 * The crew card (refs `Main` bottom right; ADR 0144 point 4). With crew aboard it shows their
	 * condition and why (plan 107, ADR 0181 point 8); the roster and seating come with plan 108.
	 * EVA (plan 109, ADR 0120): a member steps out; while outside the suit walks, plants a flag and
	 * boards again.
	 */
	import SignalBars from '../ui/SignalBars.svelte';
	import Panel from '../ui/Panel.svelte';
	import type { CrewCard } from '../crew-card';

	let {
		card = null,
		eva = null,
		oneva,
		onwalk,
		onflag,
		onboard
	}: {
		card?: CrewCard | null;
		eva?: { suit: number; name: string; walking: boolean } | null;
		oneva?: (member: string) => void;
		onwalk?: (heading: number | null) => void;
		onflag?: () => void;
		onboard?: () => void;
	} = $props();

	const HEADINGS = [
		{ label: 'N', heading: 0 },
		{ label: 'E', heading: Math.PI / 2 },
		{ label: 'S', heading: Math.PI },
		{ label: 'W', heading: (3 * Math.PI) / 2 }
	];
</script>

<Panel title="Crew" data-testid="crew-panel">
	{#snippet aside()}<span class="num">[{card ? card.rows.length : '—'}]</span>{/snippet}
	{#if eva}
		<div class="eva" data-testid="crew-eva">
			<div class="name">{eva.name} is outside</div>
			<div class="buttons" role="group" aria-label="Walk">
				{#each HEADINGS as h (h.label)}
					<button type="button" onclick={() => onwalk?.(h.heading)} data-testid="eva-walk-{h.label}"
						>{h.label}</button
					>
				{/each}
				<button type="button" disabled={!eva.walking} onclick={() => onwalk?.(null)}>Stop</button>
			</div>
			<div class="buttons">
				<button type="button" onclick={() => onflag?.()} data-testid="eva-flag">Plant flag</button>
				<button type="button" onclick={() => onboard?.()} data-testid="eva-board">Board</button>
			</div>
		</div>
	{/if}
	{#if card}
		{#each card.rows as row (row.member)}
			<div class="row" data-testid="crew-row">
				<div class="name">
					{row.name}
					<!-- the suit chip and the radio (plan 108, ADR 0152 point 6): no suit radios until plan 121 -->
					<span class="suit" data-testid="crew-suit">IVA</span>
					<span class="radio" title="No radio until suit radios come"
						><SignalBars level={0} offline /><span class="no-radio">no radio</span></span
					>
					{#if !eva && oneva}<button
							type="button"
							class="step-out"
							onclick={() => oneva(row.member)}
							data-testid="crew-eva-{row.member}">EVA</button
						>{/if}
				</div>
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
		<p>No crew aboard. Seat crew on the Launch screen.</p>
	{/if}
</Panel>

<style>
	p {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.suit {
		margin-left: 0.375rem;
		padding: 0 0.375rem;
		border-radius: var(--radius-pill);
		background: var(--surface-chip);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		color: var(--text-secondary);
	}
	.radio {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: 0.375rem;
		vertical-align: middle;
	}
	.no-radio {
		font-size: var(--t-label);
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
	.eva {
		margin-bottom: var(--s-2);
	}
	.buttons {
		display: flex;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}
	.buttons button,
	.step-out {
		min-width: 2rem;
		height: 1.75rem;
		padding: 0 0.5rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text);
		font: inherit;
		font-size: var(--t-xs);
		cursor: pointer;
	}
	.buttons button:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.step-out {
		margin-left: 0.5rem;
	}
</style>
