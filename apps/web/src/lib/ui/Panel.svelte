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
	/* Glass panel (refs): radius 16, padding 10, header as a capital label with a count on the right. */
	.panel {
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		padding: var(--panel-pad);
		box-sizing: border-box;
	}
	.solid {
		background: var(--surface-solid);
		-webkit-backdrop-filter: none;
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
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.aside {
		font-size: var(--t-small);
		color: var(--text-muted);
	}
</style>
