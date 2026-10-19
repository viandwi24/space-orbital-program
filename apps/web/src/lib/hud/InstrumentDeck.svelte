<script lang="ts">
	import Term from '../ui/Term.svelte';
	/**
	 * The navball module (plan 088, ADRs 0107 and 0144; refs `Main` bottom centre): one solid bezel
	 * holding the monochrome navball, the vertical-speed arc, the heading chip, the SAS pod with the
	 * SAS and RCS pills, VEL and ALT, and a slim throttle bar. Geometry is the mock's 430 x 262 px
	 * module scaled by `--k` (ball 176 px at 1, 144 px on short screens) in rem, so the UI scale
	 * applies. The ball paints per frame (ADR 0026); everything else follows the 10 Hz model.
	 */
	import Meter from '../ui/Meter.svelte';
	import { settings } from '../settings/settings.svelte';
	import {
		formatBearing,
		formatDistance,
		formatPercent,
		formatSignedAngle,
		formatSpeed,
		NO_VALUE
	} from '../format';
	import { speedUnit, speedValue } from '../units.svelte';
	import type { HudModel } from '../hud-controller';
	import type { NavballFrame } from './navball-draw';
	import Navball from './Navball.svelte';
	import SasButtons from './SasButtons.svelte';
	import type { SasMode, SasSnapshot } from '@orbital/core';

	let {
		model,
		throttle,
		ballSize,
		oncyclespeed,
		sas,
		controllable = true,
		onsas,
		onrcs
	}: {
		model: HudModel | null;
		throttle: number;
		ballSize: number;
		oncyclespeed: () => void;
		/** Stability assist of the vessel (plan 042); the pod shows only when `onsas` is given. */
		sas?: SasSnapshot | undefined;
		controllable?: boolean;
		onsas?: (mode: SasMode) => void;
		/** The RCS pill was pressed (plan 211). */
		onrcs?: () => void;
	} = $props();

	let ball: Navball;
	export function paint(frame: NavballFrame | null): void {
		ball?.paint(frame);
	}

	// Number and unit apart, so the digits never jump around.
	const split = (s: string): { n: string; u: string } => {
		const i = s.lastIndexOf(' ');
		return { n: s.slice(0, i), u: s.slice(i + 1) };
	};
	const speedParts = $derived.by(() => {
		const v = model?.speed;
		if (v === undefined || !Number.isFinite(v)) return { n: NO_VALUE, u: speedUnit() };
		return split(formatSpeed(v));
	});
	const alt = $derived(model ? split(formatDistance(model.altitude)) : { n: NO_VALUE, u: 'm' });
	const vs = $derived(model?.vertical ?? 0);
	const modeText = $derived(
		model
			? model.speedMode === 'surface'
				? 'SRF'
				: model.speedMode === 'target'
					? 'TGT'
					: 'ORB'
			: '—'
	);
	const modeTitle = $derived(
		`Speed reference ${
			model ? `${model.speedMode}${model.speedPreference === 'auto' ? ' (auto)' : ''}` : ''
		}: press to cycle (${settings.keymap.label('speedMode')})`
	);
	const att = $derived(model?.attitude);

	// The vertical-speed arc (refs): radius 96 around the ball's centre (154, 104), on the left,
	// +-40 degrees around 180; up for climbing. A log scale to 2 km/s so slow and fast both read.
	const CX = 154;
	const CY = 104;
	const R = 96;
	const at = (deg: number): [number, number] => [
		CX + R * Math.cos((deg * Math.PI) / 180),
		CY - R * Math.sin((deg * Math.PI) / 180)
	];
	const fraction = $derived(
		Math.max(-1, Math.min(1, (Math.sign(vs) * Math.log10(1 + Math.abs(vs))) / Math.log10(1 + 2000)))
	);
	const arc = $derived.by(() => {
		const [x, y] = at(180 - fraction * 40);
		return `M58 104 A96 96 0 0 ${fraction >= 0 ? 1 : 0} ${x.toFixed(2)} ${y.toFixed(2)}`;
	});
	const k = $derived(ballSize / 176);
</script>

