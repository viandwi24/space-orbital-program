<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = HTMLAttributes<HTMLElement> & {
		title?: string;
		/** Right-aligned content in the header (a total, a toggle). */
		aside?: Snippet;
		children: Snippet;
		/** `solid` for panels that carry long text (the script editor). */
		solid?: boolean;
	};
	let { title, aside, children, solid = false, ...rest }: Props = $props();
</script>

<section class="panel" class:solid {...rest}>
	{#if title}
		<header>
			<h2>{title}</h2>
			{#if aside}<div class="aside">{@render aside()}</div>{/if}
		</header>
	{/if}
	{@render children()}
</section>

<style>
	.panel {
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
		padding: var(--s-3);
		box-sizing: border-box;
	}
	.solid {
		background: var(--panel-solid);
		backdrop-filter: none;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--s-3);
		margin-bottom: var(--s-2);
	}
	h2 {
		margin: 0;
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--text-dim);
		letter-spacing: 0.02em;
	}
	.aside {
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
</style>
