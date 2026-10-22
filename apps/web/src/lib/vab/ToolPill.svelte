<script lang="ts">
	/**
	 * The Hangar's bottom bar (plan 093, ADR 0148 point 3; refs): symmetry, the CoM and CoT markers,
	 * undo and redo, the high-contrast markers and, on narrow windows, the two drawers (plan 238: the
	 * Hangar's own top bar is gone). The Place, Move and Rotate tools, their axes, node snapping and
	 * free mode (plan 279, ADR 0258).
	 */
	import IconButton from '../ui/IconButton.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import { settings } from '../settings/settings.svelte';
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();
</script>

<div class="pill" role="toolbar" aria-label="Build tools">
	<div class="group" role="group" aria-label="Tool">
		{#each [{ id: 'place', label: 'Place', key: 'toolPlace', tip: 'Place and pick parts' }, { id: 'move', label: 'Move', key: 'toolMove', tip: 'Move the selected part (offset)' }, { id: 'rotate', label: 'Rotate', key: 'toolRotate', tip: 'Rotate the selected part' }, { id: 'root', label: 'Root', key: 'toolRoot', tip: 'Click a part to make it the root of the vessel' }] as const as t (t.id)}
			<button
				type="button"
				class="seg"
				class:on={vab.tool === t.id}
				aria-pressed={vab.tool === t.id}
				data-tip="{t.tip} ({settings.keymap.label(t.key)})"
				data-testid="tool-{t.id}"
				onclick={() => vab.setTool(t.id)}>{t.label}</button
			>
		{/each}
	</div>
	{#if vab.tool === 'move' || vab.tool === 'rotate'}
		<button
			type="button"
			class="toggle"
			aria-pressed={vab.toolFrame === 'local'}
			data-tip="Local (the part’s) or absolute (the vessel’s) axes ({settings.keymap.label(
				'toolFrame'
			)})"
			data-testid="tool-frame"
			onclick={() => vab.toggleToolFrame()}
			>{vab.toolFrame === 'local' ? 'Local' : 'Absolute'}<span class="dot" aria-hidden="true"
			></span></button
		>
	{/if}
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.snapNodes}
		data-tip="Snap to nodes: off places a part on any surface at the cursor ({settings.keymap.label(
			'snapNodes'
		)})"
		data-testid="tool-snap-nodes"
		onclick={() => vab.toggleSnapNodes()}>Nodes<span class="dot" aria-hidden="true"></span></button
	>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.freePlacement}
		data-tip="Free mode: moved parts may leave their parent (saved with the design)"
		data-testid="tool-free"
		onclick={() => vab.setFreePlacement(!vab.freePlacement)}
		>Free<span class="dot" aria-hidden="true"></span></button
	>
	<span class="sep" aria-hidden="true"></span>
	<span class="cap" data-tip="Copies per placement ({settings.keymap.label('symmetry')})">Sym</span>
	<div class="group" role="group" aria-label="Symmetry: copies per placement">
		{#each vab.symmetryCounts as n (n)}
			<button
				type="button"
				class="seg"
				class:on={vab.symmetry === n}
				aria-pressed={vab.symmetry === n}
				data-tip={n === 1 ? 'One part' : `${n} copies around the vessel`}
				onclick={() => ((vab.symmetry = n), (vab.mirror = false))}>×{n}</button
			>
		{/each}
	</div>
	{#if vab.tool === 'place'}
		<!-- what the copies turn about (plan 357, ADR 0301) -->
		<button
			type="button"
			class="toggle"
			aria-pressed={vab.symmetryPivot === 'vessel'}
			data-tip="Symmetry about the parent part or the vessel axis ({settings.keymap.label(
				'symmetryPivot'
			)} while placing)"
			data-testid="tool-pivot"
			onclick={() => vab.toggleSymmetryPivot()}
			>{vab.symmetryPivot === 'vessel' ? 'Vessel' : 'Parent'}<span class="dot" aria-hidden="true"
			></span></button
		>
	{/if}
	<span class="sep" aria-hidden="true"></span>
	<!-- touch chips for the modifier keys (plan 217, ADR 0207 point 11), styled like CoM/CoT (Hangar.dc.html) -->
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.mirror}
		data-tip="Mirror symmetry: two copies reflected ({settings.keymap.label('mirror')})"
		data-testid="tool-mirror"
		onclick={() => (vab.mirror = !vab.mirror)}
		>Mirror<span class="dot" aria-hidden="true"></span></button
	>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.angleSnap}
		data-tip="Angle snap of side sites ({settings.keymap.label('angleSnap')})"
		data-testid="tool-snap"
		onclick={() => (vab.angleSnap = !vab.angleSnap)}
		>Snap<span class="dot" aria-hidden="true"></span></button
	>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.copyMode}
		data-tip="Copy: the next part you tap goes on the cursor as a copy (Alt+click)"
		data-testid="tool-copy"
		onclick={() => (vab.copyMode = !vab.copyMode)}
		>Copy<span class="dot" aria-hidden="true"></span></button
	>
	<span class="sep" aria-hidden="true"></span>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.showCom}
		data-tip="Centre of mass and of pressure"
		onclick={() => (vab.showCom = !vab.showCom)}
		>CoM<span class="dot" aria-hidden="true"></span></button
	>
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.showCot}
		data-tip="Centre of thrust of the first stage"
		onclick={() => (vab.showCot = !vab.showCot)}
		>CoT<span class="dot cot" aria-hidden="true"></span></button
	>
	<!-- from the old Hangar top bar (plan 238) -->
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.highContrast}
		aria-label="High-contrast markers"
		data-tip="High-contrast markers"
		onclick={() => vab.toggleContrast()}
		>Contrast<span class="dot" aria-hidden="true"></span></button
	>
	<!-- the Hangar's keys (plan 348) -->
	<button
		type="button"
		class="toggle"
		aria-pressed={vab.keysOpen}
		aria-label="Hangar keys"
		data-tip="Hangar keys ({settings.keymap.label('hangarHelp')})"
		data-testid="tool-keys"
		onclick={() => (vab.keysOpen = !vab.keysOpen)}>?</button
	>
	<span class="drawer-btns">
		<IconButton
			icon="part"
			label="Parts and sub-assemblies"
			pressed={vab.drawer === 'parts'}
			onclick={() => (vab.drawer = vab.drawer === 'parts' ? null : 'parts')}
		/>
		<IconButton
			icon="stage"
			label="Stages and launch checks"
			pressed={vab.drawer === 'stages'}
			onclick={() => (vab.drawer = vab.drawer === 'stages' ? null : 'stages')}
		/>
	</span>
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
		/* never wider than the space between the side panels (plan 238: it covered the right column) */
		max-width: 100%;
		overflow-x: auto;
		scrollbar-width: none;
	}
	.pill > :global(*) {
		flex: none;
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
		position: relative;
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
	.seg.on {
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
	/* Hangar.dc.html: a 4 px dot centred under the label, shown only while on */
	.dot {
		position: absolute;
		left: 50%;
		bottom: 1px;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: transparent;
	}
	/* Hangar.dc.html: a toggle is muted off and white on, with a dot under it */
	.toggle[aria-pressed='false'] {
		color: var(--text-muted);
	}
	.toggle[aria-pressed='true'] {
		color: var(--text-primary);
	}
	.toggle[aria-pressed='true'] .dot {
		background: var(--text-primary);
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
	/* a narrow middle column: the pill fits between the side panels (the page makes `.bottom` the
	   container; plan 238 measured it against the column, the window's width is not enough) */
	@container (max-width: 860px) {
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
	.drawer-btns {
		display: none;
	}
	@media (max-width: 899px) {
		.drawer-btns {
			display: inline-flex;
		}
	}
</style>
