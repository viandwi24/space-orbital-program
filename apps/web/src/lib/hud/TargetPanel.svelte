<script lang="ts">
	import Panel from '../ui/Panel.svelte';
	import BodyCard from './BodyCard.svelte';
	import type { Dossier } from '@orbital/core';
	import { settings } from '../settings/settings.svelte';
	import { formatDistance, formatDuration, formatSpeed } from '../format';
	import type { TargetChoice, TargetHud } from '../target-model';
	import type { AidId } from '../rendezvous-aids';
	import type { RendezvousInfo } from '../target-view';

	let {
		target,
		choices,
		controllable = true,
		rendezvous = null,
		dossier = null,
		onselect,
		onplan
	}: {
		target: TargetHud | null;
		choices: readonly TargetChoice[];
		/** The vessel has a command part (the sim refuses `target-set` otherwise). */
		controllable?: boolean;
		/** Closest approach across spheres and the aids (plan 057). */
		rendezvous?: RendezvousInfo | null;
		/** The target body's dossier (plan 104); null for a vessel or without one. */
		dossier?: Dossier | null;
		/** Called with a choice key, or null for "no target". */
		onselect: (key: string | null) => void;
		/** Place the node of an aid (a `node-set` command). */
		onplan?: (id: AidId) => void;
	} = $props();

	/**
	 * The page's approach when it follows planned nodes, else the sim's (one sphere), else the page's,
	 * which also follows the path across spheres.
	 */
	const approach = $derived(
		rendezvous?.approach?.withNodes
			? rendezvous.approach
			: (target?.approach ?? rendezvous?.approach ?? null)
	);
	const planned = $derived(rendezvous?.approach?.withNodes === true);

	const closingText = $derived.by(() => {
		if (!target) return '';
		const speed = formatSpeed(Math.abs(target.closing));
		if (Math.abs(target.closing) < 0.05) return 'steady';
		return target.closing > 0 ? `${speed} closing` : `${speed} opening`;
	});
	const bodies = $derived(choices.filter((c) => c.kind === 'body'));
	const vessels = $derived(choices.filter((c) => c.kind === 'vessel'));
</script>

<Panel title="Target">
	<label class="pick">
		<span class="sr">Target</span>
		<select
			value={target?.key ?? ''}
			disabled={!controllable}
			title="Choose a target ({settings.keymap.label('targetNext')} steps to the next)"
			data-testid="target-select"
			onchange={(e) => onselect(e.currentTarget.value === '' ? null : e.currentTarget.value)}
		>
			<option value="">No target</option>
			<optgroup label="Bodies">
				{#each bodies as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
			</optgroup>
			{#if vessels.length > 0}
				<optgroup label="Vessels">
					{#each vessels as c (c.key)}<option value={c.key}>{c.label}</option>{/each}
				</optgroup>
			{/if}
		</select>
	</label>
	{#if target}
		<dl>
			<dt>Distance</dt>
			<dd class="num" data-testid="target-distance">{formatDistance(target.distance)}</dd>
			<dt>Relative speed</dt>
			<dd class="num" data-testid="target-speed">{formatSpeed(target.relativeSpeed)}</dd>
			<dt>Range rate</dt>
			<dd class="num" data-testid="target-closing">{closingText}</dd>
			<dt>Closest approach{planned ? ' (with nodes)' : ''}</dt>
			<dd class="num" data-testid="target-approach">
				{#if approach}
					{formatDistance(approach.distance)} in {formatDuration(approach.in)}
				{:else}
					none on this orbit
				{/if}
			</dd>
		</dl>
		{#if rendezvous && rendezvous.aids.length > 0}
			<details class="aids" open>
				<summary>Plan a node</summary>
				{#each rendezvous.aids as aid (aid.id)}
					<button
						type="button"
						class="aid"
						disabled={!aid.node || !controllable}
						title={aid.detail}
						data-testid="aid-{aid.id}"
						onclick={() => onplan?.(aid.id)}
					>
						{aid.label}
					</button>
					<small class="why">{aid.detail}</small>
				{/each}
			</details>
		{/if}
	{/if}
	{#if dossier}
		<BodyCard {dossier} />
	{/if}
</Panel>

<style>
	.pick {
		display: block;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	select {
		width: 100%;
		min-height: 28px;
		padding: 2px var(--s-2);
		font: inherit;
		font-size: var(--t-sm);
		color: var(--text);
		background: rgb(150 180 210 / 0.1);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	select:disabled {
		opacity: 0.5;
	}
	select:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	dl {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 3px var(--s-4);
		margin: var(--s-2) 0 0;
		font-size: var(--t-sm);
	}
	.aids {
		margin-top: var(--s-3);
		font-size: var(--t-sm);
	}
	summary {
		cursor: pointer;
		color: var(--text-dim);
		margin-bottom: var(--s-1);
	}
	.aid {
		display: block;
		width: 100%;
		min-height: 26px;
		margin-top: var(--s-1);
		padding: 2px var(--s-2);
		font: inherit;
		font-size: var(--t-sm);
		text-align: left;
		color: var(--text);
		background: rgb(150 180 210 / 0.1);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		cursor: pointer;
	}
	.aid:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.aid:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	.why {
		display: block;
		color: var(--text-dim);
		font-size: var(--t-xs);
		line-height: 1.3;
	}
	dt {
		color: var(--text-dim);
	}
	dd {
		margin: 0;
		text-align: right;
		white-space: nowrap;
	}
</style>
