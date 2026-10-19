<script lang="ts">
	import Panel from '../ui/Panel.svelte';
	import Term from '../ui/Term.svelte';
	import { formatAngle, formatDistance, formatDuration, NO_VALUE } from '../format';
	import type { OrbitInfo } from '../orbit-info';
	import type { FlightPhase } from '../telemetry';

	let {
		orbit,
		phase,
		prelaunch = false,
		onwarp
	}: {
		orbit: OrbitInfo | null;
		phase: FlightPhase | null;
		/** On the pad before liftoff (plan 200): the conic through the ground is no orbit. */
		prelaunch?: boolean;
		/** Warp to just before the apsis (plan 206, ADR 0202 point 6). */
		onwarp?: (to: 'apoapsis' | 'periapsis') => void;
	} = $props();
	const below = $derived(orbit !== null && orbit.periapsis < 0);
</script>

<Panel title="Orbit">
	{#if orbit && !prelaunch}
		<dl>
			<dt><Term id="apoapsis">Apoapsis</Term></dt>
			<dd class="num">
				{orbit.apoapsis !== undefined
					? formatDistance(orbit.apoapsis)
					: orbit.escape
						? 'escape'
						: NO_VALUE}
				<span class="t"
					>{orbit.timeToApoapsis !== undefined
						? `in ${formatDuration(orbit.timeToApoapsis)}`
						: ''}</span
				>
			</dd>
			<dt><Term id="periapsis">Periapsis</Term></dt>
			<dd class="num" class:warn={below}>
				{formatDistance(orbit.periapsis)}
				<span class="t"
					>{orbit.timeToPeriapsis !== undefined
						? `in ${formatDuration(orbit.timeToPeriapsis)}`
						: ''}</span
				>
			</dd>
			<dt><Term id="orbital-period">Period</Term></dt>
			<dd class="num">{orbit.period !== undefined ? formatDuration(orbit.period) : NO_VALUE}</dd>
			<dt><Term id="inclination">Inclination</Term></dt>
			<dd class="num">{formatAngle(orbit.inclination)}</dd>
			<dt><Term id="eccentricity">Eccentricity</Term></dt>
			<dd class="num">{orbit.eccentricity.toFixed(3)}</dd>
		</dl>
		{#if below}<p class="note">Periapsis is below the surface, so this is not an orbit yet.</p>{/if}
		{#if onwarp}
			<div class="to">
				{#if orbit.apoapsis !== undefined}
					<button type="button" data-testid="warp-to-ap" onclick={() => onwarp('apoapsis')}
						>Warp to Ap</button
					>
				{/if}
				<button type="button" data-testid="warp-to-pe" onclick={() => onwarp('periapsis')}
					>Warp to Pe</button
				>
			</div>
		{/if}
	{:else}
		<p class="note">
			{phase === 'landed' || prelaunch
				? 'On the surface, no orbit yet. Launch to get one.'
				: 'No orbit yet.'}
		</p>
	{/if}
</Panel>

<style>
	.to {
		display: flex;
		gap: var(--s-2);
		margin-top: var(--s-2);
	}
	.to button {
		font: inherit;
		font-size: var(--t-small);
		padding: 0.125rem 0.5rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
		background: var(--surface-button);
		color: var(--text-secondary);
		cursor: pointer;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 3px var(--s-4);
		margin: 0;
		font-size: var(--t-sm);
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		text-align: right;
		white-space: nowrap;
	}
	.t {
		margin-left: var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-dim);
		display: inline-block;
		min-width: 9ch;
		text-align: left;
	}
	.warn {
		color: var(--c-warning);
	}
	.note {
		margin: var(--s-2) 0 0;
		max-width: 30ch;
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
</style>
