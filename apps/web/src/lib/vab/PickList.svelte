<script lang="ts">
	/**
	 * The parts under the pointer after a click again at the same spot (plan 378, ADR 0315 point 5),
	 * front to back, like the map's pick list (plan 250): the chosen one is marked, a click picks one.
	 */
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
</script>

{#if vab.pickList}
	{@const list = vab.pickList}
	<div
		class="picklist"
		role="listbox"
		aria-label="Parts under the pointer"
		data-testid="vab-pick-list"
		style="left:{list.x + 14}px;top:{list.y + 14}px"
	>
		<span class="head">Under the pointer, front to back</span>
		{#each list.parts as index, k (index)}
			<button
				type="button"
				role="option"
				aria-selected={k === list.i}
				class:on={k === list.i}
				onclick={() => vab.pickFromList(index)}
				onpointerenter={() => (vab.hoverIndex = index)}
				onpointerleave={() => (vab.hoverIndex = null)}
				><span class="n">{k + 1}</span>{vab.titleOfPart(index)}</button
			>
		{/each}
	</div>
{/if}

<style>
	.picklist {
		position: absolute;
		z-index: 6;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 12rem;
		max-width: 18rem;
		padding: var(--s-2);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-md, 10px);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		pointer-events: auto;
	}
	.head {
		padding: 0 var(--s-2) var(--s-1);
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	button {
		display: flex;
		gap: var(--s-2);
		align-items: center;
		padding: 0.3rem var(--s-2);
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-body);
		text-align: left;
		background: none;
		border: 0;
		border-radius: 6px;
		cursor: pointer;
	}
	button:hover,
	button.on {
		background: var(--surface-raised, rgba(255, 255, 255, 0.08));
	}
	button.on {
		color: var(--text-strong, #fff);
	}
	.n {
		min-width: 1.1rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
</style>
