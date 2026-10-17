<script lang="ts">
	/** The head of a public page (plan 089, refs): the round back button to the menu and a light title. */
	import BackButton from './BackButton.svelte';

	let { title }: { title: string } = $props();
</script>

<header>
	<BackButton href="/" label="Back to the main menu" />
	<h1>{title}</h1>
</header>

<style>
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		line-height: 1;
		font-weight: 300;
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}
</style>
