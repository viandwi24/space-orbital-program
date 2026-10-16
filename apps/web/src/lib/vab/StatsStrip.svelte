<script lang="ts">
	import Meter from '../ui/Meter.svelte';
	import { formatMass } from '../format';
	import type { DesignStats } from '../editor/stats';

	let {
		stats,
		ascent,
		needed,
		targetLabel
	}: {
		stats: DesignStats;
		/** Delta-v available for the launch (first stage at sea level, the rest in vacuum), m/s. */
		ascent: number;
		/** Estimated delta-v to reach the target orbit, m/s. */
		needed: number;
		targetLabel: string;
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
	const n = (v: number): string => Math.round(v).toLocaleString('en-US');
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
			<dd class="num">{stats.partCount ? `${stats.height.toFixed(1)} m` : '–'}</dd>
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
				<span class="u"> of about {n(needed)} m/s</span>
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
				Enough for the climb, with {n(ascent - needed)} m/s to spare.
			{:else}
				Short by about {n(needed - ascent)} m/s. Add a stage or more propellant.
			{/if}
		</p>
	</div>
</section>

<style>
	.strip {
		display: grid;
		grid-template-columns: auto minmax(260px, 340px);
		align-items: center;
		gap: var(--s-5);
		padding: var(--s-2) var(--s-4);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	dl {
		display: flex;
		gap: var(--s-5);
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
