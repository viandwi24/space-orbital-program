<script lang="ts">
	/** A small capital tag (`ORBIT`, `EVA`, `NEXT`): filled, or outlined for a weaker mark. */
	import type { Snippet } from 'svelte';

	let { outline = false, children }: { outline?: boolean; children: Snippet } = $props();
</script>

<span class="chip" class:outline>{@render children()}</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		height: 1.125rem;
		padding: 0 0.4375rem;
		box-sizing: border-box;
		border-radius: var(--radius-pill);
		background: var(--surface-chip);
		color: var(--text-primary);
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: var(--tracking-chip);
		text-transform: uppercase;
		white-space: nowrap;
	}
	.outline {
		background: transparent;
		border: 1px solid var(--border-strong);
	}
</style>
