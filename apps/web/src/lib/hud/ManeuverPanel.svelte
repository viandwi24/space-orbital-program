<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Panel from '../ui/Panel.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { formatDuration, formatSpeed } from '../format';
	import type { ManeuverHud } from '../hud-controller';

	let {
		maneuver,
		map,
		warpUsable,
		onwarp,
		onpoint,
		onremove
	}: {
		maneuver: ManeuverHud | null;
		map: boolean;
		/** The vessel is on rails, so time warp can start. */
		warpUsable: boolean;
		onwarp: () => void;
		onpoint: () => void;
		onremove: () => void;
	} = $props();

	const status = $derived.by(() => {
		if (!maneuver) return '';
		if (maneuver.state === 'overdue') return 'Overdue: the burn window has passed';
		if (maneuver.state === 'burn') return 'Burn now';
		if (maneuver.toBurn === null) return `Node in ${formatDuration(maneuver.toNode)}`;
		return `Burn in ${formatDuration(maneuver.toBurn)}`;
	});
</script>

{#if maneuver}
	<Panel title={maneuver.count > 1 ? `Maneuver (1 of ${maneuver.count})` : 'Maneuver'}>
		<div
			class="status"
			class:burn={maneuver.state === 'burn'}
			class:overdue={maneuver.state === 'overdue'}
			data-testid="maneuver-status"
			role="status"
		>
			{status}
		</div>
		<dl>
			<dt>Delta-v</dt>
			<dd class="num" data-testid="maneuver-dv">{formatSpeed(maneuver.dv)}</dd>
			<dt>Burn time</dt>
			<dd class="num" data-testid="maneuver-burn">
				{#if maneuver.burnTime === null}
					no engine lit
				{:else}
					{formatDuration(maneuver.burnTime)}{maneuver.short ? ' (not enough fuel)' : ''}
				{/if}
			</dd>
			<dt>Node in</dt>
			<dd class="num">{formatDuration(maneuver.toNode)}</dd>
		</dl>
		<div class="row">
			<Button
				onclick={onwarp}
				disabled={!warpUsable}
				title="Time warp to 30 s before the burn starts"
			>
				Warp to burn
			</Button>
			<Button
				variant={maneuver.pointing ? 'primary' : 'default'}
				onclick={onpoint}
				title="Point the nose at the burn (8)"
				aria-pressed={maneuver.pointing}
			>
				Point SAS
			</Button>
			<Button variant="ghost" onclick={onremove} title="Remove the node (Delete in map view)"
				>Remove</Button
			>
		</div>
		<p class="note">Impulsive plan: the burn starts half its length before the node.</p>
	</Panel>
{:else if map}
	<Panel title="Maneuver">
		<p class="note">
			Click the orbit to plan a burn. Drag the handles or use <Kbd>I</Kbd><Kbd>K</Kbd>
			<Kbd>L</Kbd><Kbd>J</Kbd>
			<Kbd>O</Kbd><Kbd>U</Kbd>.
		</p>
	</Panel>
{/if}

<style>
	.status {
		margin-bottom: var(--s-2);
		font-size: var(--t-md);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.status.burn {
		color: var(--c-positive);
	}
	.status.overdue {
		color: var(--c-warning);
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 3px var(--s-4);
		margin: 0 0 var(--s-2);
		font-size: var(--t-sm);
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		text-align: right;
		white-space: nowrap;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.note {
		margin: var(--s-2) 0 0;
		max-width: 34ch;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
</style>
