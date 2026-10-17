<script lang="ts">
	import type { SasMode, SasSnapshot } from '@orbital/core';
	import { settings } from '../settings/settings.svelte';
	import { buttonStates, errorText, masterLabel, toggledMode } from './sas-model';

	let {
		sas,
		controllable = true,
		hasNode = false,
		onmode
	}: {
		sas: SasSnapshot | undefined;
		controllable?: boolean;
		/** The vessel has a maneuver node to point at. */
		hasNode?: boolean;
		/** Called with the mode a press asks for (the caller adds the speed reference and sends it). */
		onmode: (mode: SasMode) => void;
	} = $props();

	const buttons = $derived(buttonStates(sas, controllable, hasNode, settings.keymap));
	const on = $derived(sas !== undefined && sas.mode !== 'off');
	const err = $derived(errorText(sas));
</script>

<div class="sas" role="group" aria-label="Stability assist">
	<button
		type="button"
		class="master"
		class:on
		aria-pressed={on}
		disabled={!controllable}
		title={controllable
			? `Stability assist (${settings.keymap.label('sasToggle')})`
			: 'Stability assist: no command part'}
		onclick={() => onmode(toggledMode(sas?.mode ?? 'off'))}
	>
		{masterLabel(sas)}
	</button>
	<div class="modes" class:dim={!on}>
		{#each buttons as b (b.mode)}
			<button
				type="button"
				class="mode"
				class:active={b.active}
				aria-pressed={b.active}
				aria-label={b.label}
				disabled={b.disabled}
				title={b.title}
				data-testid="sas-{b.mode}"
				onclick={() => onmode(b.mode)}
			>
				<svg viewBox="-12 -12 24 24" width="20" height="20" aria-hidden="true">
					{#if b.glyph === 'hold'}
						<rect x="-6" y="-6" width="12" height="12" rx="2" />
						<path d="M0 -10v4M0 6v4M-10 0h4M6 0h4" />
					{:else if b.glyph === 'prograde'}
						<circle r="5" />
						<path d="M0 -5v-6M-5 0h-6M5 0h6" />
						<circle r="1.4" class="fill" />
					{:else if b.glyph === 'retrograde'}
						<circle r="6" />
						<path d="M-3.6 -3.6l7.2 7.2M3.6 -3.6l-7.2 7.2" />
					{:else if b.glyph === 'normal'}
						<path d="M0 -8l7 12h-14Z" class="fill" />
					{:else if b.glyph === 'anti-normal'}
						<path d="M0 8l7 -12h-14Z" />
					{:else if b.glyph === 'radial-out'}
						<path d="M0 -8l8 8l-8 8l-8 -8Z" class="fill" />
					{:else if b.glyph === 'maneuver'}
						<circle r="5.5" />
						<circle r="2" class="fill" />
						<path d="M0 -5.5v-5M-4 4l-4 4M4 4l4 4" />
					{:else}
						<path d="M0 -8l8 8l-8 8l-8 -8Z" />
					{/if}
				</svg>
			</button>
		{/each}
	</div>
	<span class="err num" aria-label="Pointing error">{err}</span>
</div>

<style>
	.sas {
		display: flex;
		align-items: center;
		gap: var(--s-2);
	}
	button {
		font: inherit;
		color: var(--text);
		cursor: pointer;
	}
	button:disabled {
		cursor: not-allowed;
		opacity: 0.4;
	}
	.master {
		padding: 2px var(--s-3);
		font-size: var(--t-xs);
		font-weight: 600;
		background: rgb(150 180 210 / 0.12);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	.master.on {
		color: var(--c-positive);
		border-color: var(--c-positive);
	}
	.modes {
		display: flex;
		gap: 2px;
	}
	.modes.dim .mode:not(.active) {
		opacity: 0.55;
	}
	.mode {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		padding: 0;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--r-control);
	}
	.mode:hover:not(:disabled) {
		background: rgb(150 180 210 / 0.14);
	}
	.mode.active {
		border-color: var(--c-positive);
		background: rgb(95 227 161 / 0.16);
	}
	.mode:focus-visible,
	.master:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	svg .fill {
		fill: currentColor;
	}
	.err {
		min-width: 3em;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
</style>
