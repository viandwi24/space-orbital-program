<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = HTMLButtonAttributes & {
		variant?: 'default' | 'primary' | 'danger' | 'ghost';
		children: Snippet;
	};
	let { variant = 'default', children, ...rest }: Props = $props();
</script>

<button type="button" class="btn {variant}" {...rest}>{@render children()}</button>

<style>
	/* Refs buttons: secondary by default, primary in the selected white, destructive as danger text. */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-height: var(--round-btn);
		padding: 0 0.875rem;
		font-size: var(--t-button);
		font-weight: 700;
		color: var(--text-secondary);
		background: var(--surface-button);
		border: 0;
		border-radius: var(--radius-row);
		transition: background var(--dur-fast) var(--ease);
	}
	@media (pointer: coarse) {
		.btn {
			min-height: var(--touch-min);
		}
	}
	.btn:hover:not(:disabled) {
		background: var(--surface-track);
	}
	.btn:disabled {
		opacity: 0.45;
	}
	.primary {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.primary:hover:not(:disabled) {
		background: var(--text-primary);
	}
	.danger {
		color: var(--danger);
	}
	.ghost {
		background: transparent;
	}
	.ghost:hover:not(:disabled) {
		background: var(--surface-hover);
	}
</style>
