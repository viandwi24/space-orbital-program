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
		margin: 0 0 1.25rem;
		max-width: 36ch;
		font-size: var(--t-value);
		color: var(--text-muted);
	}
	strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	.actions {
		display: grid;
		gap: 0.375rem;
		min-width: 18.75rem;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.375rem;
	}
	/* the links look like the secondary Button next to them */
	.link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: var(--round-btn);
		font-size: var(--t-button);
		font-weight: 700;
		color: var(--text-secondary);
		text-decoration: none;
		background: var(--surface-button);
		border-radius: var(--radius-row);
	}
	.link:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.link:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
</style>
