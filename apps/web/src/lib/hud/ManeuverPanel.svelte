<script lang="ts" module>
	/** The editor's fold and the time step, kept for the session (ADR 0267 point 4). */
	export const maneuverCard = $state({ open: false, step: '60' });
</script>

<script lang="ts">
	/**
	 * The maneuver card (plans 045, 224 and 292, ADR 0267): a summary of the shown node with icon
	 * actions, and the full editor (axis fields with steppers, a time stepper, the note) folded behind
	 * the pencil. It stands on staging in the right column, never over the middle of the view.
	 */
	import Panel from '../ui/Panel.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';
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
		if (node.state === 'overdue') return 'Overdue';
		if (node.state === 'burn') return 'Burn now';
		if (node.toBurn === null) return `Node in ${formatDuration(node.toNode)}`;
		return `Burn in ${formatDuration(node.toBurn)}`;
	});

	const AXES: Array<{ axis: NodeAxis; short: string; label: string }> = [
		{ axis: 'prograde', short: 'Pro', label: 'Prograde' },
		{ axis: 'normal', short: 'Nrm', label: 'Normal' },
		{ axis: 'radial', short: 'Rad', label: 'Radial' }
	];
	/** Typed text per axis while a field has focus; the snapshot's value otherwise. */
	let typing = $state<Partial<Record<NodeAxis, string>>>({});
	const shown = (axis: NodeAxis): string =>
		typing[axis] ?? (node ? (Math.round(node[axis] * 10) / 10).toFixed(1) : '');

	function forget(axis: NodeAxis): void {
		delete typing[axis];
		typing = { ...typing };
	}

	function commitAxis(axis: NodeAxis): void {
		const text = typing[axis];
		forget(axis);
		if (text === undefined || !node) return;
		const value = parseDv(text);
		if (value === null || Math.abs(value - node[axis]) < 1e-9) return;
		onedit?.(node.id, { [axis]: value });
	}

	/** A stepper press: 1 m/s, 10 with Shift (ADR 0267 point 4). */
	function nudge(axis: NodeAxis, sign: 1 | -1, big: boolean): void {
		if (!node) return;
		forget(axis);
		const value = Math.round((node[axis] + sign * (big ? 10 : 1)) * 10) / 10;
		onedit?.(node.id, { [axis]: value });
	}

	const STEPS: ReadonlyArray<{ value: string; label: string }> = [
		...TIME_STEPS.map((s) => ({ value: String(s), label: s >= 60 ? `${s / 60} min` : `${s} s` })),
		{ value: 'orbit', label: '1 orbit' }
	];
	function shift(sign: 1 | -1): void {
		if (!node) return;
		if (maneuverCard.step === 'orbit') onshift?.(node.id, { orbits: sign });
		else onshift?.(node.id, { seconds: sign * Number(maneuverCard.step) });
	}
	const stepName = $derived(STEPS.find((s) => s.value === maneuverCard.step)?.label ?? '');
</script>

