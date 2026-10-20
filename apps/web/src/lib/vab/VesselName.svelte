<script lang="ts">
	/**
	 * The vessel's name and kind at the top of the Hangar's left column (plan 238): the shell's menu bar
	 * carries New, Open, Save and Launch (BASE_LAYOUT §2), so the Hangar draws no bar of its own.
	 */
	import Switch from '../ui/Switch.svelte';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
</script>

<div class="vessel" data-testid="vab-vessel">
	<label class="capsule name">
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
	<!-- plan 063: an aircraft rolls out to a runway and starts level -->
	<span class="capsule aircraft" data-tip="An aircraft rolls out to a runway and starts level">
		<Switch
			checked={vab.editor.design.aircraft === true}
			label="Aircraft"
			testid="vab-aircraft"
			onchange={(on) => vab.setAircraft(on)}
		/>
		<span class="cap" aria-hidden="true">Aircraft</span>
	</span>
	<span class="save" role="status">
		{vab.saveState === 'saving' ? 'Saving…' : vab.saveState === 'saved' ? 'Saved' : ''}
	</span>
</div>

<style>
	.vessel {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2);
		margin-bottom: var(--s-2);
	}
	.capsule {
		display: flex;
		align-items: center;
		height: 2.75rem;
		box-sizing: border-box;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.aircraft {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 0.75rem;
	}
	.name {
		gap: 0.625rem;
		padding: 0 0.375rem 0 1rem;
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
		width: 12.5rem;
		height: 2rem;
		box-sizing: border-box;
		padding: 0 0.625rem;
		border: 1px solid var(--border-subtle);
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
	.name input:focus-visible {
		border-color: var(--border-strong);
	}
	.save {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.save:empty {
		display: none;
	}
	@media (max-width: 899px) {
		.cap,
		.save {
			display: none;
		}
		.name input {
			width: 9rem;
		}
	}
</style>
