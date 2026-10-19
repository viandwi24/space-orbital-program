<script lang="ts">
	/**
	 * The Hangar's bottom bar (plan 093, ADR 0148 point 3; refs): symmetry, the CoM and CoT markers,
	 * undo and redo. Only what the editor does today: no tool modes.
	 */
	import IconButton from '../ui/IconButton.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { settings } from '../settings/settings.svelte';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
</script>

<div class="pill" role="toolbar" aria-label="Build tools">
	<span class="cap" title="Copies per placement ({settings.keymap.label('symmetry')})">Sym</span>
	<div class="group" role="group" aria-label="Symmetry: copies per placement">
		{#each vab.symmetryCounts as n (n)}
			<button
				type="button"
				class="seg"
				class:on={vab.symmetry === n}
				aria-pressed={vab.symmetry === n}
				title={n === 1 ? 'One part' : `${n} copies around the vessel`}
				onclick={() => ((vab.symmetry = n), (vab.mirror = false))}>×{n}</button
			>
		{/each}
	</div>
	<!-- touch chips for the modifier keys (plan 217, ADR 0207 point 11) -->
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.mirror}
		title="Mirror symmetry: two copies reflected ({settings.keymap.label('mirror')})"
		data-testid="tool-mirror"
		onclick={() => (vab.mirror = !vab.mirror)}>Mirror</button
	>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.angleSnap}
		title="Angle snap of side sites ({settings.keymap.label('angleSnap')})"
		data-testid="tool-snap"
		onclick={() => (vab.angleSnap = !vab.angleSnap)}>Snap</button
	>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.copyMode}
		title="Copy: the next part you tap goes on the cursor as a copy (Alt+click)"
		data-testid="tool-copy"
		onclick={() => (vab.copyMode = !vab.copyMode)}>Copy</button
	>
	<span class="sep" aria-hidden="true"></span>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.showCom}
		title="Centre of mass and of pressure"
		onclick={() => (vab.showCom = !vab.showCom)}
		>CoM<span class="dot" aria-hidden="true"></span></button
	>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.showCot}
		title="Centre of thrust of the first stage"
		onclick={() => (vab.showCot = !vab.showCot)}
		>CoT<span class="dot cot" aria-hidden="true"></span></button
	>
	<span class="sep" aria-hidden="true"></span>
	<IconButton
		icon="undo"
		label="Undo"
		hint="Ctrl+Z"
		disabled={!vab.canUndo}
		onclick={() => vab.doUndo()}
	/>
	<IconButton
		icon="redo"
		label="Redo"
		hint="Ctrl+Shift+Z"
		disabled={!vab.canRedo}
		onclick={() => vab.doRedo()}
	/>
	<span class="keys"><Kbd>{settings.keymap.label('frame')}</Kbd> frame</span>
</div>

<style>
	/* refs: a 48-high glass pill */
	.pill {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 3rem;
		box-sizing: border-box;
		padding: 0.25rem 0.5rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.cap {
		padding: 0 0.25rem 0 0.375rem;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.group {
		display: flex;
		gap: 2px;
	}
	.seg,
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		height: 2.25rem;
		min-width: 2.25rem;
		justify-content: center;
		padding: 0 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.seg:hover,
	.toggle:hover {
		background: var(--surface-hover);
	}
	.seg.on,
	.toggle[data-testid^='tool-'][aria-pressed='true'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	/* touch: 44 px targets (plan 217, ADR 0207 point 11) */
	@media (pointer: coarse) {
		.seg,
		.toggle {
			min-width: 2.75rem;
			height: 2.75rem;
		}
	}
	.seg:focus-visible,
	.toggle:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	.dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background: transparent;
		box-shadow: inset 0 0 0 1px var(--text-subtle);
	}
	.toggle[aria-pressed='true'] .dot {
		background: var(--text-primary);
		box-shadow: none;
	}
	.toggle[aria-pressed='true'] .dot.cot {
		background: var(--accent);
	}
	.sep {
		width: 1px;
		height: 1.25rem;
		margin: 0 0.375rem;
		background: var(--surface-chip);
	}
	.keys {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: 0.375rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	/* narrower windows: the pill fits between the side panels */
	@media (max-width: 1279px) {
		.keys,
		.cap {
			display: none;
		}
		.seg {
			min-width: 1.875rem;
			padding: 0 0.25rem;
		}
		.toggle {
			padding: 0 0.375rem;
		}
		.sep {
			margin: 0 0.125rem;
		}
	}
</style>
