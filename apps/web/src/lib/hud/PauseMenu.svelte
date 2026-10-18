<script lang="ts">
	import { resolve } from '$app/paths';
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
		onload,
		onreplay,
		onghost,
		ondebug
	}: {
		open: boolean;
		name: string;
		met: number;
		onresume: () => void;
		oncontrols: () => void;
		onsettings: () => void;
		onsave: () => void;
		onload: () => void;
		/** Export the flight as a replay file (plan 131). */
		onreplay?: () => void;
		/** Load a replay file as a ghost (plan 131). */
		onghost?: () => void;
		/** Open the Debug panel (plan 203). */
		ondebug?: () => void;
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
		{#if onreplay || onghost}
			<div class="pair">
				{#if onreplay}<Button onclick={onreplay} data-testid="pause-replay"
						>Export the replay</Button
					>{/if}
				{#if onghost}<Button onclick={onghost} data-testid="pause-ghost">Load a ghost</Button>{/if}
			</div>
		{/if}
		<div class="pair">
			<Button onclick={onsettings} data-testid="pause-settings">Settings</Button>
			<Button onclick={oncontrols}>Controls</Button>
		</div>
		{#if ondebug}
			<Button onclick={ondebug} data-testid="pause-debug">Debug (Alt+F12)</Button>
		{/if}
		<div class="pair">
			<a class="link" href={resolve('/vab')}>Back to the hangar</a>
			<a class="link" href={resolve('/vab?library')}>Vessel library</a>
		</div>
		<a class="link" href={resolve('/')}>Main menu</a>
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
