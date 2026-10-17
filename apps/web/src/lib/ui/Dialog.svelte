<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open,
		title,
		onclose,
		children
	}: { open: boolean; title: string; onclose: () => void; children: Snippet } = $props();

	const uid = $props.id();
	let el = $state<HTMLDialogElement>();

	// The native dialog gives a focus trap, inert background and Escape for free.
	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		if (!open && el.open) el.close();
	});
</script>

<!-- `cancel` is the Escape key; a Chromium build was seen closing the dialog without a following `close`, so both tell the page. -->
<dialog bind:this={el} aria-labelledby="{uid}-title" oncancel={onclose} {onclose}>
	<header>
		<h2 id="{uid}-title">{title}</h2>
		<button type="button" class="x" aria-label="Close dialog" onclick={onclose}
			><Icon name="close" size={16} /></button
		>
	</header>
	{@render children()}
</dialog>

<style>
	/* refs sheet (Worlds, Create world): radius 20, padding 20, a light title and a round close */
	dialog {
		min-width: min(26rem, calc(100vw - 2rem));
		max-width: min(40rem, calc(100vw - 2rem));
		max-height: calc(100vh - 3rem);
		max-height: calc(100dvh - 3rem);
		overflow: auto;
		padding: 1.25rem;
		color: var(--text-body);
		background: var(--surface-dialog);
		border: 1px solid var(--border-subtle);
		border-radius: 1.25rem;
		box-shadow: var(--shadow-overlay);
	}
	dialog::backdrop {
		background: var(--surface-scrim);
	}
	header {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		margin-bottom: 1rem;
	}
	h2 {
		margin: 0;
		font-size: 1.25rem;
		line-height: 1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.x {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.875rem;
		height: 1.875rem;
		margin-left: auto;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--surface-tile);
		color: var(--text-muted);
		cursor: pointer;
	}
	.x:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.x:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
</style>
