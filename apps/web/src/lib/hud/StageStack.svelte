<script lang="ts">
	import Term from '../ui/Term.svelte';
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
	/** The row's parts in words from their staging icons (V3 §2.5: "Engine · decoupler ×3"). */
	const words = (icons: readonly string[]): string => {
		const counts = new Map<string, number>();
		for (const i of icons) counts.set(i, (counts.get(i) ?? 0) + 1);
		const list = [...counts].map(([i, n]) => `${i.replace(/[-_]/g, ' ')}${n > 1 ? ` ×${n}` : ''}`);
		const text = list.join(' · ');
		return text.charAt(0).toUpperCase() + text.slice(1);
	};
</script>

<!-- V3 §2.5 (plan 272): staging at the bottom right; the queue scrolls, the stage in hand, GO and the total. -->
<Panel title="Staging" data-testid="staging">
	{#snippet aside()}
		<span class="num order"
			>{rows.length > 0 ? `${Number(rows[0]!.label)} → ${Number(rows.at(-1)!.label)}` : ''}</span
		>
		{#if onview && bodies.length > 0}
			<!-- the "Δv · Here" chip (V3 §2.5): where the delta-v is read -->
			<span class="dvchip">
				<select
					value={view?.body ?? ''}
					aria-label="Delta-v for body"
					data-tip="Δv is calculated here, for the vessel as flown, or at another body"
					data-testid="dv-body"
					onchange={(e) => {
						const id = e.currentTarget.value;
						onview(id ? { body: id, situation: view?.situation ?? 'vacuum' } : null);
					}}
				>
					<option value="">Δv · Here</option>
					{#each bodies as b (b.id)}<option value={b.id}>Δv · {b.label}</option>{/each}
				</select>
				<svg viewBox="0 0 24 24" width="9" height="9" aria-hidden="true"
					><path d="M6 9 L12 15 L18 9" /></svg
				>
			</span>
		{/if}
	{/snippet}

	{#if view}
		<div class="dvpick">
			<select
				value={view.situation}
				aria-label="Situation"
				data-testid="dv-situation"
				onchange={(e) =>
					onview?.({ body: view.body, situation: e.currentTarget.value as 'vacuum' | 'surface' })}
			>
				<option value="vacuum">Vacuum</option>
				<option value="surface" disabled={!pickedAir}>Surface</option>
			</select>
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
					<span class="what">
						<span class="icons">
							{#each r.icons.slice(0, 4) as icon, i (i)}<Icon name={icon} size={13} />{/each}
						</span>
						<span class="parts">{words(r.icons)}</span>
					</span>
					<span class="dvs">
						<span class="num dv">{dv(r.dv)} {speedUnit()}</span>
						<span class="num twr">TWR {r.twr > 0 ? r.twr.toFixed(2) : '—'}</span>
					</span>
				</li>
			{/each}
		</ol>
		{#if hand}
			<div class="card" class:burning={hand.current}>
				<div class="head">
					<span class="badge num">{hand.label.padStart(2, '0')}</span>
					<span class="lab">{hand.current ? 'Current' : 'Next'} · <Term id="delta-v">Δv</Term></span
					>
					<span class="big num">{dv(hand.dv)}<span class="u"> {speedUnit()}</span></span>
				</div>
				{#if hand.fuel !== null}
					<Meter
						value={hand.fuel}
						tone={hand.fuel < 0.05 ? 'danger' : hand.fuel < 0.15 ? 'warning' : 'accent'}
						label="Propellant of stage {hand.label}: {formatPercent(hand.fuel)}"
					/>
				{/if}
				<div class="meta num">
					<span><Term id="twr">TWR</Term> {hand.twr.toFixed(2)}</span>
					{#if hand.fuel !== null}<span>{formatPercent(hand.fuel)} propellant</span>{/if}
					<span>Burn {hand.burnTime > 0 ? formatDuration(hand.burnTime) : '—'}</span>
				</div>
				{#if hand.current}<span class="sr-only">{throttle > 0 ? 'burning' : 'engine idle'}</span
					>{/if}
			</div>
		{/if}
	{/if}

	<div class="foot">
		<button
			type="button"
			class="go"
			disabled={!canStage}
			aria-label="Stage ({settings.keymap.label('stage')})"
			data-tip="Activate the next stage ({settings.keymap.label('stage')})"
			onclick={onstage}>GO</button
		>
		<span class="lab">Total <Term id="delta-v">Δv</Term></span>
		<span
			class="total num"
			data-tip="Total delta-v of the remaining stages, {environment === 'vacuum'
				? 'in vacuum'
				: 'at sea level'}"
			>{dv(stages.total)}<span class="u">
				{speedUnit()} {environment === 'vacuum' ? 'vac' : 'asl'}</span
			></span
		>
	</div>
</Panel>

<style>
	/* V3 §2.5: right 24, bottom 56, 260 wide, padding 10, radius 16; it grows up and its queue scrolls */
	:global(.panel[data-testid='staging']) {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		max-height: 100%;
		min-height: 0;
		box-sizing: border-box;
	}
	:global(.panel[data-testid='staging'] > header) {
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
		min-height: 1.375rem;
		margin-bottom: 0;
		padding-left: 0.375rem;
	}
	:global(.panel[data-testid='staging'] > header .aside) {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.order {
		font-size: var(--t-label);
		font-weight: 600;
		color: var(--text-subtle);
	}
	.dvchip {
		position: relative;
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		height: 1.375rem;
		border-radius: var(--radius-pill);
		background: var(--surface-tile);
		color: var(--text-secondary);
	}
	.dvchip select {
		appearance: none;
		height: 100%;
		max-width: 8rem;
		padding: 0 1.125rem 0 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: inherit;
		font: inherit;
		font-size: var(--t-label);
		font-weight: 600;
		cursor: pointer;
	}
	.dvchip select:focus-visible {
		outline: 2px solid var(--text-primary);
	}
	.dvchip svg {
		position: absolute;
		right: 0.375rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}
	.dvpick {
		display: flex;
		justify-content: flex-end;
	}
	.dvpick select {
		padding: 0.125rem 0.25rem;
		font: inherit;
		font-size: var(--t-xs);
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	.empty {
		margin: 0;
		padding: 0 0.375rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.queue {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		flex: 0 1 auto;
		min-height: 2.5rem;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.queue li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: none;
		min-height: 2.5rem;
		padding: 0 0.375rem;
		border-top: 1px solid var(--border-divider);
		color: var(--text-subtle);
	}
	.queue li.next .n {
		color: var(--text-primary);
	}
	.n {
		width: 1.125rem;
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-subtle);
	}
	.what {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
	}
	.icons {
		display: inline-flex;
		gap: 0.1875rem;
		color: var(--text-secondary);
	}
	.parts {
		font-size: var(--t-label);
		color: var(--text-subtle);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dvs {
		margin-left: auto;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
		white-space: nowrap;
	}
	.dv {
		font-size: var(--t-small);
		font-weight: 600;
		color: var(--text-body);
	}
	.twr {
		font-size: var(--t-label);
		color: var(--text-subtle);
	}
	.lab {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.card {
		flex: none;
		display: grid;
		gap: 0.5rem;
		padding: 0.625rem 0.5rem;
		border-radius: 0.625rem;
		background: var(--surface-hover);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.125rem;
	}
	.badge {
		height: 1.125rem;
		display: flex;
		align-items: center;
		padding: 0 0.375rem;
		border-radius: 0.3125rem;
		background: var(--accent);
		color: var(--on-accent);
		font-size: var(--t-small);
		font-weight: 700;
	}
	.big {
		margin-left: auto;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}
	.u {
		margin-left: 0.2em;
		font-size: var(--t-label);
		font-weight: 500;
		color: var(--text-muted);
	}
	.meta {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.foot {
		flex: none;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-height: 1.875rem;
	}
	.go {
		min-height: 1.875rem;
		padding: 0 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: var(--selected-bg);
		color: var(--selected-fg);
		font-size: var(--t-small);
		font-weight: 700;
		letter-spacing: 0.1em;
		cursor: pointer;
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
	.go:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	.total {
		margin-left: auto;
		padding-right: 0.375rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-primary);
	}
</style>
