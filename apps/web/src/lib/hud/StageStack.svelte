<script lang="ts">
	import Panel from '../ui/Panel.svelte';
	import Icon from '../ui/Icon.svelte';
	import Meter from '../ui/Meter.svelte';
	import { settings } from '../settings/settings.svelte';
	import { formatDeltaV, formatDuration, formatPercent } from '../format';
	import { speedUnit } from '../units.svelte';
	import type { StageStackModel } from '../stage-stack';
	import type { DeltaVView } from '../hud-controller';

	let {
		stages,
		environment,
		throttle,
		onstage,
		bodies = [],
		view = null,
		onview
	}: {
		stages: StageStackModel;
		environment: 'vacuum' | 'sea-level';
		throttle: number;
		onstage: () => void;
		/** The delta-v picker's bodies (plan 224); no picker without them. */
		bodies?: readonly { id: string; label: string; atmosphere: boolean }[];
		view?: DeltaVView | null;
		onview?: (view: DeltaVView | null) => void;
	} = $props();
	const pickedAir = $derived(bodies.find((b) => b.id === view?.body)?.atmosphere ?? false);

	// The vessel stands upright on screen: the stage that fires first sits at the bottom.
	const rows = $derived([...stages.rows].reverse());
	const canStage = $derived(stages.rows.some((r) => r.next));
	/** The stage in hand: the burn in progress, else the one Space fires next. */
	const hand = $derived(
		stages.rows.find((r) => r.current) ?? stages.rows.find((r) => r.next) ?? null
	);
	/** The queue above it, the stage that fires last at the top. */
	const queue = $derived(rows.filter((r) => r !== hand));
	const dv = formatDeltaV;
</script>

