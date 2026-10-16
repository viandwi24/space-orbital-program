<script lang="ts">
	import Button from './Button.svelte';

	/** The page broke (plan 023): say what happened, offer a way out. Never a blank page. */
	let {
		title = 'Something went wrong',
		message,
		onreload
	}: { title?: string; message: string; onreload: () => void } = $props();
</script>

<main role="alert" data-testid="error-screen">
	<h1>{title}</h1>
	<p>
		The game hit a problem it could not recover from. Your saved flights and designs are stored in
		this browser and are not affected.
	</p>
	<pre class="num">{message}</pre>
	<div class="actions">
		<Button variant="primary" onclick={onreload}>Reload the page</Button>
		<a href="/">Main menu</a>
	</div>
</main>

<style>
	main {
		max-width: 36rem;
		margin: 14vh auto 0;
		padding: 0 var(--s-4);
	}
	h1 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-xl);
		font-weight: 600;
		color: var(--c-danger);
	}
	p {
		color: var(--text-dim);
	}
	pre {
		margin: var(--s-4) 0;
		padding: var(--s-3);
		overflow: auto;
		max-height: 10rem;
		font-size: var(--t-xs);
		white-space: pre-wrap;
		word-break: break-word;
		background: var(--field);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
</style>
