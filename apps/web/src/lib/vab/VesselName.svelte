<script lang="ts">
	/**
	 * The vessel's name and kind as one row right of the time bar (plan 346, ADR 0295 point 2; was a
	 * capsule above the left column since plan 238). The page hands it to the shell's `beside` slot.
	 */
	import Switch from '../ui/Switch.svelte';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
	const saveText = $derived(
		vab.saveState === 'saving' ? 'Saving…' : vab.saveState === 'saved' ? 'Saved' : ''
	);
</script>

<div class="vessel" data-testid="vab-vessel">
	<label class="name">
		<span class="cap" aria-hidden="true">Hangar</span>
		<span class="sr-only">Vessel name</span>
		<input
			value={vab.editor.design.name === vab.defaultName ? '' : vab.editor.design.name}
			placeholder="Name your vessel"
			maxlength="48"
			spellcheck="false"
			oninput={(e) => vab.setName(e.currentTarget.value)}
		/>
	</label>
	<span class="save" class:on={saveText !== ''} role="status" data-tip={saveText || undefined}
		><span class="sr-only">{saveText}</span></span
	>
	<span class="divider" aria-hidden="true"></span>
	<!-- plan 063: an aircraft rolls out to a runway and starts level -->
	<span class="aircraft" data-tip="An aircraft rolls out to a runway and starts level">
		<span class="cap" aria-hidden="true">Aircraft</span>
		<Switch
			checked={vab.editor.design.aircraft === true}
			label="Aircraft"
			testid="vab-aircraft"
			onchange={(on) => vab.setAircraft(on)}
		/>
	</span>
</div>

<style>
	/* the time bar's glass and height (ADR 0295 point 2) */
	.vessel {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		height: 2.75rem;
		box-sizing: border-box;
		padding: 0 0.875rem 0 1rem;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 999px;
	}
	.name,
	.aircraft {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.cap {
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.name input {
		width: 13rem;
		height: 1.875rem;
		box-sizing: border-box;
		padding: 0 0.625rem;
		border: 1px solid transparent;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-button);
		font-weight: 600;
		outline: none;
	}
	.name input::placeholder {
		color: var(--text-muted);
		font-weight: 500;
	}
	.name input:hover {
		border-color: var(--border-subtle);
	}
	.name input:focus-visible {
		border-color: var(--border-strong);
	}
	/* the save state as a dot: green once saved, pulsing while saving */
	.save {
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 50%;
		background: transparent;
	}
	.save.on {
		background: var(--ok);
	}
	.divider {
		width: 1px;
		height: 1.25rem;
		background: rgb(255 255 255 / 0.12);
	}
	@media (max-width: 899px) {
		.cap {
			display: none;
		}
		.name input {
			width: 8rem;
		}
	}
</style>