<!-- The refs staging panel (plan 088): the queue, the stage in hand with its delta-v and propellant, GO and the total. -->
<Panel title="Staging" data-testid="staging">
	{#snippet aside()}
		<span class="num order"
			>{rows.length > 0 ? `${rows[0]!.label} → ${rows.at(-1)!.label}` : ''}</span
		>
	{/snippet}

	{#if onview && bodies.length > 0}
		<div class="dvpick">
			<select
				value={view?.body ?? ''}
				aria-label="Delta-v for body"
				data-testid="dv-body"
				onchange={(e) => {
					const id = e.currentTarget.value;
					onview(id ? { body: id, situation: view?.situation ?? 'vacuum' } : null);
				}}
			>
				<option value="">Here, as flown</option>
				{#each bodies as b (b.id)}<option value={b.id}>{b.label}</option>{/each}
			</select>
			{#if view}
				<select
					value={view.situation}
					aria-label="Situation"
					data-testid="dv-situation"
					onchange={(e) =>
						onview({ body: view.body, situation: e.currentTarget.value as 'vacuum' | 'surface' })}
				>
					<option value="vacuum">Vacuum</option>
					<option value="surface" disabled={!pickedAir}>Surface</option>
				</select>
			{/if}
		</div>
	{/if}
	{#if stages.empty === 'no-staging'}
		<p class="empty">
			This vessel has no staging. Assign engines and decouplers to stages in the VAB.
		</p>
	{:else if stages.empty === 'spent'}
		<p class="empty">Every stage has been used.</p>
	{:else}
		<ol class="queue">
			{#each queue as r (r.stage)}
				<li class:next={r.next} aria-current={r.next ? 'step' : undefined}>
					<span class="n num">{r.label.padStart(2, '0')}</span>
					<span class="icons">
						{#each r.icons.slice(0, 3) as icon, i (i)}<Icon name={icon} size={14} />{/each}
					</span>
					<span class="dvs num">{dv(r.dv)}</span>
					{#if r.next}<span class="tag">Next</span>{/if}
				</li>
			{/each}
		</ol>
		{#if hand}
			<div class="card" class:burning={hand.current}>
				<div class="head">
					<span class="badge num">{hand.label.padStart(2, '0')}</span>
					<span class="lab">{hand.current ? 'Current' : 'Next'} · Δv</span>
					<span class="big num">{dv(hand.dv)}<span class="u"> {speedUnit()}</span></span>
				</div>
				{#if hand.fuel !== null}
					<div class="tank">
						<span>Propellant</span><span class="num">{formatPercent(hand.fuel)}</span>
					</div>
					<Meter
						value={hand.fuel}
						tone={hand.fuel < 0.05 ? 'danger' : hand.fuel < 0.15 ? 'warning' : 'accent'}
						label="Propellant of stage {hand.label}: {formatPercent(hand.fuel)}"
					/>
				{/if}
				<div class="meta num">
					<span>TWR {hand.twr.toFixed(2)}</span>
					<span>{hand.burnTime > 0 ? formatDuration(hand.burnTime) : '-'} burn</span>
					{#if hand.current}<span>{throttle > 0 ? 'burning' : 'engine idle'}</span>{/if}
				</div>
			</div>
		{/if}
	{/if}

	<div class="foot">
		<button
			type="button"
			class="go"
			disabled={!canStage}
			aria-label="Stage ({settings.keymap.label('stage')})"
			title="Activate the next stage ({settings.keymap.label('stage')})"
			onclick={onstage}>GO</button
		>
		<span class="lab">Total Δv</span>
		<span
			class="total num"
			title="Total delta-v of the remaining stages, {environment === 'vacuum'
				? 'in vacuum'
				: 'at sea level'}"
			>{dv(stages.total)}<span class="u">
				{speedUnit()} {environment === 'vacuum' ? 'vac' : 'asl'}</span
			></span
		>
	</div>
</Panel>

<style>
	.dvpick {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 0.375rem;
	}
	.dvpick select {
		flex: 1 1 0;
		min-width: 0;
		padding: 0.125rem 0.25rem;
		font: inherit;
		font-size: var(--t-xs);
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	:global(.panel[data-testid='staging']) {
		display: grid;
		gap: 0.375rem;
	}
	.order {
		font-size: var(--t-label);
		color: var(--text-subtle);
	}
	.empty {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.queue {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.125rem;
	}
	.queue li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.625rem;
		padding: 0 0.5rem;
		border: 1px solid transparent;
		border-radius: var(--radius-tile);
		color: var(--text-subtle);
		font-size: var(--t-small);
	}
	.queue li.next {
		border-color: var(--border-strong);
		color: var(--text-primary);
		font-weight: 600;
	}
	.n {
		width: 1.125rem;
		font-size: var(--t-button);
		font-weight: 600;
	}
	.icons {
		display: inline-flex;
		gap: 0.125rem;
	}
	.dvs {
		flex: 1;
		text-align: right;
	}
	.tag,
	.lab {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.card {
		display: grid;
		gap: 0.375rem;
		padding: 0.625rem 0.5rem;
		border-radius: var(--radius-row);
		background: var(--surface-hover);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.badge {
		padding: 0.0625rem 0.375rem;
		border-radius: 0.3125rem;
		background: var(--accent);
		color: var(--on-accent);
		font-size: var(--t-small);
		font-weight: 700;
	}
	.big {
		margin-left: auto;
		font-size: var(--t-value);
		font-weight: 600;
		color: var(--text-primary);
	}
	.u {
		margin-left: 0.2em;
		font-size: var(--t-label);
		font-weight: 500;
		color: var(--text-muted);
	}
	.tank,
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.75rem;
	}
	.go {
		min-height: 1.75rem;
		padding: 0 0.875rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: var(--selected-bg);
		color: var(--selected-fg);
		font-size: var(--t-small);
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	@media (pointer: coarse) {
		.go {
			min-height: var(--touch-min);
		}
	}
	.go:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.total {
		margin-left: auto;
		padding-right: 0.5rem;
		font-size: var(--t-value);
		font-weight: 600;
		color: var(--text-primary);
	}
</style>
