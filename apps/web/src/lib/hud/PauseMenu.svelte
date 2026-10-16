<script lang="ts">
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import { formatMet } from '../format';

	let {
		open,
		name,
		met,
		onresume,
		oncontrols,
		onsettings,
		onsave,
		onload
	}: {
		open: boolean;
		name: string;
		met: number;
		onresume: () => void;
		oncontrols: () => void;
		onsettings: () => void;
		onsave: () => void;
		onload: () => void;
	} = $props();
</script>

<Dialog {open} title="Paused" onclose={onresume}>
	<p class="what">
		<strong>{name}</strong> is frozen at <span class="num">{formatMet(met)}</span>. Nothing moves
		until you resume.
	</p>
	<div class="actions">
		<Button variant="primary" onclick={onresume}>Resume</Button>
		<div class="pair">
			<Button onclick={onsave}>Save the flight</Button>
			<Button onclick={onload}>Load a flight</Button>
		</div>
		<div class="pair">
			<Button onclick={onsettings} data-testid="pause-settings">Settings</Button>
			<Button onclick={oncontrols}>Controls</Button>
		</div>
		<div class="pair">
			<a class="link" href="/vab">Back to the hangar</a>
			<a class="link" href="/vab?library">Vessel library</a>
		</div>
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
		min-width: 300px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
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
