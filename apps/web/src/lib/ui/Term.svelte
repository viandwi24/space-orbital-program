<script lang="ts">
	/**
	 * A HUD term that explains itself (plan 228): focusable, its tooltip is the glossary's short text
	 * with a link to the entry.
	 */
	import type { Snippet } from 'svelte';
	import { termTip } from '../public/glossary';

	let { id, children }: { id: string; children: Snippet } = $props();
</script>

<button type="button" class="term" {...termTip(id)} data-testid="term-{id}"
	>{@render children()}</button
>

<style>
	.term {
		padding: 0;
		border: 0;
		background: none;
		color: inherit;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		cursor: help;
		text-decoration: underline dotted;
		text-decoration-color: color-mix(in srgb, currentColor 45%, transparent);
		text-underline-offset: 2px;
	}
	.term:focus-visible {
		outline: 2px solid var(--focus-ring, var(--accent-text));
		outline-offset: 2px;
		border-radius: 2px;
	}
</style>
