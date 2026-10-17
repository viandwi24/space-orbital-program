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
		oncatchup
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
	} = $props();
	const index = $derived(Math.max(0, WARP_STEPS.indexOf(warp as (typeof WARP_STEPS)[number])));
	const reason =
		'Time warp needs the vessel on rails: shut the engines down and coast or sit still.';
</script>

<section class="warp" aria-label="Time">
	<span class="when">
		{#if date}<span class="date num" data-testid="hud-date">{date}</span>{/if}
		<span class="met num" data-testid="hud-met">{formatMet(met)}</span>
	</span>
	<span class="rule" aria-hidden="true"></span>
	<IconButton
		icon="slower"
		label="Slower time warp"
		hint={settings.keymap.label('warpDown')}
		disabled={!usable && warp === 1}
		onclick={onslower}
	/>
	<div
		class="pips"
		role="meter"
		aria-label="Time warp step"
		aria-valuemin="1"
		aria-valuemax={WARP_STEPS.length}
		aria-valuenow={index + 1}
		aria-valuetext={formatWarp(warp)}
	>
		{#each WARP_STEPS as step, i (step)}
			<span class="pip" class:on={i <= index} class:hot={i === index && i > 0}></span>
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
		gap: var(--s-2);
		padding: var(--s-1) var(--s-3);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	.when {
		display: flex;
		flex-direction: column;
		line-height: 1.15;
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
	.met {
		font-size: var(--t-sm);
		color: var(--text-dim);
		min-width: 7.5ch;
	}
	.rule {
		width: 1px;
		height: 20px;
		background: var(--line-strong);
	}
	.pips {
		display: flex;
		gap: 3px;
	}
	.pip {
		width: 9px;
		height: 14px;
		background: rgb(150 180 210 / 0.2);
		border-radius: 1px;
	}
	.pip.on {
		background: var(--c-accent-dim);
	}
	.pip.hot {
		background: var(--c-accent);
	}
	.x {
		min-width: 6ch;
		text-align: right;
		font-size: var(--t-md);
		font-weight: 500;
	}
</style>
