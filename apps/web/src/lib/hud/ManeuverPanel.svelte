<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Panel from '../ui/Panel.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { settings } from '../settings/settings.svelte';
	import type { ActionId } from '../keybindings';
	import { formatDistance, formatDuration, formatSpeed } from '../format';
	import type { ManeuverHud } from '../hud-controller';
	import type { PlannedOrbit } from '../maneuver-controller';
	import { TIME_STEPS, parseDv, type NodeAxis, type NodePlan } from '../maneuver';

	let {
		maneuver,
		map,
		warpUsable,
		selected = null,
		planned = null,
		onwarp,
		onpoint,
		onremove,
		onselect,
		onedit,
		onshift,
		onalarm
	}: {
		maneuver: ManeuverHud | null;
		map: boolean;
		/** The vessel is on rails, so time warp can start. */
		warpUsable: boolean;
		/** The node the map has selected (plan 224); the first node when none is. */
		selected?: number | null;
		/** The orbit after the shown node, from the map's prediction. */
		planned?: PlannedOrbit | null;
		onwarp: (id: number) => void;
		onpoint: () => void;
		onremove: (id: number) => void;
		onselect?: (id: number) => void;
		onedit?: (id: number, change: Partial<NodePlan>) => void;
		onshift?: (id: number, by: { seconds?: number; orbits?: number }) => void;
		onalarm?: (id: number) => void;
	} = $props();
	const key = (id: ActionId): string => settings.keymap.label(id);

	const index = $derived.by(() => {
		if (!maneuver) return 0;
		const at = maneuver.nodes.findIndex((n) => n.id === selected);
		return at < 0 ? 0 : at;
	});
	const node = $derived(maneuver?.nodes[index] ?? null);
	const first = $derived(index === 0);

	const status = $derived.by(() => {
		if (!node) return '';
		if (node.state === 'overdue') return 'Overdue: the burn window has passed';
		if (node.state === 'burn') return 'Burn now';
		if (node.toBurn === null) return `Node in ${formatDuration(node.toNode)}`;
		return `Burn in ${formatDuration(node.toBurn)}`;
	});

	const AXES: Array<{ axis: NodeAxis; label: string }> = [
		{ axis: 'prograde', label: 'Prograde' },
		{ axis: 'normal', label: 'Normal' },
		{ axis: 'radial', label: 'Radial' }
	];
	/** Typed text per axis while a field has focus; the snapshot's value otherwise. */
	let typing = $state<Partial<Record<NodeAxis, string>>>({});
	const shown = (axis: NodeAxis): string =>
		typing[axis] ?? (node ? (Math.round(node[axis] * 10) / 10).toFixed(1) : '');

	function commitAxis(axis: NodeAxis): void {
		const text = typing[axis];
		delete typing[axis];
		typing = { ...typing };
		if (text === undefined || !node) return;
		const value = parseDv(text);
		if (value === null || Math.abs(value - node[axis]) < 1e-9) return;
		onedit?.(node.id, { [axis]: value });
	}

	const stepLabel = (s: number): string => (s >= 60 ? `${s / 60} min` : `${s} s`);
</script>