<section class="deck" aria-label="Flight instruments" style:--k={k}>
	<svg class="bezel" viewBox="0 0 430 262" aria-hidden="true">
		<circle cx="154" cy="104" r="104" />
		<rect x="50" y="190" width="250" height="72" rx="18" />
		<circle cx="316" cy="190" r="66" />
		{#if onsas}<rect x="380" y="112" width="48" height="134" rx="24" />{/if}
	</svg>

	<svg class="vs" viewBox="0 0 430 262" aria-hidden="true">
		<path class="track" d="M80.5 42.3 A96 96 0 0 0 80.5 165.7" />
		{#if Math.abs(fraction) > 0.002}<path class="value" d={arc} />{/if}
		<line x1="52" y1="104" x2="62" y2="104" />
	</svg>
	<span class="vsv num" data-tip="Vertical speed, {speedUnit()}"
		><span data-testid="hud-vspeed">{speedValue(Math.abs(vs)).toFixed(1)}</span><span class="vsu"
			>{vs >= 0 ? '▲' : '▼'}
			{model?.speedMode === 'target' ? 'range' : 'v/s'}</span
		></span
	>

	<div class="throttle" data-tip="Throttle">
		<div class="bar"><Meter vertical value={throttle} tone="accent" label="Throttle" /></div>
		<span class="num pct" data-testid="hud-throttle">{formatPercent(throttle)}</span>
	</div>

	<span class="heading num" data-tip="Heading">{att ? formatBearing(att.heading) : NO_VALUE}</span>
	<span class="sr-only" aria-label="Attitude"
		>{att
			? `Pitch ${formatSignedAngle(att.pitch)}, heading ${formatBearing(att.heading)}, roll ${formatSignedAngle(att.roll)}`
			: NO_VALUE}</span
	>

	<div class="ball">
		<!-- the canvas in px follows the UI scale like its rem slot (plan 215: at 0.8 it covered the arcs) -->
		<Navball
			bind:this={ball}
			size={Math.round(ballSize * settings.ui.scale)}
			label="Navball: attitude relative to the horizon"
		/>
	</div>

	<div class="readouts">
		<div class="row">
			<span class="lab">VEL</span>
			<span class="value"
				><span class="num" data-testid="hud-speed">{speedParts.n}</span><span class="unit"
					>{speedParts.u}</span
				></span
			>
			<button type="button" class="chip" onclick={oncyclespeed} data-tip={modeTitle}
				>{modeText}</button
			>
		</div>
		<div class="rule"></div>
		<div class="row">
			<span class="lab"><Term id="altitude">ALT</Term></span>
			<span class="value"
				><span class="num" data-testid="hud-altitude">{alt.n}</span><span class="unit">{alt.u}</span
				></span
			>
			{#if model && model.radar !== null}
				<span
					class="chip"
					data-tip="Radar altitude: height of your lowest point above the ground right under you."
					data-tip-term="radar-altitude"
					>RAD <span data-testid="hud-radar">{formatDistance(model.radar)}</span></span
				>
			{:else}
				<span class="chip quiet" data-tip="Above sea level of {model?.body ?? 'the body'}">SEA</span
				>
			{/if}
		</div>
	</div>

	{#if onsas}
		<div class="pod">
			<SasButtons
				{sas}
				{controllable}
				hasNode={model?.maneuver != null}
				hasTarget={model?.target != null}
				rcs={model?.rcs ?? 'none'}
				{onrcs}
				onmode={onsas}
			/>
		</div>
	{/if}
</section>

<style>
	/* 1 mock px = 0.0625rem at --k 1 */
	.deck {
		--u: calc(0.0625rem * var(--k));
		position: relative;
		width: calc(430 * var(--u));
		height: calc(262 * var(--u));
		filter: drop-shadow(0 16px 32px rgb(0 0 0 / 0.6));
		color: var(--text-body);
		font-variant-numeric: tabular-nums;
	}
	.bezel,
	.vs {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.bezel {
		fill: var(--surface-solid);
	}
	.vs {
		pointer-events: none;
		fill: none;
		stroke-linecap: round;
	}
	.vs .track {
		stroke: var(--surface-track);
		stroke-width: 4;
	}
	.vs .value {
		stroke: var(--accent);
		stroke-width: 4;
	}
	.vs line {
		stroke: var(--text-primary);
		stroke-width: 1.5;
	}
	.vsv {
		position: absolute;
		left: 0;
		top: calc(6 * var(--u));
		display: grid;
		justify-items: start;
		font-size: var(--t-label);
		font-weight: 600;
		color: var(--text-secondary);
	}
	.vsu {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.throttle {
		position: absolute;
		left: 0;
		top: calc(60 * var(--u));
		bottom: calc(80 * var(--u));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		width: calc(40 * var(--u));
	}
	.bar {
		flex: 1;
		display: flex;
	}
	.pct {
		font-size: var(--t-label);
		font-weight: 600;
	}
	.heading {
		position: absolute;
		left: calc(130 * var(--u));
		top: calc(-8 * var(--u));
		width: calc(48 * var(--u));
		padding: 0.1875rem 0;
		border-radius: var(--radius-pill);
		background: var(--ball-ground-top);
		color: var(--text-primary);
		font-size: var(--t-small);
		font-weight: 700;
		text-align: center;
		z-index: 1;
	}
	.ball {
		position: absolute;
		left: calc(66 * var(--u));
		top: calc(16 * var(--u));
		width: calc(176 * var(--u));
		height: calc(176 * var(--u));
		display: grid;
		place-items: center;
	}
	.readouts {
		position: absolute;
		left: calc(66 * var(--u));
		top: calc(208 * var(--u));
		width: calc(180 * var(--u));
		display: grid;
		gap: 0.1875rem;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		min-height: 1rem;
	}
	.lab {
		width: 1.625rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		color: var(--text-muted);
	}
	.value {
		flex: 1;
		white-space: nowrap;
		font-size: var(--t-value);
		font-weight: 500;
		color: var(--text-primary);
	}
	.unit {
		margin-left: 0.25rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.rule {
		height: 1px;
		background: var(--border-divider);
	}
	.chip {
		padding: 0.125rem 0.3125rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-chip);
		color: var(--text-secondary);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		white-space: nowrap;
	}
	button.chip:hover {
		background: var(--surface-track);
	}
	.chip.quiet {
		color: var(--text-muted);
	}
	.pod {
		position: absolute;
		left: calc(250 * var(--u));
		top: calc(124 * var(--u));
		width: calc(132 * var(--u));
		height: calc(132 * var(--u));
	}
</style>
