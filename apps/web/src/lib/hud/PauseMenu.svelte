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
		onhideui,
		onscreenshot,
		onrevert,
		revertWhy = null,
		onworldsettings,
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
		/** World settings: the world's rules, easier only (plan 230). */
		onworldsettings?: () => void;
		/** Revert to the Hangar (plan 230), or why it is not offered. */
		onrevert?: () => void;
		revertWhy?: string | null;
		/** Hide the interface and take a screenshot (plan 226). */
		onhideui?: () => void;
		onscreenshot?: () => void;
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
		{#if onrevert}
			<div class="revert">
				<Button
					onclick={onrevert}
					disabled={revertWhy !== null}
					title={revertWhy ?? 'Back to the Hangar as it was before this launch'}
					data-testid="pause-revert">Revert to the Hangar</Button
				>
				{#if revertWhy}<p class="why" data-testid="pause-revert-why">{revertWhy}</p>{/if}
			</div>
		{/if}
		{#if onhideui || onscreenshot}
			<div class="pair">
				{#if onhideui}<Button onclick={onhideui} data-testid="pause-hide-ui"
						>Hide the interface</Button
					>{/if}
				{#if onscreenshot}<Button onclick={onscreenshot} data-testid="pause-screenshot"
						>Screenshot</Button
					>{/if}
			</div>
		{/if}
		<div class="pair">
			<Button onclick={onsettings} data-testid="pause-settings">Settings</Button>
			{#if onworldsettings}<Button onclick={onworldsettings} data-testid="pause-world-settings"
					>World settings</Button
				>{/if}
			<Button onclick={oncontrols}>Controls</Button>
		</div>
		{#if ondebug}
			<Button onclick={ondebug} data-testid="pause-debug">Debug (Alt+F12)</Button>
		{/if}
		<div class="pair">
			<a class="link" href={resolve('/(world)/vab')}>Back to the hangar</a>
			<a class="link" href={resolve('/(world)/vab?library')}>Vessel library</a>
		</div>
		<a class="link" href={resolve('/')}>Main menu</a>
	</div>
</Dialog>

<style>
	.revert {
		display: grid;
		gap: 0.25rem;
	}
	.why {
		margin: 0;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
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