{#if maneuver && node}
	<Panel
		title={maneuver.count > 1 ? `Maneuver (${index + 1} of ${maneuver.count})` : 'Maneuver'}
	>
		<div class="head">
			<div
				class="status"
				class:burn={node.state === 'burn'}
				class:overdue={node.state === 'overdue'}
				data-testid="maneuver-status"
				role="status"
			>
				{status}
			</div>
			{#if maneuver.count > 1}
				<div class="pick">
					<Button
						variant="ghost"
						disabled={index === 0}
						onclick={() => onselect?.(maneuver.nodes[index - 1]!.id)}
						title="Previous node"
						aria-label="Previous node">◀</Button
					>
					<Button
						variant="ghost"
						disabled={index === maneuver.count - 1}
						onclick={() => onselect?.(maneuver.nodes[index + 1]!.id)}
						title="Next node"
						aria-label="Next node"
						data-testid="maneuver-next">▶</Button
					>
				</div>
			{/if}
		</div>
		<dl>
			<dt>Delta-v</dt>
			<dd class="num" data-testid="maneuver-dv">{formatSpeed(node.dv)}</dd>
			<dt>Burn time</dt>
			<dd class="num" data-testid="maneuver-burn">
				{#if node.burnTime === null}
					no engine lit
				{:else}
					{formatDuration(node.burnTime)}{node.short ? ' (not enough fuel)' : ''}
				{/if}
			</dd>
			<dt>Node in</dt>
			<dd class="num">{formatDuration(node.toNode)}</dd>
			{#if planned}
				<dt>Planned Ap</dt>
				<dd class="num" data-testid="maneuver-planned-ap">
					{planned.apoapsis === undefined ? 'escape' : formatDistance(planned.apoapsis)}
				</dd>
				<dt>Planned Pe</dt>
				<dd class="num" data-testid="maneuver-planned-pe">{formatDistance(planned.periapsis)}</dd>
			{/if}
		</dl>
		{#if onedit}
			<div class="fields">
				{#each AXES as a (a.axis)}
					<label>
						<span>{a.label}</span>
						<input
							class="num"
							type="text"
							inputmode="decimal"
							data-testid={`node-${a.axis}`}
							value={shown(a.axis)}
							oninput={(e) => (typing = { ...typing, [a.axis]: e.currentTarget.value })}
							onkeydown={(e) => {
								e.stopPropagation();
								if (e.key === 'Enter') commitAxis(a.axis);
								if (e.key === 'Escape') {
									delete typing[a.axis];
									typing = { ...typing };
								}
							}}
							onblur={() => commitAxis(a.axis)}
						/>
						<small>m/s</small>
					</label>
				{/each}
			</div>
			<div class="times" aria-label="Move the node in time">
				{#each [...TIME_STEPS].reverse() as s (s)}
					<button type="button" onclick={() => onshift?.(node.id, { seconds: -s })}
						>−{stepLabel(s)}</button
					>
				{/each}
				{#each TIME_STEPS as s (s)}
					<button type="button" onclick={() => onshift?.(node.id, { seconds: s })}
						>+{stepLabel(s)}</button
					>
				{/each}
				<button
					type="button"
					onclick={() => onshift?.(node.id, { orbits: -1 })}
					title="One orbit earlier">−orbit</button
				>
				<button
					type="button"
					data-testid="node-plus-orbit"
					onclick={() => onshift?.(node.id, { orbits: 1 })}
					title="One orbit later">+orbit</button
				>
			</div>
		{/if}
		<div class="row">
			<Button
				onclick={() => onwarp(node.id)}
				disabled={!warpUsable}
				title="Time warp to 30 s before the burn starts"
			>
				Warp to burn
			</Button>
			{#if first}
				<Button
					variant={maneuver.pointing ? 'primary' : 'default'}
					onclick={onpoint}
					title="Point the nose at the burn (8)"
					aria-pressed={maneuver.pointing}
				>
					Point SAS
				</Button>
			{/if}
			{#if onalarm}
				<Button variant="ghost" onclick={() => onalarm(node.id)} title="Alarm 30 s before the node"
					>Alarm</Button
				>
			{/if}
			<Button
				variant="ghost"
				onclick={() => onremove(node.id)}
				title="Remove the node (Delete in map view)">Remove</Button
			>
		</div>
		<p class="note">Impulsive plan: the burn starts half its length before the node.</p>
	</Panel>
{:else if map}
	<Panel title="Maneuver">
		<p class="note">
			Click the orbit to plan a burn, then drag its handles or use the keys <span class="keys"
				><Kbd>{key('nodePrograde')}</Kbd><Kbd>{key('nodeRetrograde')}</Kbd>
				<Kbd>{key('nodeNormal')}</Kbd><Kbd>{key('nodeAntinormal')}</Kbd>
				<Kbd>{key('nodeRadialOut')}</Kbd><Kbd>{key('nodeRadialIn')}</Kbd></span
			>.
		</p>
	</Panel>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: var(--s-2);
	}
	.pick {
		display: flex;
		gap: 0.125rem;
	}
	.status {
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
		gap: 0.1875rem var(--s-4);
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
	.fields {
		display: grid;
		gap: 0.25rem;
		margin-bottom: var(--s-2);
		font-size: var(--t-sm);
	}
	.fields label {
		display: grid;
		grid-template-columns: 5.5em 1fr auto;
		align-items: center;
		gap: var(--s-2);
	}
	.fields span,
	.fields small {
		color: var(--text-dim);
	}
	.fields input {
		min-width: 0;
		padding: 0.125rem 0.375rem;
		font: inherit;
		text-align: right;
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	.times {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-bottom: var(--s-2);
	}
	.times button {
		padding: 0.125rem 0.375rem;
		font: inherit;
		font-size: var(--t-xs);
		font-variant-numeric: tabular-nums;
		color: var(--text-body);
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
		cursor: pointer;
	}
	.times button:hover {
		border-color: var(--border-strong);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-2);
	}
	.note {
		margin: var(--s-2) 0 0;
		max-width: 38ch;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.keys {
		display: inline-flex;
		flex-wrap: nowrap;
		gap: 0.125rem;
		white-space: nowrap;
		vertical-align: middle;
	}
</style>
