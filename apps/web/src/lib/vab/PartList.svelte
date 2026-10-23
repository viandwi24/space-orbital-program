<script lang="ts">
	/**
	 * The vessel's parts as a list (plan 316, owner 2026-10-21): every part under the one it hangs
	 * on. A click selects it, hovering lights it in the view (and shows inside its fairing or bay).
	 */
	import type { VabController } from './controller.svelte';
	import { panelFolds } from './panel-folds.svelte';

	let { vab }: { vab: VabController } = $props();
	const rows = $derived(vab.partList);
</script>

{#if rows.length > 0}
	<details
		class="partlist"
		aria-label="Parts on the vessel"
		data-testid="part-list"
		open={panelFolds.isOpen('parts')}
		ontoggle={(e) => panelFolds.set('parts', e.currentTarget.open)}
	>
		<summary>
			<h3>Parts · {rows.length}</h3>
			<span class="sum">Click to select, hover to find</span>
		</summary>
		<ul onpointerleave={() => vab.hoverFromList(null)}>
			{#each rows as r (r.index)}
				<li>
					<button
						type="button"
						class:sel={vab.selected === r.index}
						class:inside={r.inside !== undefined}
						style:padding-left="{6 + Math.min(r.depth, 12) * 10}px"
						onclick={() => vab.selectFromList(r.index)}
						onpointerenter={() => vab.hoverFromList(r.index)}
						onfocus={() => vab.hoverFromList(r.index)}
					>
						<span class="t">{r.title}</span>
						{#if r.holds !== undefined}<span class="tag"
								>{r.holds > 0 ? `holds ${r.holds}` : 'empty'}</span
							>{/if}
						{#if vab.openParts.has(r.index)}<span class="tag">open</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	</details>
{/if}

<style>
	.partlist {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		backdrop-filter: blur(28px) saturate(160%);
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 6px;
		min-height: 22px;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	h3 {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.sum {
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		max-height: 18rem;
		overflow: auto;
	}
	button {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 3px 6px;
		border: 0;
		border-radius: var(--radius-tile);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		text-align: left;
		cursor: pointer;
	}
	button:hover,
	button:focus-visible {
		background: var(--surface-chip);
	}
	button.sel {
		background: var(--surface-chip);
		outline: 1px solid var(--border-strong, rgb(255 255 255 / 0.3));
	}
	button.inside .t {
		color: var(--text-secondary);
	}
	.t {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tag {
		flex: none;
		padding: 0 6px;
		border-radius: 999px;
		background: rgb(255 255 255 / 0.08);
		font-size: var(--t-label);
		color: var(--text-secondary);
	}
</style>
