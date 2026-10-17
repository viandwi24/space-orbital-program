<script lang="ts">
	/**
	 * The Home screen's last-world card (plan 089, refs Home): the world played last, its newest save's
	 * vessel and figures. What no save records (velocity, delta-v) shows the honest `[—]` (ADR 0107).
	 */
	import { formatDistance, formatMet } from '../format';
	import { ago } from '../save/describe';
	import type { SaveMeta } from '../save/game-save';
	import type { WorldRecord } from '../save/world-record';
	import Icon from '../ui/Icon.svelte';
	import StatCell from '../ui/StatCell.svelte';

	let {
		world,
		mode,
		newest,
		now
	}: {
		world: WorldRecord;
		/** The preset's label (Sandbox, Career, ...). */
		mode: string;
		/** The world's newest save, or null before the first flight. */
		newest: SaveMeta | null;
		now: number;
	} = $props();

	const KIND = { auto: 'Autosave', quick: 'Quicksave', manual: 'Saved' } as const;
	const system = $derived(
		world.world?.systemId === 'stock' || !world.world ? 'Stock system' : world.world.systemId
	);
	const s = $derived(newest?.summary ?? null);
</script>

<section class="card" aria-label="Last world" data-testid="last-world">
	<div class="top">
		<span class="cap">Last world</span>
		{#if newest}<span class="when">{KIND[newest.kind]} · {ago(newest.createdAt, now)}</span>{/if}
	</div>
	<div class="name">
		<span class="world">{world.name}</span>
		<span class="meta"
			>{mode} · {system} · {world.summary.saves}
			{world.summary.saves === 1 ? 'save' : 'saves'}</span
		>
	</div>
	<div class="rule"></div>
	<span class="cap small">Active vessel</span>
	<div class="vessel">
		<span class="tile"><Icon name="vessel" size={16} /></span>
		<span class="text">
			<span class="vname">{s?.vessel ?? '[—]'}</span>
			<span class="meta"
				>{s ? (s.mode === 'on-rails' ? 'On rails' : 'In flight') : 'No flight yet'}{#if s}
					· {s.vessels} {s.vessels === 1 ? 'vessel' : 'vessels'}{/if}</span
			>
		</span>
	</div>
	<div class="stats">
		<StatCell label="Altitude" value={s?.altitude == null ? null : formatDistance(s.altitude)} />
		<StatCell label="Velocity" value={null} />
		<StatCell label="Total Δv" value={null} />
	</div>
	<div class="met">
		<span>Mission time</span><span class="num">{s ? formatMet(s.simTime) : '[—]'}</span>
	</div>
</section>

<style>
	/* refs: 340 wide, padding 14, gap 12, glass */
	.card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 21.25rem;
		max-width: 100%;
		box-sizing: border-box;
		padding: 0.875rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.cap {
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.cap.small {
		color: var(--text-subtle);
	}
	.when,
	.meta {
		font-size: var(--t-label);
		line-height: 1.1;
		color: var(--text-muted);
	}
	.name {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem;
	}
	.world {
		font-size: 1.125rem;
		line-height: 1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.rule {
		height: 1px;
		background: var(--border-divider);
	}
	.vessel {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.tile {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.5625rem;
		background: var(--surface-button);
		color: var(--text-secondary);
	}
	.text {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}
	.vname {
		font-size: var(--t-value);
		line-height: 1;
		font-weight: 600;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.met {
		display: flex;
		justify-content: space-between;
		font-size: var(--t-label);
		line-height: 1;
		color: var(--text-muted);
	}
	.met .num {
		font-weight: 600;
		color: var(--text-primary);
	}
</style>