{#if maneuver && node}
	<div class="mnv-card" data-testid="maneuver-card">
		<Panel
			aria-label={maneuver.count > 1
				? `Maneuver node ${index + 1} of ${maneuver.count}`
				: 'Maneuver node'}
		>
			<div class="head">
				<div
					class="status num"
					class:burn={node.state === 'burn'}
					class:overdue={node.state === 'overdue'}
					data-testid="maneuver-status"
					data-tip={node.state === 'overdue' ? 'The burn window has passed' : undefined}
					role="status"
				>
					{status}
				</div>
				<div class="pick">
					{#if maneuver.count > 1}
						<button
							type="button"
							class="mini back"
							disabled={index === 0}
							onclick={() => onselect?.(maneuver.nodes[index - 1]!.id)}
							data-tip="Previous node"
							aria-label="Previous node"><Icon name="chevron" size={14} /></button
						>
						<span class="num" data-testid="maneuver-index">Node {index + 1}/{maneuver.count}</span>
						<button
							type="button"
							class="mini"
							disabled={index === maneuver.count - 1}
							onclick={() => onselect?.(maneuver.nodes[index + 1]!.id)}
							data-tip="Next node"
							aria-label="Next node"
							data-testid="maneuver-next"><Icon name="chevron" size={14} /></button
						>
					{:else}
						<span data-testid="maneuver-index">Node</span>
					{/if}
				</div>
			</div>
			<dl class="stats">
				<div>
					<dt data-tip="Delta-v">Δv</dt>
					<dd class="num" data-testid="maneuver-dv">{formatSpeed(node.dv)}</dd>
				</div>
				<div>
					<dt data-tip="Burn time">Burn</dt>
					<dd class="num" class:warn={node.short} data-testid="maneuver-burn">
						{node.burnTime === null ? '—' : formatDuration(node.burnTime)}
					</dd>
				</div>
				<div>
					<dt data-tip="Time to the node">Node</dt>
					<dd class="num">{formatDuration(node.toNode)}</dd>
				</div>
				{#if planned}
					<div class="inline">
						<dt data-tip="Planned apoapsis">Ap</dt>
						<dd class="num" data-testid="maneuver-planned-ap">
							{planned.apoapsis === undefined ? 'escape' : formatDistance(planned.apoapsis)}
						</dd>
					</div>
					<div class="inline">
						<dt data-tip="Planned periapsis">Pe</dt>
						<dd class="num" data-testid="maneuver-planned-pe">
							{formatDistance(planned.periapsis)}
						</dd>
					</div>
				{/if}
			</dl>
			{#if node.burnTime === null}
				<p class="flag">No engine lit: no burn time.</p>
			{:else if node.short}
				<p class="flag warn">Not enough fuel for this burn.</p>
			{/if}
			<div class="actions">
				<IconButton
					icon="faster"
					label="Warp to the burn (30 s before it starts)"
					disabled={!warpUsable}
					onclick={() => onwarp(node.id)}
					data-testid="maneuver-warp"
				/>
				{#if first}
					<IconButton
						icon="navball"
						label="Point SAS at the burn"
						hint={key('sasManeuver')}
						pressed={maneuver.pointing}
						onclick={onpoint}
						data-testid="maneuver-point"
					/>
				{/if}
				{#if onalarm}
					<IconButton
						icon="bell"
						label="Alarm 30 s before the node"
						onclick={() => onalarm(node.id)}
						data-testid="maneuver-alarm"
					/>
				{/if}
				<IconButton
					icon="trash"
					label="Remove the node"
					hint={map ? 'Delete' : undefined}
					onclick={() => onremove(node.id)}
					data-testid="maneuver-remove"
				/>
				{#if onedit}
					<span class="spring"></span>
					<IconButton
						icon="pencil"
						label={maneuverCard.open ? 'Hide the burn editor' : 'Edit the burn'}
						pressed={maneuverCard.open}
						aria-expanded={maneuverCard.open}
						aria-controls="maneuver-editor"
						onclick={() => (maneuverCard.open = !maneuverCard.open)}
						data-testid="maneuver-expand"
					/>
				{/if}
			</div>
			{#if onedit && maneuverCard.open}
				<div class="editor" id="maneuver-editor">
					{#each AXES as a (a.axis)}
						<div class="axis">
							<span class="dot {a.axis}" aria-hidden="true"></span>
							<span class="name" data-tip={a.label}>{a.short}</span>
							<button
								type="button"
								class="mini"
								aria-label="{a.label} −1 m/s"
								data-tip="−1 m/s (Shift: −10)"
								data-testid="node-{a.axis}-minus"
								onclick={(e) => nudge(a.axis, -1, e.shiftKey)}>−</button
							>
							<input
								class="num"
								type="text"
								inputmode="decimal"
								aria-label="{a.label} delta-v, m/s"
								data-testid={`node-${a.axis}`}
								value={shown(a.axis)}
								oninput={(e) => (typing = { ...typing, [a.axis]: e.currentTarget.value })}
								onkeydown={(e) => {
									e.stopPropagation();
									if (e.key === 'Enter') commitAxis(a.axis);
									if (e.key === 'Escape') forget(a.axis);
									if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
										e.preventDefault();
										nudge(a.axis, e.key === 'ArrowUp' ? 1 : -1, e.shiftKey);
									}
								}}
								onblur={() => commitAxis(a.axis)}
							/>
							<button
								type="button"
								class="mini"
								aria-label="{a.label} +1 m/s"
								data-tip="+1 m/s (Shift: +10)"
								data-testid="node-{a.axis}-plus"
								onclick={(e) => nudge(a.axis, 1, e.shiftKey)}>+</button
							>
						</div>
					{/each}
					<div class="axis time">
						<span class="name" data-tip="Move the node in time">Time</span>
						<button
							type="button"
							class="mini"
							aria-label="Earlier by {stepName}"
							data-tip="Earlier by {stepName}"
							data-testid="node-time-minus"
							onclick={() => shift(-1)}>−</button
						>
						<select
							aria-label="Time step"
							data-testid="node-time-step"
							bind:value={maneuverCard.step}
							onkeydown={(e) => e.stopPropagation()}
						>
							{#each STEPS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
						</select>
						<button
							type="button"
							class="mini"
							aria-label="Later by {stepName}"
							data-tip="Later by {stepName}"
							data-testid="node-time-plus"
							onclick={() => shift(1)}>+</button
						>
					</div>
					<p class="note">Impulsive plan: the burn starts half its length before the node.</p>
				</div>
			{/if}
		</Panel>
	</div>
{:else if map}
	<div class="mnv-card">
		<Panel aria-label="Maneuver node">
			<p class="hint">
				Click the orbit to plan a burn, then drag its handles or press <span class="keys"
					><Kbd>{key('nodePrograde')}</Kbd><Kbd>{key('nodeRetrograde')}</Kbd>
					<Kbd>{key('nodeNormal')}</Kbd><Kbd>{key('nodeAntinormal')}</Kbd>
					<Kbd>{key('nodeRadialOut')}</Kbd><Kbd>{key('nodeRadialIn')}</Kbd></span
				>.
			</p>
		</Panel>
	</div>
{/if}

<style>
	/* on staging in the right column, its width (ADR 0267 point 2); it scrolls when the column is short */
	.mnv-card {
		/* it gives way before staging (three times as fast), so staging keeps its GO row on a short
		   window; it scrolls, and never shows less than its status line */
		flex: 0 3 auto;
		min-height: 2.75rem;
		overflow-y: auto;
		border-radius: var(--radius-panel);
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-2);
		margin-bottom: 0.25rem;
	}
	.status {
		font-size: var(--t-md);
		font-weight: 600;
		white-space: nowrap;
	}
	.status.burn {
		color: var(--c-positive);
	}
	.status.overdue {
		color: var(--c-warning);
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		font-size: var(--t-xs);
		color: var(--text-dim);
		white-space: nowrap;
	}
	.back :global(svg) {
		transform: scaleX(-1);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.25rem var(--s-2);
		margin: 0;
	}
	.stats div {
		grid-column: span 2;
		min-width: 0;
	}
	/* the planned orbit on one line, labels inline, to keep the card short */
	.stats .inline {
		display: flex;
		align-items: baseline;
		gap: 0.375rem;
	}
	.stats .inline {
		grid-column: span 3;
	}
	dt {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		font-size: var(--t-sm);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.warn {
		color: var(--c-warning);
	}
	.flag {
		margin: 0.25rem 0 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.flag.warn {
		color: var(--c-warning);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 0.125rem;
		margin-top: var(--s-2);
	}
	.spring {
		flex: 1;
	}
	.editor {
		display: grid;
		gap: 0.25rem;
		margin-top: var(--s-2);
		padding-top: var(--s-2);
		border-top: 1px solid var(--border-subtle);
		font-size: var(--t-sm);
	}
	.axis {
		display: grid;
		grid-template-columns: 0.5rem 2.25rem auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.25rem;
	}
	.axis.time {
		grid-template-columns: 2.75rem auto minmax(0, 1fr) auto;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
	}
	.dot.prograde {
		background: var(--mnv-prograde);
	}
	.dot.normal {
		background: var(--mnv-normal);
	}
	.dot.radial {
		background: var(--mnv-radial);
	}
	.name {
		color: var(--text-dim);
	}
	.axis input,
	.axis select {
		min-width: 0;
		height: 1.625rem;
		padding: 0 0.375rem;
		font: inherit;
		color: var(--text-body);
		background: var(--surface-inset);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
	}
	.axis input {
		text-align: right;
	}
	.mini {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.625rem;
		height: 1.625rem;
		padding: 0;
		font: inherit;
		color: var(--text-body);
		background: transparent;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-row);
		cursor: pointer;
	}
	.pick .mini {
		min-width: 1.375rem;
		height: 1.375rem;
		border-color: transparent;
	}
	.mini:hover:not(:disabled) {
		border-color: var(--border-strong);
	}
	.mini:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.mini:focus-visible,
	.axis input:focus-visible,
	.axis select:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	/* drawer mode's 44 px floor (ADR 0205 point 6) is for touch; the card keeps it only there */
	@media (pointer: fine) {
		:global(.ui.drawer) .mnv-card.mnv-card :global(button) {
			min-height: 0;
		}
	}
	@media (pointer: coarse) {
		.mini,
		.axis input,
		.axis select {
			min-width: 44px;
			height: 44px;
		}
	}
	.note,
	.hint {
		margin: 0.125rem 0 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.hint {
		margin: 0;
	}
	.keys {
		display: inline-flex;
		flex-wrap: nowrap;
		gap: 0.125rem;
		white-space: nowrap;
		vertical-align: middle;
	}
</style>
