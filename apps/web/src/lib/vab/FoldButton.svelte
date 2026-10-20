<script lang="ts">
	/** The chevron and title of a foldable panel section (plan 255): one button, the section's state remembered. */
	import type { Snippet } from 'svelte';
	import Icon from '../ui/Icon.svelte';
	import { panelFolds } from './panel-folds.svelte';
	import type { FoldId } from './panel-model';

	let { id, children }: { id: FoldId; children: Snippet } = $props();
	const open = $derived(panelFolds.isOpen(id));
</script>

<button
	type="button"
	class="fold"
	aria-expanded={open}
	data-testid="fold-{id}"
	onclick={() => panelFolds.set(id, !open)}
>
	<span class="chev" class:open aria-hidden="true"><Icon name="chevron" size={14} /></span>
	{@render children()}
</button>

<style>
	.fold {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
	.fold:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	.chev {
		display: grid;
		color: var(--text-muted);
		transition: transform 0.15s;
	}
	.chev.open {
		transform: rotate(90deg);
	}
</style>
