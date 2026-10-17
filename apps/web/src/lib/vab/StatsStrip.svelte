<script lang="ts">
	import Meter from '../ui/Meter.svelte';
	import { formatDeltaV, formatDistance, formatMass } from '../format';
	import { speedUnit } from '../units.svelte';
	import type { DesignStats } from '../editor/stats';
	import type { Stability } from '../editor/stability';
	import type { Destination } from '../editor/trip';
	import type { TripView } from '../editor/trip-view';

	let {
		stats,
		trip,
		destinations,
		destinationId,
		onpick,
		stability
	}: {
		stats: DesignStats;
		/** The chosen destination laid over the stages (plan 034). */
		trip: TripView;
		/** Every destination the loaded bodies offer. */
		destinations: readonly Destination[];
		destinationId: string;
		onpick: (id: string) => void;
		stability: Stability;
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
</script>

<section class="strip" aria-label="Vessel summary">
	<dl>
		<div>
			<dt>Parts</dt>
			<dd class="num">{stats.partCount}</dd>
		</div>
		<div>
			<dt>Mass</dt>
			<dd class="num">{stats.partCount ? formatMass(stats.wetMass) : '–'}</dd>
		</div>
		<div>
			<dt>Height</dt>
			<dd class="num">{stats.partCount ? formatDistance(stats.height) : '–'}</dd>
		</div>
		<div title={stabilityTitle}>
			<dt>Stability</dt>
			<dd class="num {stabilityTone}">
				{STABILITY_LABEL[
					stability.state
				]}{#if stability.state !== 'none' && stability.state !== 'unfinned'}<span class="u">
						{stability.margin! >= 0 ? '+' : ''}{stability.margin!.toFixed(1)} cal</span
					>{/if}
			</dd>
			{#if stability.state !== 'none'}
				<span class="legend" aria-hidden="true"><b>◉</b> mass <b class="cop">△</b> pressure</span>
			{/if}
		</div>
		<div>
			<dt title="Thrust to weight at liftoff, sea level">Liftoff TWR</dt>
			<dd class="num {twrTone}">{stats.liftoffTwr === null ? '–' : stats.liftoffTwr.toFixed(2)}</dd>
		</div>
	</dl>
	<div class="trip">
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
	</div>
</section>

<style>
	.strip {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--s-2) var(--s-5);
		max-width: 100%;
		box-sizing: border-box;
		padding: var(--s-2) var(--s-4);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	dl {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-2) var(--s-4);
		margin: 0;
	}
	dt {
		white-space: nowrap;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		white-space: nowrap;
		font-size: var(--t-lg);
		font-weight: 500;
	}
	.legend {
		display: block;
		font-size: var(--t-xs);
		color: var(--text-dim);
		white-space: nowrap;
	}
	.legend b {
		color: var(--c-accent);
	}
	.legend b.cop {
		color: var(--c-warning);
	}
	.good {
		color: var(--c-positive);
	}
	.warn {
		color: var(--c-warning);
	}
	.bad {
		color: var(--c-danger);
	}
	.trip {
		display: grid;
		flex: 1 1 250px;
		max-width: 340px;
		gap: 4px;
	}
	.line {
		display: flex;
		justify-content: space-between;
		gap: var(--s-3);
		font-size: var(--t-sm);
	}
	.u {
		color: var(--text-dim);
		font-size: var(--t-xs);
	}
	strong {
		font-weight: 500;
		color: var(--c-positive);
	}
	strong.short {
		color: var(--c-warning);
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
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		padding: 2px var(--s-2);
	}
	select:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	.legs summary {
		cursor: pointer;
		font-size: var(--t-xs);
		color: var(--text-dim);
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
		color: var(--c-positive);
	}
	.legs li.partial .num,
	.legs li.short .num {
		color: var(--c-warning);
	}
	.assumptions {
		margin: var(--s-1) 0 0;
	}
	.note {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
</style>
