<script lang="ts">
	import Term from '../ui/Term.svelte';
	/**
	 * The navball module (v3 since plan 272, V3 §2.4, ADR 0253 point 6; first plan 088, ADR 0144):
	 * one solid body holding the readouts on the left, the monochrome navball with the vertical-speed
	 * arc on its left and the throttle arc on its right, the round SAS pod with the SAS and RCS pills,
	 * and the status strip along the bottom. Geometry is the design's 552 x 232 px module scaled by
	 * `--k` (ball 180 px at 1, 144 px on short screens) in rem, so the UI scale applies. The ball
	 * paints per frame (ADR 0026); everything else follows the 10 Hz model.
	 */
	import StatusStrip from './StatusStrip.svelte';
	import type { ChipFix, StatusChip } from './status-chips';
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
		onrcs,
		chips = [],
		onfix = () => {},
		flash = null
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
		/** The status strip's conditions (V3 §2.2). */
		chips?: readonly StatusChip[];
		onfix?: (fix: ChipFix) => void;
		/** The chip that flashes (V3 §2.2). */
		flash?: StatusChip['id'] | null;
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

	// The arcs (V3 §2.4): radius 96 around the ball's centre (280, 98). Vertical speed on the left,
	// +-40 degrees around 180, up for climbing, on a log scale to 2 km/s so slow and fast both read.
	// The throttle on the right, filled from the bottom (-40 degrees) up to +40 degrees.
	const CX = 280;
	const CY = 98;
	const R = 96;
	const at = (deg: number): [number, number] => [
		CX + R * Math.cos((deg * Math.PI) / 180),
		CY - R * Math.sin((deg * Math.PI) / 180)
	];
	const pt = (deg: number): string =>
		at(deg)
			.map((v) => v.toFixed(2))
			.join(' ');
	const fraction = $derived(
		Math.max(-1, Math.min(1, (Math.sign(vs) * Math.log10(1 + Math.abs(vs))) / Math.log10(1 + 2000)))
	);
	const arc = $derived(`M184 98 A96 96 0 0 ${fraction >= 0 ? 1 : 0} ${pt(180 - fraction * 40)}`);
	const thr = $derived(Math.max(0, Math.min(1, throttle)));
	const thrArc = $derived(`M${pt(-40)} A96 96 0 0 0 ${pt(-40 + thr * 80)}`);
	const k = $derived(ballSize / 180);
	/** `+0.05`, `-0.10`, `0.00`: a trim value with its sign (plan 245). */
	const signed = (v: number): string => (v > 0 ? '+' : '') + v.toFixed(2);
</script>

