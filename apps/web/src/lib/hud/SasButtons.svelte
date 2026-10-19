<script lang="ts">
	import type { SasMode, SasSnapshot } from '@orbital/core';
	import { settings } from '../settings/settings.svelte';
	import { buttonStates, errorText, masterLabel, toggledMode } from './sas-model';
	import { RCS_LABEL, type RcsState } from './rcs-model';

	let {
		sas,
		controllable = true,
		hasNode = false,
		hasTarget = false,
		rcs = 'none',
		onrcs,
		onmode
	}: {
		sas: SasSnapshot | undefined;
		controllable?: boolean;
		/** The vessel has a maneuver node to point at. */
		hasNode?: boolean;
		/** The vessel has a target to point at or away from. */
		hasTarget?: boolean;
		/** Called with the mode a press asks for (the caller adds the speed reference and sends it). */
		onmode: (mode: SasMode) => void;
		/** The RCS pill (plan 211): its state, and a press toggles RCS. */
		rcs?: RcsState;
		onrcs?: () => void;
	} = $props();

	const buttons = $derived(buttonStates(sas, controllable, hasNode, settings.keymap, hasTarget));
	const on = $derived(sas !== undefined && sas.mode !== 'off');
	const err = $derived(errorText(sas));
</script>

<!-- The refs SAS pod (ADR 0144 point 2): seven modes around hold, our three extra in a column beside. -->
<div class="sas" role="group" aria-label="Stability assist">
	<div class="pills">
		<button
			type="button"
			class="master"
			class:on
			aria-pressed={on}
			aria-label={masterLabel(sas)}
			disabled={!controllable}
			data-tip={controllable
				? `Stability assist (${settings.keymap.label('sasToggle')})`
				: 'Stability assist: no command part'}
			onclick={() => onmode(toggledMode(sas?.mode ?? 'off'))}>SAS</button
		>
		<button
			type="button"
			class="master"
			class:on={rcs === 'on'}
			class:dry={rcs === 'dry'}
			aria-pressed={rcs === 'on' || rcs === 'dry'}
			aria-label={RCS_LABEL[rcs]}
			data-testid="hud-rcs"
			disabled={rcs === 'none' || !controllable || !onrcs}
			data-tip="{RCS_LABEL[rcs]} ({settings.keymap.label('rcsToggle')})"
			onclick={() => onrcs?.()}>{rcs === 'dry' ? 'RCS !' : 'RCS'}</button
		>
	</div>
	<div class="modes" class:dim={!on}>
		{#each buttons as b (b.mode)}
			<button
				type="button"
				class="mode m-{b.mode}"
				class:active={b.active}
				aria-pressed={b.active}
				aria-label={b.label}
				disabled={b.disabled}
				data-tip={b.title}
				data-testid="sas-{b.mode}"
				onclick={() => onmode(b.mode)}
			>
				<svg viewBox="-12 -12 24 24" aria-hidden="true">
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
					{:else if b.glyph === 'target'}
						<circle r="6" />
						<circle r="1.6" class="fill" />
						<path d="M0 -11v5M0 6v5M-11 0h5M6 0h5" />
					{:else if b.glyph === 'anti-target'}
						<circle r="6" />
						<path d="M-2.8 -2.8l5.6 5.6M2.8 -2.8l-5.6 5.6M0 -11v5M0 6v5M-11 0h5M6 0h5" />
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
	/* positions in the mock's pod box (132 x 132 mock px, `--u` from the deck) */
	.sas {
		position: absolute;
		inset: 0;
	}
	button {
		font: inherit;
		cursor: pointer;
	}
	button:disabled {
		cursor: not-allowed;
	}
	.pills {
		position: absolute;
		left: calc(16 * var(--u));
		top: calc(-48 * var(--u));
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: var(--radius-pill);
		background: var(--surface-solid);
	}
	.master {
		height: calc(26 * var(--u));
		min-height: 1.25rem;
		padding: 0 0.625rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--surface-chip);
		color: var(--text-muted);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.1em;
	}
	.master.on {
		background: var(--accent);
		color: var(--on-accent);
	}
	.master.dry {
		background: var(--surface-chip);
		color: var(--c-warning);
		box-shadow: inset 0 0 0 1px var(--c-warning);
	}
	.master:disabled {
		opacity: 0.55;
	}
	.mode {
		position: absolute;
		display: grid;
		place-items: center;
		width: calc(34 * var(--u));
		height: calc(34 * var(--u));
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: var(--surface-tile);
		color: var(--text-secondary);
	}
	.modes.dim .mode:not(.active) {
		color: var(--text-disabled);
	}
	.mode:hover:not(:disabled) {
		background: var(--surface-track);
	}
	.mode.active {
		background: var(--accent);
		color: var(--on-accent);
	}
	.mode:disabled {
		opacity: 0.4;
	}
	.m-hold {
		left: calc(49 * var(--u));
		top: calc(49 * var(--u));
	}
	.m-prograde {
		left: calc(49 * var(--u));
		top: calc(5 * var(--u));
	}
	.m-retrograde {
		left: calc(49 * var(--u));
		top: calc(93 * var(--u));
	}
	.m-normal {
		left: calc(87 * var(--u));
		top: calc(27 * var(--u));
	}
	.m-radial-out {
		left: calc(87 * var(--u));
		top: calc(71 * var(--u));
	}
	.m-radial-in {
		left: calc(11 * var(--u));
		top: calc(71 * var(--u));
	}
	.m-antinormal {
		left: calc(11 * var(--u));
		top: calc(27 * var(--u));
	}
	/* the three modes the mock has no slot for, in the column beside the pod */
	.m-maneuver,
	.m-target,
	.m-anti-target {
		left: calc(137 * var(--u));
		width: calc(30 * var(--u));
		height: calc(30 * var(--u));
	}
	.m-maneuver {
		top: calc(-6 * var(--u));
	}
	.m-target {
		top: calc(30 * var(--u));
	}
	.m-anti-target {
		top: calc(66 * var(--u));
	}
	.mode:focus-visible,
	.master:focus-visible {
		outline: 2px solid var(--accent-text);
		outline-offset: 1px;
	}
	svg {
		width: 62%;
		height: 62%;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	svg .fill {
		fill: currentColor;
	}
	.err {
		position: absolute;
		left: calc(132 * var(--u));
		top: calc(100 * var(--u));
		width: calc(40 * var(--u));
		font-size: var(--t-label);
		text-align: center;
		color: var(--text-muted);
	}
</style>
