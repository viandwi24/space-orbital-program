<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import { formatMet } from '../format';

	let {
		open,
		name,
		met,
		onresume,
		oncontrols
	}: {
		open: boolean;
		name: string;
		met: number;
		onresume: () => void;
		oncontrols: () => void;
	} = $props();
</script>

<Dialog {open} title="Paused" onclose={onresume}>
	<p class="what">
		<strong>{name}</strong> is frozen at <span class="num">{formatMet(met)}</span>. Nothing moves
		until you resume.
	</p>
	<div class="actions">
		<Button variant="primary" onclick={onresume}>Resume</Button>
		<Button onclick={oncontrols}>Controls</Button>
		<a class="link" href="/vab">Back to the VAB</a>
		<a class="link" href="/">Main menu</a>
	</div>
</Dialog>

<style>
	.what {
		margin: 0 0 var(--s-5);
		max-width: 36ch;
		color: var(--text-dim);
	}
	strong {
		color: var(--text);
		font-weight: 600;
	}
	.actions {
		display: grid;
		gap: var(--s-2);
	}
	.link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 32px;
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text);
		text-decoration: none;
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.link:hover {
		border-color: var(--c-accent);
	}
</style>
