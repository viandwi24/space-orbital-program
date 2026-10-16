<script lang="ts">
	import type { VesselDesign } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import { nudgeStage } from '../editor/staging';
	import type { StageEditRow, Environment } from '../editor/stats';
	import { formatDeltaV, formatDuration } from '../format';
	import { speedUnit } from '../units.svelte';

	let {
		design,
		rows,
		unstaged,
		total,
		environment,
		autoStage,
		selected,
		titleOf,
		iconOf,
		thumbOf = () => undefined,
		onenv,
		onmove,
		onselect,
		onremove,
		onauto
	}: {
		design: Pick<VesselDesign, 'parts' | 'stages'>;
		rows: readonly StageEditRow[];
		/** Parts that can be staged but are in no stage. */
		unstaged: readonly number[];
		total: number;
		environment: Environment;
		autoStage: boolean;
		selected: number | null;
		titleOf: (index: number) => string;
		iconOf: (index: number) => string;
		/** Rendered thumbnail of the part (data URL), when there is one. */
		thumbOf?: (index: number) => string | undefined;
		onenv: (e: Environment) => void;
		/** Stage index to move to, `stages.length` for a new stage, `null` for none. */
		onmove: (index: number, stage: number | null) => void;
		onselect: (index: number) => void;
		onremove: (stage: number) => void;
		onauto: () => void;
	} = $props();

	let over = $state<number | 'new' | 'tray' | null>(null);

	// The vessel stands upright on screen: the stage that fires first sits at the bottom.
	const stageCount = $derived(design.stages.length);
	const order = $derived(Array.from({ length: stageCount }, (_, k) => stageCount - 1 - k));
	const rowOf = (k: number): StageEditRow | undefined => rows.find((r) => r.stage === k);
	const dv = formatDeltaV;

	function drop(e: DragEvent, target: number | 'new' | 'tray'): void {
		e.preventDefault();
		over = null;
		const index = Number(e.dataTransfer?.getData('text/plain'));
		if (!Number.isInteger(index)) return;
		onmove(index, target === 'tray' ? null : target === 'new' ? stageCount : target);
	}
	function allow(e: DragEvent, target: number | 'new' | 'tray'): void {
		e.preventDefault();
		over = target;
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
	}
	function keyMove(e: KeyboardEvent, index: number, current: number | null): void {
		if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
		e.preventDefault();
		const next = nudgeStage(current, stageCount, e.key === 'ArrowUp' ? 1 : -1);
		if (next !== current) {
			onmove(index, next);
			// The chip is re-created in its new row; keep the keyboard on it.
			queueMicrotask(() => document.getElementById(`chip-${index}`)?.focus());
		}
	}
</script>

