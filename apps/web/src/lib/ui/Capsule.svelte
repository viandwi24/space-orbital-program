<script lang="ts">
	/** A glass pill 44 high (refs): toolbars, time control, world capsule, screen titles. */
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLDivElement> & { children: Snippet };
	let { children, ...rest }: Props = $props();
</script>

<div class="capsule" {...rest}>{@render children()}</div>

<style>
	.capsule {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		height: var(--capsule);
		padding: 0.25rem;
		box-sizing: border-box;
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
</style>
