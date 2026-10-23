<script lang="ts">
	import Button from '../ui/Button.svelte';

	/**
	 * The welcome on a world's first Space Center visit (plan 377, ADR 0314 point 1): take the short
	 * tour, or skip it; "Don't ask again" covers every world on this browser.
	 */
	let { onstart, onskip }: { onstart: () => void; onskip: (never: boolean) => void } = $props();
	let never = $state(false);
	let el = $state<HTMLDialogElement>();
	$effect(() => {
		if (el && !el.open) el.showModal();
	});
</script>

<dialog
	bind:this={el}
	class="offer"
	aria-labelledby="tour-title"
	data-testid="sc-tour-offer"
	oncancel={(e) => {
		e.preventDefault();
		onskip(never);
	}}
>
	<p class="eyebrow">New world</p>
	<h2 id="tour-title">Welcome to your Space Center</h2>
	<p>
		Take a short tour? You will move the camera, build a tracking dish, visit a building, upgrade
		and demolish: a few minutes, and it costs you nothing.
	</p>
	<label class="never">
		<input type="checkbox" bind:checked={never} data-testid="sc-tour-never" />
		Don't ask again
	</label>
	<div class="row">
		<Button variant="ghost" onclick={() => onskip(never)} data-testid="sc-tour-decline">Skip</Button
		>
		<Button variant="primary" onclick={onstart} data-testid="sc-tour-start">Start the tour</Button>
	</div>
</dialog>

<style>
	.offer {
		width: min(26rem, calc(100vw - 2rem));
		padding: var(--s-5);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		background: var(--surface-solid, var(--panel-solid));
		color: var(--text-body);
	}
	.offer::backdrop {
		background: rgb(0 0 0 / 0.45);
	}
	.eyebrow {
		margin: 0 0 var(--s-1);
		font-size: var(--t-xs);
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--c-accent);
	}
	h2 {
		margin: 0 0 var(--s-2);
		font-size: var(--t-lg);
		font-weight: 600;
		color: var(--text-primary);
	}
	p {
		margin: 0 0 var(--s-3);
		font-size: var(--t-sm);
		line-height: 1.45;
	}
	.never {
		display: flex;
		align-items: center;
		gap: var(--s-2);
		font-size: var(--t-sm);
		color: var(--text-muted);
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: var(--s-2);
		margin-top: var(--s-4);
	}
</style>