{#snippet chip(index: number, current: number | null)}
	<button
		type="button"
		id="chip-{index}"
		class="chip"
		class:sel={selected === index}
		draggable="true"
		title="{titleOf(index)}{current === null
			? ', no stage'
			: `, stage ${current + 1}`}. Drag to another stage, or Alt+Up / Alt+Down."
		aria-label="{titleOf(index)}, {current === null ? 'no stage' : `stage ${current + 1}`}"
		ondragstart={(e) => {
			e.dataTransfer?.setData('text/plain', String(index));
			if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
		}}
		ondragend={() => (over = null)}
		onclick={() => onselect(index)}
		onkeydown={(e) => keyMove(e, index, current)}
	>
		{#if thumbOf(index)}
			<img src={thumbOf(index)} alt="" width="26" height="26" draggable="false" />
		{:else}
			<Icon name={iconOf(index)} size={18} />
		{/if}
	</button>
{/snippet}

<section class="stages" aria-label="Stages">
	<header>
		<h2>Stages</h2>
		<div
			class="total num"
			title="Total delta-v, {environment === 'vacuum' ? 'in vacuum' : 'at sea level'}"
		>
			{dv(total)}<span class="u"> {speedUnit()}</span>
		</div>
	</header>

	<div class="env" role="group" aria-label="Delta-v and thrust are shown for">
		<button
			type="button"
			aria-pressed={environment === 'sea-level'}
			onclick={() => onenv('sea-level')}
		>
			Sea level
		</button>
		<button type="button" aria-pressed={environment === 'vacuum'} onclick={() => onenv('vacuum')}>
			Vacuum
		</button>
	</div>

	{#if design.parts.length === 0}
		<p class="empty">Stages appear here once you attach an engine.</p>
	{:else}
		<ol class="list">
			<li
				class="row new"
				class:over={over === 'new'}
				ondragover={(e) => allow(e, 'new')}
				ondragleave={() => (over = null)}
				ondrop={(e) => drop(e, 'new')}
			>
				<span class="badge"><Icon name="plus" size={14} /></span>
				<span class="drop">Drop here for a new last stage</span>
			</li>
			{#each order as k (k)}
				{@const r = rowOf(k)}
				<li
					class="row"
					class:over={over === k}
					class:empty={(design.stages[k] ?? []).length === 0}
					ondragover={(e) => allow(e, k)}
					ondragleave={() => (over = null)}
					ondrop={(e) => drop(e, k)}
				>
					<span class="badge num" title="Pressing Space number {k + 1} fires this stage"
						>{k + 1}</span
					>
					<div class="chips">
						{#each design.stages[k] ?? [] as index (index)}
							{@render chip(index, k)}
						{:else}
							<span class="drop">Empty</span>
						{/each}
					</div>
					<div class="nums num">
						{#if r && r.engines > 0}
							<span class="dv">{dv(r.dv)}<span class="u"> {speedUnit()}</span></span>
							<span class="meta" title="Thrust to weight when the stage ignites"
								>TWR {r.twr.toFixed(2)}</span
							>
							<span class="meta">{formatDuration(r.burnTime)}</span>
						{:else if (design.stages[k] ?? []).length === 0}
							<button
								type="button"
								class="x"
								aria-label="Remove empty stage {k + 1}"
								onclick={() => onremove(k)}
							>
								<Icon name="close" size={14} />
							</button>
						{:else}
							<span class="meta">No burn</span>
						{/if}
					</div>
				</li>
			{/each}
			<li
				class="row tray"
				class:over={over === 'tray'}
				ondragover={(e) => allow(e, 'tray')}
				ondragleave={() => (over = null)}
				ondrop={(e) => drop(e, 'tray')}
			>
				<span class="badge" title="Not staged"><Icon name="stage" size={14} /></span>
				<div class="chips">
					{#each unstaged as index (index)}
						{@render chip(index, null)}
					{:else}
						<span class="drop">Nothing waiting</span>
					{/each}
				</div>
			</li>
		</ol>
		<footer>
			<button
				type="button"
				class="auto"
				aria-pressed={autoStage}
				disabled={autoStage}
				onclick={onauto}
			>
				{autoStage ? 'Staging follows the design' : 'Auto-stage'}
			</button>
		</footer>
	{/if}
</section>

<style>
	.stages {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		min-height: 0;
		padding: var(--s-3);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
	}
	h2 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
	}
	.total {
		font-size: var(--t-lg);
		font-weight: 500;
		color: var(--c-accent);
	}
	.u {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.env {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2px;
		padding: 2px;
		background: var(--field);
		border-radius: var(--r-control);
	}
	.env button {
		height: 28px;
		font-size: var(--t-sm);
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-radius: var(--r-control);
	}
	.env button[aria-pressed='true'] {
		color: var(--text);
		background: color-mix(in srgb, var(--c-accent) 18%, transparent);
	}
	.empty {
		margin: var(--s-2) 0;
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		overflow-y: auto;
		min-height: 0;
		scrollbar-width: thin;
	}
	.row {
		display: grid;
		grid-template-columns: 24px 1fr auto;
		align-items: center;
		gap: var(--s-2);
		min-height: 46px;
		padding: 4px var(--s-2);
		background: var(--panel-raised);
		border: 1px dashed transparent;
		border-radius: var(--r-control);
	}
	.row.over {
		border-color: var(--c-accent);
		background: color-mix(in srgb, var(--c-accent) 12%, var(--panel-raised));
	}
	.row.new,
	.row.tray {
		min-height: 36px;
		background: transparent;
		border-color: var(--line);
	}
	.row.empty {
		border-color: var(--line);
		background: transparent;
	}
	.badge {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		font-size: var(--t-xs);
		font-weight: 500;
		color: var(--c-ink);
		background: var(--text-dim);
		border-radius: var(--r-control);
	}
	.new .badge,
	.tray .badge {
		color: var(--text-dim);
		background: transparent;
		border: 1px solid var(--line-strong);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 0;
	}
	.drop {
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
	.chip {
		display: grid;
		place-items: center;
		width: 32px;
		height: 32px;
		color: var(--text);
		background: var(--field);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		cursor: grab;
	}
	.chip:hover {
		border-color: var(--c-accent);
	}
	.chip.sel {
		border-color: var(--c-accent);
		background: color-mix(in srgb, var(--c-accent) 20%, var(--field));
		color: var(--c-accent);
	}
	.nums {
		display: grid;
		justify-items: end;
		line-height: 1.15;
	}
	.dv {
		font-size: var(--t-md);
		font-weight: 500;
	}
	.meta {
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	.x {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		color: var(--text-dim);
		background: transparent;
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	.x:hover {
		color: var(--c-danger);
		border-color: var(--c-danger);
	}
	footer {
		display: flex;
		justify-content: flex-end;
	}
	.auto {
		height: 28px;
		padding: 0 var(--s-3);
		font-size: var(--t-xs);
		color: var(--text-dim);
		background: transparent;
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	.auto:not(:disabled) {
		color: var(--text);
		border-color: var(--line-strong);
	}
	.auto:not(:disabled):hover {
		border-color: var(--c-accent);
	}
	.auto:disabled {
		cursor: default;
		border-color: transparent;
	}
</style>
