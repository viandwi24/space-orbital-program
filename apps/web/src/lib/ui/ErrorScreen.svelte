<script lang="ts">
	import { resolve } from '$app/paths';
	import Button from './Button.svelte';
	import SpaceBackdrop from './SpaceBackdrop.svelte';

	/** The page broke (plan 023): say what happened, offer a way out. Never a blank page. */
	let {
		title = 'Something went wrong',
		message,
		onreload
	}: { title?: string; message: string; onreload: () => void } = $props();
</script>

<SpaceBackdrop planet={false} />
<div class="wrap">
	<main role="alert" data-testid="error-screen">
		<h1>{title}</h1>
		<p>
			The game hit a problem it could not recover from. Your saved flights and designs are stored in
			this browser and are not affected.
		</p>
		<pre>{message}</pre>
		<div class="actions">
			<Button variant="primary" onclick={onreload}>Reload the page</Button>
			<a href={resolve('/')}>Main menu</a>
		</div>
	</main>
</div>

<style>
	.wrap {
		position: relative;
		min-height: 100vh;
		min-height: 100dvh;
		padding: 14vh var(--s-4) 0;
		box-sizing: border-box;
	}
	main {
		max-width: 36rem;
		margin: 0 auto;
		padding: 1.25rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: 1.25rem;
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	h1 {
		margin: 0 0 var(--s-3);
		font-size: 1.25rem;
		line-height: 1.2;
		font-weight: 300;
		color: var(--text-primary);
	}
	p {
		margin: 0;
		font-size: var(--t-value);
		color: var(--text-muted);
	}
	pre {
		margin: var(--s-4) 0;
		padding: var(--s-3);
		overflow: auto;
		max-height: 10rem;
		font-family: var(--font-mono);
		font-size: var(--t-small);
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--danger);
		background: var(--surface-inset);
		border-radius: var(--radius-tile);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: var(--s-4);
	}
	a {
		font-size: var(--t-button);
		font-weight: 700;
		color: var(--text-secondary);
	}
</style>
