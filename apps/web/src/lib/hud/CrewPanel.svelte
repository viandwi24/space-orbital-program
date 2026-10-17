<script lang="ts">
	/** The crew placeholder (refs `Main` bottom right; ADR 0144 point 4): no crew data until plan 108. */
	import Panel from '../ui/Panel.svelte';
</script>

<Panel title="Crew" data-testid="crew-panel">
	{#snippet aside()}<span class="num">[—]</span>{/snippet}
	<p>Crew comes with plan 108.</p>
</Panel>

<style>
	p {
		margin: 0;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
</style>
