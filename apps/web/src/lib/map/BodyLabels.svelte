<script lang="ts">
	/** The names of the bodies in the map (plan 382), in CSS pixels under each body's disc. */
	import type { BodyLabel } from './body-labels';

	let { labels }: { labels: readonly BodyLabel[] } = $props();
</script>

<div class="body-labels" aria-hidden="true" data-testid="body-labels">
	{#each labels as l (l.id)}
		<span class="name" data-body={l.id} style:transform="translate({l.x}px, {l.y}px) translateX(-50%)"
			>{l.text}</span
		>
	{/each}
</div>

<style>
	.body-labels {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.name {
		position: absolute;
		left: 0;
		top: 0;
		white-space: nowrap;
		font-size: var(--t-small);
		color: var(--text-secondary, #c4c4cc);
		text-shadow:
			0 0 3px var(--bg-void, #000),
			0 0 6px var(--bg-void, #000);
	}
</style>
