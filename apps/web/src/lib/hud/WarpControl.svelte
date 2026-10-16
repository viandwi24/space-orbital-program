<script lang="ts">
	import IconButton from '../ui/IconButton.svelte';
	import { formatMet, formatWarp } from '../format';
	import { WARP_STEPS } from '../warp';

	let {
		warp,
		usable,
		met,
		onslower,
		onfaster
	}: {
		warp: number;
		usable: boolean;
		met: number;
		onslower: () => void;
		onfaster: () => void;
	} = $props();
	const index = $derived(Math.max(0, WARP_STEPS.indexOf(warp as (typeof WARP_STEPS)[number])));
	const reason =
		'Time warp needs the vessel on rails: shut the engines down and coast or sit still.';
</script>

<section class="warp" aria-label="Time">
	<span class="met num" data-testid="hud-met">{formatMet(met)}</span>
	<span class="rule" aria-hidden="true"></span>
	<IconButton
		icon="slower"
		label="Slower time warp"
		hint=","
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
		hint="."
		disabled={!usable}
		onclick={onfaster}
	/>
	<span class="x num" data-testid="hud-warp">{warp}x</span>
	{#if !usable}<span class="sr-only">{reason}</span>{/if}
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
