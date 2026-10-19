<script lang="ts">
	/** Round 44 glass button with a left arrow (refs), top left of a screen; a link when given `href`. */
	import Icon from './Icon.svelte';

	let {
		label = 'Back',
		href,
		onclick,
		testid
	}: { label?: string; href?: string; onclick?: () => void; testid?: string } = $props();
</script>

{#if href}
	<a class="back" {href} aria-label={label} data-tip={label} data-testid={testid}
		><Icon name="back" size={18} /></a
	>
{:else}
	<button
		type="button"
		class="back"
		aria-label={label}
		data-tip={label}
		data-testid={testid}
		{onclick}><Icon name="back" size={18} /></button
	>
{/if}

<style>
	.back {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: var(--capsule);
		height: var(--capsule);
		padding: 0;
		box-sizing: border-box;
		border-radius: 50%;
		border: 1px solid var(--border-subtle);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		color: var(--text-primary);
		text-decoration: none;
	}
	.back:hover {
		background: var(--surface-solid);
	}
</style>
