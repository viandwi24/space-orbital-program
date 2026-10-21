<script lang="ts">
	/**
	 * The Orbit panel (plan 017, ADR 0202 point 6; v3 since plan 274, V3_CHANGES §2.1): one column of
	 * right-aligned values, the time to an apsis as sub-text under it, warp as an icon at the end of the
	 * apsis rows, and the terms' tooltips without the dotted underline.
	 */
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
	const apoapsis = $derived(
		orbit
			? orbit.apoapsis !== undefined
				? formatDistance(orbit.apoapsis)
				: orbit.escape
					? 'escape'
					: NO_VALUE
			: NO_VALUE
	);
</script>

{#snippet warp(to: 'apoapsis' | 'periapsis', testid: string)}
	{#if onwarp}
		<button
			type="button"
			class="warp"
			aria-label="Warp to {to}"
			data-tip="Warp to {to}"
			data-testid={testid}
			onclick={() => onwarp(to)}
			><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"
				><path d="M5 6 L11 12 L5 18 Z M13 6 L19 12 L13 18 Z" /></svg
			></button
		>
	{/if}
{/snippet}

<Panel title="Orbit">
	{#if orbit && !prelaunch}
		<div class="rows">
			<div class="row">
				<span class="k"><Term id="apoapsis">Apoapsis</Term></span>
				<span class="v"
					><span class="num">{apoapsis}</span>{#if orbit.timeToApoapsis !== undefined}<span
							class="sub num">in {formatDuration(orbit.timeToApoapsis)}</span
						>{/if}</span
				>
				<span class="w"
					>{#if orbit.apoapsis !== undefined}{@render warp('apoapsis', 'warp-to-ap')}{/if}</span
				>
			</div>
			<div class="row">
				<span class="k"><Term id="periapsis">Periapsis</Term></span>
				<span class="v" class:warn={below}
					><span class="num">{formatDistance(orbit.periapsis)}</span
					>{#if orbit.timeToPeriapsis !== undefined}<span class="sub num"
							>in {formatDuration(orbit.timeToPeriapsis)}</span
						>{/if}</span
				>
				<span class="w">{@render warp('periapsis', 'warp-to-pe')}</span>
			</div>
			<div class="row">
				<span class="k"><Term id="orbital-period">Period</Term></span>
				<span class="v num"
					>{orbit.period !== undefined ? formatDuration(orbit.period) : NO_VALUE}</span
				>
				<span class="w"></span>
			</div>
			<div class="row">
				<span class="k"><Term id="inclination">Inclination</Term></span>
				<span class="v num">{formatAngle(orbit.inclination)}</span>
				<span class="w"></span>
			</div>
			<div class="row">
				<span class="k"><Term id="eccentricity">Eccentricity</Term></span>
				<span class="v num">{orbit.eccentricity.toFixed(3)}</span>
				<span class="w"></span>
			</div>
		</div>
		{#if below}<p class="note">Periapsis is below the surface, so this is not an orbit yet.</p>{/if}
	{:else}
		<p class="note">
			{phase === 'landed' || prelaunch
				? 'On the surface, no orbit yet. Launch to get one.'
				: 'No orbit yet.'}
		</p>
	{/if}
</Panel>

<style>
	.rows {
		display: flex;
		flex-direction: column;
	}
	/* V3 §2.1: key · value (right-aligned, sub-text under) · a 28 px warp column */
	.row {
		display: grid;
		grid-template-columns: 1fr auto 1.75rem;
		align-items: center;
		column-gap: 0.5rem;
		min-height: 2.25rem;
		border-top: 1px solid var(--border-divider);
	}
	.k {
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	/* the tooltip stays; the dotted underline goes (V3 §2.1) */
	.k :global(.term) {
		text-decoration: none;
		color: inherit;
	}
	.v {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 3px;
		font-size: var(--t-value);
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
	}
	.sub {
		font-size: var(--t-label);
		font-weight: 400;
		color: var(--text-subtle);
	}
	.w {
		display: flex;
		justify-content: flex-end;
	}
	.warp {
		width: 1.625rem;
		height: 1.625rem;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 7px;
		background: var(--surface-tile);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.warp:hover {
		background: var(--surface-track);
		color: var(--text-primary);
	}
	.warp:focus-visible {
		outline: 2px solid var(--text-primary);
	}
	.warp svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linejoin: round;
	}
	.warn {
		color: var(--c-warning);
	}
	.note {
		margin: var(--s-2) 0 0;
		max-width: 30ch;
		font-size: var(--t-value);
		color: var(--text-dim);
	}
</style>
