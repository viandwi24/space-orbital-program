<script lang="ts">
	import Meter from '../ui/Meter.svelte';
	import { formatDeltaV, formatDistance, formatMass } from '../format';
	import { speedUnit } from '../units.svelte';
	import type { DesignStats } from '../editor/stats';
	import type { Stability } from '../editor/stability';

	let {
		stats,
		ascent,
		needed,
		targetLabel,
		stability
	}: {
		stats: DesignStats;
		/** Delta-v available for the launch (first stage at sea level, the rest in vacuum), m/s. */
		ascent: number;
		/** Estimated delta-v to reach the target orbit, m/s. */
		needed: number;
		targetLabel: string;
		stability: Stability;
	} = $props();

	const enough = $derived(ascent >= needed);
	const share = $derived(needed > 0 ? ascent / needed : 0);
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
		<div class="line">
			<span>{targetLabel}</span>
			<span class="num">
				<strong class:short={stats.partCount > 0 && !enough}>{n(ascent)}</strong>
				<span class="u"> of about {n(needed)} {speedUnit()}</span>
			</span>
		</div>
		<Meter
			value={share}
			tone={stats.partCount === 0 ? 'accent' : enough ? 'positive' : 'warning'}
			label="Delta-v for the launch against what {targetLabel} needs"
		/>
		<p class="note">
			{#if stats.partCount === 0}
				Estimate: orbital speed plus gravity and drag losses.
			{:else if enough}
				Enough for the climb, with {n(ascent - needed)} {speedUnit()} to spare.
			{:else}
				Short by about {n(needed - ascent)} {speedUnit()}. Add a stage or more propellant.
			{/if}
		</p>
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
	.note {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
</style>
