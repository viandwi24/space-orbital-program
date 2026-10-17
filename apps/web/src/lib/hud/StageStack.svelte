<script lang="ts">
	import Panel from '../ui/Panel.svelte';
	import Button from '../ui/Button.svelte';
	import Icon from '../ui/Icon.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import Meter from '../ui/Meter.svelte';
	import { settings } from '../settings/settings.svelte';
	import { formatDeltaV, formatDuration, formatPercent } from '../format';
	import { speedUnit } from '../units.svelte';
	import type { StageStackModel } from '../stage-stack';

	let {
		stages,
		environment,
		throttle,
		onstage
	}: {
		stages: StageStackModel;
		environment: 'vacuum' | 'sea-level';
		throttle: number;
		onstage: () => void;
	} = $props();

	// The vessel stands upright on screen: the stage that fires first sits at the bottom.
	const rows = $derived([...stages.rows].reverse());
	const canStage = $derived(stages.rows.some((r) => r.next));
	const dv = formatDeltaV;
</script>

<Panel title="Stages">
	{#snippet aside()}
		<span
			class="num total"
			title="Total delta-v of the remaining stages, {environment === 'vacuum'
				? 'in vacuum'
				: 'at sea level'}"
		>
			{dv(stages.total)}
			<span class="u">{speedUnit()} {environment === 'vacuum' ? 'vac' : 'asl'}</span>
		</span>
	{/snippet}

	{#if stages.empty === 'no-staging'}
		<p class="empty">
			This vessel has no staging. Assign engines and decouplers to stages in the VAB.
		</p>
	{:else if stages.empty === 'spent'}
		<p class="empty">Every stage has been used.</p>
	{:else}
		<ol>
			{#each rows as r (r.stage)}
				<li
					class:next={r.next}
					class:current={r.current}
					aria-current={r.next ? 'step' : undefined}
				>
					<div class="top">
						<span class="badge num">{r.label}</span>
						<span class="icons">
							{#each r.icons as icon, i (i)}<Icon name={icon} size={16} />{/each}
						</span>
						<span class="dv num">{dv(r.dv)}<span class="u"> {speedUnit()}</span></span>
					</div>
					<div class="meta num">
						<span>TWR {r.twr.toFixed(2)}</span>
						<span>{r.burnTime > 0 ? formatDuration(r.burnTime) : '-'} burn</span>
						{#if r.current}<span class="live">{throttle > 0 ? 'burning' : 'engine idle'}</span
							>{:else if r.next}<span class="live">next</span>{/if}
					</div>
					{#if r.fuel !== null}
						<Meter
							value={r.fuel}
							tone={r.fuel < 0.05 ? 'danger' : r.fuel < 0.15 ? 'warning' : 'positive'}
							label="Propellant of stage {r.label}: {formatPercent(r.fuel)}"
						/>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	<div class="foot">
		<Button variant="primary" disabled={!canStage} onclick={onstage}>
			Stage <Kbd>{settings.keymap.label('stage')}</Kbd>
		</Button>
	</div>
</Panel>

<style>
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	li {
		display: grid;
		gap: 5px;
		padding: var(--s-2);
		background: rgb(150 180 210 / 0.07);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	li.next {
		border-color: var(--c-accent);
		background: rgb(92 207 255 / 0.1);
	}
	li.current {
		border-color: var(--c-warning);
	}
	.top {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}
	.badge {
		display: inline-grid;
		place-items: center;
		width: 22px;
		height: 22px;
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--c-ink);
		background: var(--text-dim);
		border-radius: var(--r-control);
	}
	.next .badge {
		background: var(--c-accent);
	}
	.current .badge {
		background: var(--c-warning);
	}
	.icons {
		display: flex;
		gap: 3px;
		color: var(--text-dim);
	}
	.dv {
		margin-left: auto;
		font-size: var(--t-md);
		font-weight: 500;
	}
	.u {
		font-size: var(--t-xs);
		color: var(--text-dim);
		font-weight: 400;
	}
	.meta {
		display: flex;
		gap: var(--s-3);
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.live {
		margin-left: auto;
		color: var(--text);
		font-family: var(--font-ui);
		font-weight: 600;
	}
	.total {
		font-size: var(--t-sm);
		color: var(--text);
	}
	.empty {
		margin: 0 0 var(--s-2);
		max-width: 26ch;
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
	.foot {
		display: flex;
		margin-top: var(--s-3);
	}
	.foot :global(.btn) {
		flex: 1;
	}
</style>
