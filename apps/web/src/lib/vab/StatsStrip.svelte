<script lang="ts">
	import Meter from '../ui/Meter.svelte';
	import { formatDeltaV, formatDistance, formatFunds, formatMass } from '../format';
	import type { DesignCost } from '@orbital/core';
	import { speedUnit } from '../units.svelte';
	import type { DesignStats } from '../editor/stats';
	import type { Stability } from '../editor/stability';
	import type { Destination } from '../editor/trip';
	import type { TripView } from '../editor/trip-view';
	import { panelFolds } from './panel-folds.svelte';
	import { tripSummary } from './panel-model';
	import Icon from '../ui/Icon.svelte';

	let {
		stats,
		trip,
		destinations,
		destinationId,
		onpick,
		stability,
		cost
	}: {
		stats: DesignStats;
		/** The chosen destination laid over the stages (plan 034). */
		trip: TripView;
		/** Every destination the loaded bodies offer. */
		destinations: readonly Destination[];
		destinationId: string;
		onpick: (id: string) => void;
		stability: Stability;
		/** Launch cost (plan 095); absent hides the cell. */
		cost?: DesignCost;
	} = $props();

	const targetLabel = $derived(trip.destination.label);
	const idle = $derived(trip.state === 'empty' || trip.state === 'no-propulsion');
	const twrTone = $derived(
		stats.liftoffTwr === null
			? 'idle'
			: stats.liftoffTwr < 1
				? 'bad'
				: stats.liftoffTwr < 1.3
					? 'warn'
					: 'good'
	);
	const STABILITY_LABEL = {
		none: '–',
		unfinned: 'No fins',
		unstable: 'Unstable',
		marginal: 'Marginal',
		stable: 'Stable'
	} as const;
	const stabilityTone = $derived(
		stability.state === 'unstable'
			? 'bad'
			: stability.state === 'marginal'
				? 'warn'
				: stability.state === 'stable'
					? 'good'
					: 'idle'
	);
	const stabilityTitle = $derived(
		stability.state === 'none'
			? 'Centre of mass and centre of pressure'
			: `Centre of mass ${stability.com!.toFixed(1)} m, centre of pressure ${stability.cop!.toFixed(1)} m (white disc and orange ring in the view). ${
					stability.state === 'unfinned'
						? 'Without fins the reaction wheel holds the vessel.'
						: 'The pressure should sit below the mass.'
				}`
	);
	const n = formatDeltaV;
	const summary = $derived(tripSummary(trip, n, speedUnit()));
</script>

