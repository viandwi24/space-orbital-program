<script lang="ts">
	import { settings } from '../settings/settings.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import { formatMet, formatWarp } from '../format';
	import { WARP_STEPS } from '../warp';
	import { behindText, type CatchUp } from '../worlds/world-model';

	let {
		warp,
		usable,
		met,
		date = '',
		onslower,
		onfaster,
		catchUp = { kind: 'none' },
		oncatchup,
		onpause
	}: {
		warp: number;
		usable: boolean;
		met: number;
		/** The game date in the world's calendar (plan 081); empty before the first model. */
		date?: string;
		onslower: () => void;
		onfaster: () => void;
		/** "Catch up to now" (plan 087, ADR 0143): shown while the world is behind the real date. */
		catchUp?: CatchUp;
		oncatchup?: () => void;
		/** Pause (opens the pause menu, which is what pausing is; ADR 0144 point 3). */
		onpause?: () => void;
	} = $props();
	const index = $derived(Math.max(0, WARP_STEPS.indexOf(warp as (typeof WARP_STEPS)[number])));
	const reason =
		'Time warp needs the vessel on rails: shut the engines down and coast or sit still.';
</script>

<!-- The refs time capsule (plan 088, ADR 0144 point 3): pause, one segment per warp step, MET and date. -->
<section class="warp" aria-label="Time">
	{#if onpause}
		<button type="button" class="play" aria-label="Pause" title="Pause (Esc)" onclick={onpause}>
			<svg viewBox="0 0 24 24" aria-hidden="true"
				><rect x="6" y="4" width="4" height="16" rx="1" /><rect
					x="14"
					y="4"
					width="4"
					height="16"
					rx="1"
				/></svg
			>
		</button>
	{/if}
	<IconButton
		icon="slower"
		label="Slower time warp"
		hint={settings.keymap.label('warpDown')}
		disabled={!usable && warp === 1}
		onclick={onslower}
	/>
	<div
		class="segs"
		role="meter"
		aria-label="Time warp step"
		aria-valuemin="1"
		aria-valuemax={WARP_STEPS.length}
		aria-valuenow={index + 1}
		aria-valuetext={formatWarp(warp)}
	>
		{#each WARP_STEPS as step, i (step)}
			<span class="seg" class:wide={i >= 4} class:past={i < index} class:now={i === index}></span>
		{/each}
	</div>
	<IconButton
		icon="faster"
		label="Faster time warp"
		hint={settings.keymap.label('warpUp')}
		disabled={!usable}
		onclick={onfaster}
	/>
	<span class="x num" data-testid="hud-warp">{warp}x</span>
	<span class="rule" aria-hidden="true"></span>
	<span class="when">
		<span class="met num" data-testid="hud-met">{formatMet(met)}</span>
		{#if date}<span class="date num" data-testid="hud-date">{date}</span>{/if}
	</span>
	{#if !usable}<span class="sr-only">{reason}</span>{/if}
	{#if catchUp.kind !== 'none'}
		<button
			type="button"
			class="catch-up"
			data-testid="catch-up"
			disabled={catchUp.kind === 'unavailable'}
			title={catchUp.kind === 'offer'
				? `The world is ${behindText(catchUp.behindSeconds)} behind the real date: warp to ${catchUp.date}`
				: catchUp.reason}
			onclick={() => oncatchup?.()}>Catch up to now</button
		>
		<span class="sr-only" data-testid="catch-up-why"
			>{catchUp.kind === 'offer'
				? `${behindText(catchUp.behindSeconds)} behind the real date`
				: `Catch up is unavailable: ${catchUp.reason}`}</span
		>
	{/if}
</section>

<style>
	.warp {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		height: var(--capsule);
		padding: 0.25rem 0.75rem 0.25rem 0.25rem;
		box-sizing: border-box;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.play {
		display: grid;
		place-items: center;
		width: var(--round-btn);
		height: var(--round-btn);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.play svg {
		width: 1rem;
		height: 1rem;
		fill: currentColor;
	}
	.segs {
		display: flex;
		align-items: center;
		gap: 0.1875rem;
	}
	.seg {
		width: 0.375rem;
		height: 1.125rem;
		border-radius: 3px;
		background: var(--surface-chip);
	}
	.seg.wide {
		width: 0.625rem;
	}
	.seg.past {
		background: var(--selected-bg);
	}
	.seg.now {
		background: var(--accent);
	}
	.x {
		min-width: 2.75rem;
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.rule {
		width: 1px;
		height: 1.125rem;
		background: var(--surface-chip);
	}
	.when {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
	}
	.met {
		font-size: var(--t-button);
		font-weight: 500;
		color: var(--text-primary);
		min-width: 7.5ch;
	}
	.date {
		font-size: var(--t-label);
		color: var(--text-muted);
		white-space: nowrap;
	}
	.catch-up {
		min-height: 1.75rem;
		padding: 0 0.625rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--on-accent);
		font-size: var(--t-small);
		font-weight: 700;
		white-space: nowrap;
	}
	.catch-up:disabled {
		background: var(--surface-button);
		color: var(--text-muted);
	}
</style>
