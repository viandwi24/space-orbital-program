<script lang="ts">
	/**
	 * Recover a landed vessel (plan 132, ADR 0113 point 6): the quote's value, distance, factor and
	 * credit; Recover sends `recover-vessel` (the page does it) and returns to the Hangar.
	 */
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import { recoveryLines, type RecoveryQuoteView } from './recovery-model';

	let {
		open,
		quote,
		onrecover,
		onclose
	}: {
		open: boolean;
		quote: RecoveryQuoteView;
		onrecover: () => void;
		onclose: () => void;
	} = $props();
</script>

<Dialog {open} title="Recover the vessel" {onclose}>
	<dl class="lines" data-testid="recover-lines">
		{#each recoveryLines(quote) as line (line.label)}
			<dt>{line.label}</dt>
			<dd class="num">{line.value}</dd>
		{/each}
	</dl>
	<div class="actions">
		<Button variant="ghost" onclick={onclose}>Keep flying</Button>
		<Button variant="primary" onclick={onrecover} data-testid="recover-confirm">Recover</Button>
	</div>
</Dialog>

<style>
	.lines {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.5rem 1.5rem;
		margin: 0 0 1rem;
		font-size: var(--t-small);
	}
	dt {
		color: var(--text-secondary);
	}
	dd {
		margin: 0;
		text-align: right;
		color: var(--text-primary);
	}
	dt:last-of-type,
	dd:last-of-type {
		font-weight: 700;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
