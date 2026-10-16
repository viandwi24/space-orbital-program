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
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-height: 32px;
		padding: 0 var(--s-3);
		font-size: var(--t-sm);
		font-weight: 500;
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		transition:
			background var(--dur-fast) var(--ease),
			border-color var(--dur-fast) var(--ease);
	}
	.btn:hover:not(:disabled) {
		border-color: var(--c-accent);
		background: rgb(92 207 255 / 0.12);
	}
	.btn:active:not(:disabled) {
		background: rgb(92 207 255 / 0.22);
	}
	.btn:disabled {
		opacity: 0.45;
	}
	.primary {
		background: var(--c-accent);
		border-color: var(--c-accent);
		color: var(--c-ink);
		font-weight: 600;
	}
	.primary:hover:not(:disabled) {
		background: #8be0ff;
		border-color: #8be0ff;
	}
	.danger {
		border-color: var(--c-danger);
		color: var(--c-danger);
	}
	.danger:hover:not(:disabled) {
		background: rgb(255 114 114 / 0.14);
		border-color: var(--c-danger);
	}
	.ghost {
		background: transparent;
		border-color: transparent;
	}
</style>