<section class="deck" aria-label="Flight instruments" style:--k={k}>
	<svg class="bezel" viewBox="0 0 552 232" aria-hidden="true">
		<rect x="0" y="88" width="552" height="144" rx="20" />
		<circle cx="280" cy="98" r="102" />
		{#if onsas}<circle cx="468" cy="128" r="68" />{/if}
	</svg>

	<svg class="arcs" viewBox="0 0 552 232" aria-hidden="true">
		<path class="track" d="M206.5 36.3 A96 96 0 0 0 206.5 159.7" />
		{#if Math.abs(fraction) > 0.002}<path class="value" d={arc} />{/if}
		<line x1="178" y1="98" x2="192" y2="98" />
		<path class="track" d="M353.5 159.7 A96 96 0 0 0 353.5 36.3" />
		{#if thr > 0.002}<path class="thr" class:off={!controllable} d={thrArc} />{/if}
	</svg>
	<span class="vsv num" data-tip="Vertical speed, {speedUnit()}: centre is level, up is climbing"
		>{model?.speedMode === 'target' ? 'RNG' : 'V/S'}
		<b
			>{vs < 0 ? '−' : ''}<span data-testid="hud-vspeed">{speedValue(Math.abs(vs)).toFixed(1)}</span
			></b
		></span
	>
	<span
		class="thrv num"
		class:off={!controllable}
		data-tip={controllable ? 'Throttle' : 'Throttle: not responding, the vessel is uncontrolled'}
		>THR <b data-testid="hud-throttle">{formatPercent(throttle)}</b></span
	>

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

	{#if model?.trim}
		<span
			class="chip trim num"
			data-testid="hud-trim"
			data-tip="Trim: Alt+W/S pitch, Alt+A/D yaw, Alt+Q/E roll, Alt+X resets"
			>TRIM P {signed(model.trim.pitch)} Y {signed(model.trim.yaw)} R {signed(
				model.trim.roll
			)}</span
		>
	{/if}

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
				<span class="chip" data-tip="Above sea level of {model?.body ?? 'the body'}">SEA</span>
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

	<span class="rule" aria-hidden="true"></span>
	<div class="status"><StatusStrip {chips} {onfix} {flash} /></div>
</section>

<style>
	/* 1 design px = 0.0625rem at --k 1 (V3 §2.4: 552 x 232, solid #141518, a drop shadow) */
	.deck {
		--u: calc(0.0625rem * var(--k));
		position: relative;
		width: calc(552 * var(--u));
		height: calc(232 * var(--u));
		color: var(--text-body);
		font-variant-numeric: tabular-nums;
	}
	.bezel,
	.arcs {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.bezel {
		fill: var(--surface-solid);
		filter: drop-shadow(0 16px 32px rgb(0 0 0 / 0.6));
	}
	.arcs {
		pointer-events: none;
		fill: none;
		stroke-linecap: round;
		stroke-width: 4;
	}
	.arcs .track {
		stroke: rgb(255 255 255 / 0.12);
	}
	.arcs .value,
	.arcs .thr {
		stroke: var(--accent);
	}
	.arcs .thr.off {
		stroke: #5b5d63;
	}
	.arcs line {
		stroke: var(--text-primary);
		stroke-width: 2;
	}
	.vsv,
	.thrv {
		position: absolute;
		top: calc(174 * var(--u));
		width: calc(56 * var(--u));
		text-align: center;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 600;
		color: var(--text-muted);
		white-space: nowrap;
	}
	.vsv {
		left: calc(158 * var(--u));
	}
	.thrv {
		left: calc(346 * var(--u));
		font-weight: 700;
	}
	.vsv b,
	.thrv b {
		font-weight: 600;
		color: var(--text-primary);
	}
	.thrv.off b {
		color: var(--text-subtle);
	}
	.heading {
		position: absolute;
		left: calc(256 * var(--u));
		top: calc(-14 * var(--u));
		width: calc(48 * var(--u));
		padding: 0.1875rem 0;
		border-radius: var(--radius-pill);
		background: var(--ball-ground-top, #26282c);
		color: var(--text-primary);
		font-size: var(--t-small);
		font-weight: 700;
		text-align: center;
		z-index: 1;
	}
	.ball {
		position: absolute;
		left: calc(190 * var(--u));
		top: calc(8 * var(--u));
		width: calc(180 * var(--u));
		height: calc(180 * var(--u));
		display: grid;
		place-items: center;
	}
	.trim {
		position: absolute;
		left: calc(18 * var(--u));
		top: calc(94 * var(--u));
		color: var(--text-primary);
	}
	/* the left wing: numbers only, 15/500 with the reference chips (V3 §2.4) */
	.readouts {
		position: absolute;
		left: calc(18 * var(--u));
		top: calc(112 * var(--u));
		width: calc(150 * var(--u));
		display: grid;
		gap: calc(14 * var(--u));
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		min-height: 1rem;
		min-width: 0;
	}
	.lab {
		width: 1.625rem;
		flex: none;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--text-muted);
	}
	/* the number never shortens; the reference chip gives way on short screens (ball 144) */
	.value {
		flex: 1 0 auto;
		white-space: nowrap;
		font-size: calc(15 * var(--u));
		font-weight: 500;
		line-height: 1;
		color: var(--text-primary);
	}
	.unit {
		margin-left: 0.3125rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.chip {
		flex: 0 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0.125rem 0.375rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: #2a2c30;
		color: var(--text-secondary);
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: var(--tracking-chip);
		white-space: nowrap;
	}
	button.chip {
		cursor: pointer;
	}
	button.chip:hover {
		background: var(--surface-track);
	}
	button.chip:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.pod {
		position: absolute;
		left: calc(400 * var(--u));
		top: calc(60 * var(--u));
		width: calc(136 * var(--u));
		height: calc(136 * var(--u));
	}
	.rule {
		position: absolute;
		left: calc(16 * var(--u));
		top: calc(202 * var(--u));
		width: calc(520 * var(--u));
		height: 1px;
		background: var(--border-divider);
	}
	.status {
		position: absolute;
		left: calc(16 * var(--u));
		top: calc(207 * var(--u));
		width: calc(520 * var(--u));
	}
</style>
