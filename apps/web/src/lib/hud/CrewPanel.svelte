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
	import type { BroadcastOffer, RadioBars } from '../comms/suit-radio';

	let {
		card = null,
		eva = null,
		broadcasts = [],
		onbroadcast,
		oneva,
		onwalk,
		onflag,
		onboard
	}: {
		card?: CrewCard | null;
		/** The suit radio (plan 121, ADR 0193): its bars, what it relays through, why it is cut. */
		eva?: { suit: number; name: string; walking: boolean; radio?: RadioBars } | null;
		/** Firsts that may still be broadcast live (ADR 0193 point 5). */
		broadcasts?: readonly BroadcastOffer[];
		onbroadcast?: (milestone: string) => void;
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
			{#if eva.radio}
				<div class="radio" data-testid="suit-radio">
					<SignalBars level={eva.radio.level} offline={eva.radio.offline} /><span
						class:no-radio={eva.radio.offline}>Suit radio · {eva.radio.text}</span
					>
				</div>
			{/if}
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
		<!-- at most three rows show; more scroll inside (plan 215, ADR 0205 point 5) -->
		<div class="rows">
			{#each card.rows as row (row.member)}
				<div class="row" data-testid="crew-row">
					<div class="name">
						{row.name}
						<!-- the suit chip and the radio (plan 108, ADR 0152 point 6): inside, the vessel's link (plan 121) -->
						<span class="suit" data-testid="crew-suit">IVA</span>
						<span class="radio" title={card.radio.text} data-testid="crew-radio"
							><SignalBars
								level={card.radio.level}
								offline={card.radio.offline}
							/>{#if card.radio.offline}<span class="no-radio">{card.radio.text}</span>{/if}</span
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
		</div>
		{#if card.supplies.length > 0}
			<div class="supplies" data-testid="crew-supplies">
				{#each card.supplies as line (line)}<small>{line}</small>{/each}
			</div>
		{/if}
	{:else}
		<p>No crew aboard. Seat crew on the Launch screen.</p>
	{/if}
	{#if broadcasts.length > 0}
		<div class="live" data-testid="broadcasts">
			{#each broadcasts as b (b.milestone)}
				<div class="offer">
					<div>
						<div class="name">{b.label}</div>
						<small>{b.detail}</small>
					</div>
					<button
						type="button"
						disabled={!b.ready}
						onclick={() => onbroadcast?.(b.milestone)}
						data-testid="broadcast-{b.milestone}">Broadcast live</button
					>
				</div>
			{/each}
		</div>
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
	.rows {
		max-height: calc(3 * 3.75rem);
		overflow-y: auto;
		scrollbar-width: thin;
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
	.eva .radio {
		margin: 0.125rem 0 0;
		font-size: var(--t-label);
	}
	.live {
		margin-top: var(--s-2);
	}
	.offer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
	}
	.offer + .offer {
		margin-top: var(--s-1);
	}
	.offer small {
		display: block;
		font-size: var(--t-xs);
		color: var(--text-dim);
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
