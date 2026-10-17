<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<kbd><span>{@render children()}</span></kbd>

<style>
	kbd {
		display: inline-block;
		min-width: 1.6em;
		padding: 1px 6px;
		text-align: center;
		font-family: var(--font-mono);
		font-size: var(--t-xs);
		color: var(--text);
		background: rgb(150 180 210 / 0.14);
		border: 1px solid var(--line-strong);
		border-bottom-width: 2px;
		border-radius: var(--r-control);
	}
</style>
