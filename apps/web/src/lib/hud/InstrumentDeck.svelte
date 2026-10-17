<script lang="ts">
	import Icon from '../ui/Icon.svelte';
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
		onsas
	}: {
		model: HudModel | null;
		throttle: number;
		ballSize: number;
		oncyclespeed: () => void;
		/** Stability assist of the vessel (plan 042); the strip shows only when `onsas` is given. */
		sas?: SasSnapshot | undefined;
		controllable?: boolean;
		onsas?: (mode: SasMode) => void;
	} = $props();

	let ball: Navball;
	export function paint(frame: NavballFrame | null): void {
		ball?.paint(frame);
	}

	// Speed and altitude readouts: whole number plus unit, so the digits never jump around.
	const parts = (m: number): { n: string; u: string } => {
		const s = formatDistance(m);
		const i = s.lastIndexOf(' ');
		return { n: s.slice(0, i), u: s.slice(i + 1) };
	};
	const speedParts = $derived.by(() => {
		const v = model?.speed;
		if (v === undefined || !Number.isFinite(v)) return { n: NO_VALUE, u: speedUnit() };
		const s = formatSpeed(v);
		const i = s.lastIndexOf(' ');
		return { n: s.slice(0, i), u: s.slice(i + 1) };
	});
	const alt = $derived(model ? parts(model.altitude) : { n: NO_VALUE, u: 'm' });
	const speedLog = $derived(model ? Math.log10(1 + model.speed) / Math.log10(1 + 12_000) : 0);
	const altLog = $derived(model ? Math.log10(1 + Math.max(0, model.altitude)) / 7 : 0);
	const vs = $derived(model?.vertical ?? 0);
	const modeText = $derived(
		model
			? `${model.speedMode === 'surface' ? 'Surface' : model.speedMode === 'target' ? 'Target' : 'Orbit'}${model.speedPreference === 'auto' ? ' (auto)' : ''}`
			: ''
	);
	const att = $derived(model?.attitude);
</script>

<section class="deck" aria-label="Flight instruments">
	<div class="throttle">
		<div class="bar"><Meter vertical value={throttle} tone="warning" label="Throttle" /></div>
		<div class="num big">{formatPercent(throttle)}</div>
		<div class="cap">Throttle</div>
	</div>

	<div class="read left">
		<button
			type="button"
			class="chip"
			onclick={oncyclespeed}
			title="Speed reference ({settings.keymap.label(
				'speedMode'
			)}): auto, surface, orbit or, with a target, target"
		>
			{modeText || 'Speed'}
		</button>
		<div class="value">
			<span class="num big" data-testid="hud-speed">{speedParts.n}</span><span class="unit"
				>{speedParts.u}</span
			>
		</div>
		<Meter value={speedLog} label="Speed on a log scale" />
		<div class="sub num">
			<Icon name={vs >= 0 ? 'up' : 'down'} size={14} />
			<span data-testid="hud-vspeed">{speedValue(Math.abs(vs)).toFixed(1)}</span><span class="unit"
				>{speedUnit()} {model?.speedMode === 'target' ? 'range rate' : 'vertical'}</span
			>
		</div>
	</div>

	<div class="ball">
		<Navball bind:this={ball} size={ballSize} label="Navball: attitude relative to the horizon" />
		<div class="att num" aria-label="Attitude">
			{#if att}
				<span>P {formatSignedAngle(att.pitch)}</span>
				<span>H {formatBearing(att.heading)}</span>
				<span>R {formatSignedAngle(att.roll)}</span>
			{:else}
				<span>{NO_VALUE}</span>
			{/if}
		</div>
		{#if onsas}<SasButtons
				{sas}
				{controllable}
				hasNode={model?.maneuver != null}
				hasTarget={model?.target != null}
				onmode={onsas}
			/>{/if}
	</div>

	<div class="read right">
		<div class="cap">Altitude</div>
		<div class="value">
			<span class="num big" data-testid="hud-altitude">{alt.n}</span><span class="unit"
				>{alt.u}</span
			>
		</div>
		<Meter value={altLog} tone="positive" label="Altitude on a log scale" />
		<div class="sub num">
			<span class="unit">above</span> <span>{model?.body ?? ''}</span>
		</div>
		{#if model && model.radar !== null}
			<div class="sub num" title="Height above the ground under the vessel">
				<span class="unit">radar</span>
				<span data-testid="hud-radar">{formatDistance(model.radar)}</span>
			</div>
		{/if}
	</div>
</section>

<style>
	.deck {
		display: grid;
		grid-template-columns: 56px 150px auto 150px;
		align-items: end;
		gap: var(--s-4);
		padding: var(--s-3) var(--s-4);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	.cap {
		font-size: var(--t-xs);
		color: var(--text-dim);
		font-weight: 500;
	}
	.big {
		font-size: var(--t-xl);
		font-weight: 500;
		line-height: 1;
	}
	.unit {
		margin-left: 4px;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.throttle {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-1);
		align-self: stretch;
		justify-content: flex-end;
	}
	.throttle .big {
		font-size: var(--t-md);
	}
	.bar {
		flex: 1;
		min-height: 90px;
		display: flex;
	}
	.read {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		padding-bottom: var(--s-3);
	}
	.value {
		white-space: nowrap;
	}
	.sub {
		display: flex;
		align-items: center;
		gap: var(--s-1);
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.chip {
		align-self: flex-start;
		padding: 2px var(--s-2);
		font-size: var(--t-xs);
		font-weight: 600;
		color: var(--c-accent);
		background: rgb(92 207 255 / 0.1);
		border: 1px solid rgb(92 207 255 / 0.35);
		border-radius: var(--r-control);
	}
	.chip:hover {
		background: rgb(92 207 255 / 0.2);
	}
	.right {
		text-align: left;
	}
	.ball {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-1);
	}
	.att {
		display: flex;
		gap: var(--s-3);
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
</style>
