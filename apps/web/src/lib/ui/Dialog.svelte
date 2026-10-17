<script lang="ts">
	import type { Snippet } from 'svelte';

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
	<h2 id="{uid}-title">{title}</h2>
	{@render children()}
</dialog>

<style>
	dialog {
		min-width: min(420px, calc(100vw - 32px));
		max-width: min(640px, calc(100vw - 32px));
		max-height: calc(100vh - 48px);
		max-height: calc(100dvh - 48px);
		overflow: auto;
		padding: var(--s-5);
		color: var(--text);
		background: var(--panel-solid);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		box-shadow: var(--shadow-overlay);
	}
	dialog::backdrop {
		background: rgb(2 5 9 / 0.62);
		backdrop-filter: blur(3px);
	}
	h2 {
		margin: 0 0 var(--s-4);
		font-size: var(--t-lg);
		font-weight: 600;
	}
</style>
