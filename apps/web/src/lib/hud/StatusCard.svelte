<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '../ui/Icon.svelte';

	let {
		tone = 'accent',
		title,
		busy = false,
		children,
		actions
	}: {
		tone?: 'accent' | 'warning' | 'danger';
		title: string;
		busy?: boolean;
		children?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="card {tone}" role={tone === 'danger' ? 'alert' : 'status'}>
	<div class="head">
		<Icon name={tone === 'accent' ? 'info' : tone === 'warning' ? 'alert' : 'flame'} />
		<h2>{title}</h2>
	</div>
	{#if children}<div class="body">{@render children()}</div>{/if}
	{#if busy}<div class="busy" aria-hidden="true"><span></span></div>{/if}
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</div>

<style>
	.card {
		width: min(420px, calc(100vw - 32px));
		padding: var(--s-4) var(--s-5);
		background: var(--panel-solid);
		border: 1px solid var(--tone);
		border-radius: var(--r-panel);
		box-shadow: var(--shadow-overlay);
	}
	.accent {
		--tone: var(--line-strong);
		--ink: var(--c-accent);
	}
	.warning {
		--tone: var(--c-warning);
		--ink: var(--c-warning);
	}
	.danger {
		--tone: var(--c-danger);
		--ink: var(--c-danger);
	}
	.head {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		color: var(--ink);
	}
	h2 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
		color: var(--text);
	}
	.body {
		margin-top: var(--s-2);
		color: var(--text-dim);
	}
	.busy {
		height: 3px;
		margin-top: var(--s-4);
		background: var(--surface-chip);
		overflow: hidden;
		border-radius: 2px;
	}
	.busy span {
		display: block;
		width: 35%;
		height: 100%;
		background: var(--c-accent);
		animation: slide 1.4s var(--ease) infinite;
	}
	.actions {
		display: flex;
		gap: var(--s-2);
		margin-top: var(--s-4);
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
</style>