<section class="strip" aria-label="Vessel summary">
	<h2>Vessel</h2>
	<div class="grid">
		<div class="tile">
			<span class="k">Mass</span>
			<span class="v num">{stats.partCount ? formatMass(stats.wetMass) : '[—]'}</span>
		</div>
		<div class="tile">
			<span class="k">Parts</span>
			<span class="v num">{stats.partCount}</span>
		</div>
		<div class="tile">
			<span class="k">Height</span>
			<span class="v num">{stats.partCount ? formatDistance(stats.height) : '[—]'}</span>
		</div>
		<div class="tile">
			<span class="k">Δv</span>
			<span class="v num">{stats.partCount ? `${n(stats.totalDv)} ${speedUnit()}` : '[—]'}</span>
		</div>
		<div class="tile">
			<span class="k" data-tip="Thrust to weight at liftoff, sea level">TWR</span>
			<span class="v num {twrTone}"
				>{stats.liftoffTwr === null ? '[—]' : stats.liftoffTwr.toFixed(2)}</span
			>
		</div>
		<div
			class="tile"
			data-tip={cost
				? cost.uncosted.length
					? `No cost set for ${cost.uncosted.join(', ')}; they count as 0.`
					: `Parts ${formatFunds(cost.parts)}, contents ${formatFunds(cost.contents)}`
				: 'Costs need the economy'}
		>
			<span class="k">Cost</span>
			<span class="v num" data-testid="vab-cost"
				>{cost && stats.partCount ? formatFunds(cost.total) : '[—]'}</span
			>
			{#if cost?.uncosted.length}<span class="u">no cost set</span>{/if}
		</div>
	</div>
	<div class="stability" data-tip={stabilityTitle}>
		<span class="k">Stability</span>
		<span class="num {stabilityTone}"
			>{STABILITY_LABEL[
				stability.state
			]}{#if stability.state !== 'none' && stability.state !== 'unfinned'}<span class="u">
					{stability.margin! >= 0 ? '+' : ''}{stability.margin!.toFixed(1)} cal</span
				>{/if}</span
		>
		{#if stability.state !== 'none'}
			<span class="legend" aria-hidden="true"><b>◉</b> mass <b class="cop">△</b> pressure</span>
		{/if}
	</div>
	<details
		class="trip"
		open={panelFolds.isOpen('trip')}
		ontoggle={(e) => panelFolds.set('trip', e.currentTarget.open)}
		data-testid="trip"
	>
		<summary
			class="tripline"
			data-tip="The trip plan: the stages' delta-v against what the trip needs"
		>
			<span class="dot {summary.tone}" aria-hidden="true"></span>
			<span class="txt">{summary.text}</span>
			<span class="chev" aria-hidden="true"><Icon name="chevron" size={14} /></span>
		</summary>
		<label class="pick">
			<span class="u">Trip</span>
			<select
				value={destinationId}
				onchange={(e) => onpick(e.currentTarget.value)}
				aria-label="Destination for the trip plan"
			>
				{#each destinations as d (d.id)}
					<option value={d.id}>{d.label}</option>
				{/each}
			</select>
		</label>
		<div class="line">
			<span>{targetLabel}</span>
			<span class="num">
				<strong class:short={trip.state === 'short'}>{n(trip.covered)}</strong>
				<span class="u"> of about {n(trip.needed)} {speedUnit()}</span>
			</span>
		</div>
		<Meter
			value={trip.share}
			tone={idle ? 'accent' : trip.state === 'covered' ? 'positive' : 'warning'}
			label="Delta-v of the stages for the trip to {targetLabel}"
		/>
		<p class="note" data-state={trip.state}>
			{#if trip.state === 'empty'}
				Add parts to see which stages cover the trip.
			{:else if trip.state === 'no-propulsion'}
				No stage gives delta-v yet: add an engine and propellant, and put the engine in a stage.
			{:else if trip.state === 'covered'}
				Enough for the trip, with {n(trip.spare)}
				{speedUnit()} to spare.
			{:else}
				Short by about {n(trip.short)}
				{speedUnit()}. Add a stage or more propellant.
			{/if}
		</p>
		<details class="legs">
			<summary>Legs ({trip.rows.length})</summary>
			<ol>
				{#each trip.rows as row (row.id)}
					<li class={row.status}>
						<span class="what">{row.label}</span>
						<span class="num">{n(row.dv)}</span>
						<span class="who u">
							{#if row.status === 'idle'}
								–
							{:else}
								{#each row.covers as c, k (k)}{k > 0 ? ', ' : ''}{c.label}{c.seaLevel
										? ' (sea level)'
										: ''}
									{n(c.dv)}{/each}{#if row.short > 0.5}{row.covers.length > 0 ? ', ' : ''}short by {n(
										row.short
									)}{/if}
							{/if}
						</span>
					</li>
				{/each}
			</ol>
			<p class="u assumptions">
				Coplanar circular orbits, burns at once, a reference rocket of 1.5 g at launch. Moons come
				from the loaded bodies.
			</p>
		</details>
	</details>
</section>

<style>
	/* refs Vessel panel: a capital header, six tiles in three columns, then stability and the trip */
	.strip {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: var(--panel-pad);
		box-sizing: border-box;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	h2,
	.k {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h2 {
		padding: 0.25rem 0.375rem 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.tile {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.4375rem 0.5rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		min-width: 0;
	}
	.v {
		font-size: var(--t-small);
		line-height: 1;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.stability {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.5rem;
		padding: 0 0.375rem;
		font-size: var(--t-small);
	}
	.legend {
		display: block;
		font-size: var(--t-xs);
		color: var(--text-muted);
		white-space: nowrap;
	}
	.legend b {
		color: var(--text-primary);
	}
	.legend b.cop {
		color: var(--warn);
	}
	.good {
		color: var(--ok);
	}
	.warn {
		color: var(--warn);
	}
	.bad {
		color: var(--danger);
	}
	.trip {
		display: grid;
		gap: 4px;
		padding: 0.25rem 0.375rem 0;
		border-top: 1px solid var(--border-divider);
	}
	/* the trip as one line, the detail under a chevron (plan 255) */
	.tripline {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.5rem;
		cursor: pointer;
		list-style: none;
		font-size: var(--t-small);
	}
	.tripline::-webkit-details-marker {
		display: none;
	}
	.tripline .txt {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.tripline .dot {
		flex: none;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--text-muted);
	}
	.tripline .dot.good {
		background: var(--ok);
	}
	.tripline .dot.warn {
		background: var(--warn);
	}
	.chev {
		display: grid;
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	.trip[open] .chev {
		transform: rotate(90deg);
	}
	.trip[open] > :not(summary) {
		margin-top: 2px;
	}
	.line {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
		font-size: var(--t-sm);
	}
	.u {
		color: var(--text-muted);
		font-size: var(--t-xs);
	}
	strong {
		font-weight: 500;
		color: var(--ok);
	}
	strong.short {
		color: var(--warn);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}
	select {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-size: var(--t-sm);
		color: var(--text);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-tile);
		padding: 2px var(--s-2);
	}
	select:focus-visible,
	summary:focus-visible,
	.tripline:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.legs summary {
		cursor: pointer;
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
	.legs ol {
		list-style: none;
		margin: var(--s-1) 0 0;
		padding: 0;
		display: grid;
		gap: 2px;
	}
	.legs li {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0 var(--s-3);
		font-size: var(--t-xs);
	}
	.legs li .who {
		grid-column: 1 / -1;
	}
	.legs li.covered .num {
		color: var(--ok);
	}
	.legs li.partial .num,
	.legs li.short .num {
		color: var(--warn);
	}
	.assumptions {
		margin: var(--s-1) 0 0;
	}
	.note {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-muted);
	}
</style>
