<script lang="ts">
	import { resolve } from '$app/paths';
	import Switch from '../ui/Switch.svelte';
	import BackButton from '../ui/BackButton.svelte';
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import type { VabController } from './controller.svelte';
	import { settings } from '../settings/settings.svelte';
	import type { ActionId } from '../keybindings';

	/** The Hangar's top (plan 093, refs): back and the vessel's name on the left, files and Launch on the right. */
	let { vab }: { vab: VabController } = $props();
	const key = (id: ActionId): string => settings.keymap.label(id);
</script>

<div class="top">
	<div class="left">
		<BackButton href={resolve('/')} label="Back to the main menu" />
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
		<span class="capsule aircraft" title="An aircraft rolls out to a runway and starts level">
			<Switch
				checked={vab.editor.design.aircraft === true}
				label="Aircraft"
				testid="vab-aircraft"
				onchange={(on) => vab.setAircraft(on)}
			/>
			<span class="cap" aria-hidden="true">Aircraft</span>
		</span>
	</div>
	<div class="center">
		<div class="context" aria-live="polite">
			{#if vab.armed}
				{@const armed = vab.armed}
				<span class="chip live">
					<Icon name={armed.kind === 'carry' ? 'move' : 'plus'} size={16} />
					{#if armed.kind === 'new'}
						Placing <strong>{vab.defOf(armed.part)?.title}</strong>
					{:else if armed.kind === 'assembly'}
						Placing <strong>{vab.assemblyOf(armed.id)?.name}</strong>
					{:else if armed.kind === 'connect'}
						<strong>{vab.defOf(armed.part)?.title}</strong>:
						{armed.from
							? `now click the part it ends on (from ${vab.titleOfPart(armed.from.index)})`
							: 'click the part it hangs on'}
					{:else if armed.kind === 'copy'}
						Placing a copy of <strong>{armed.title}</strong>
						<span class="dim">(drop it on the catalogue to discard it)</span>
					{:else}
						Moving <strong>{vab.titleOfPart(armed.index)}</strong>
						{#if vab.shown.followers.length > 0}<span class="dim"
								>and {vab.shown.followers.length} copies</span
							>{/if}
					{/if}
				</span>
				<span class="hintline">
					{#if armed.kind === 'connect'}
						Click a part. <Kbd>Alt</Kbd> frees the angle; <Kbd>{key('nextPart')}</Kbd> selects a part
						and <Kbd>{key('place')}</Kbd> picks it. Copies follow a symmetric group.
					{:else if vab.targets.length === 0}
						Nowhere to attach this.
					{:else if vab.radialCapable}
						Click the side of a tank or a ring. <Kbd>Alt</Kbd> frees the angle, <Kbd
							>{key('turnPlus')}</Kbd
						>
						<Kbd>{key('turnMinus')}</Kbd> turn the keyboard sites, <Kbd>{key('nextSite')}</Kbd> and
						<Kbd>{key('place')}</Kbd> place.
					{:else}
						Click a ring, or <Kbd>{key('nextSite')}</Kbd> to choose and <Kbd>{key('place')}</Kbd> to place.
					{/if}
					<Kbd>Esc</Kbd> to stop.
				</span>
			{/if}
			{#if vab.notice}
				<span class="chip warn" role="alert"><Icon name="alert" size={16} />{vab.notice}</span>
			{/if}
		</div>
	</div>
	<div class="right">
		<div class="capsule files" role="toolbar" aria-label="Vessel file">
			<IconButton
				icon="plus"
				label="New vessel"
				onclick={() => vab.newVessel()}
				disabled={vab.editor.design.parts.length === 0 && vab.editor.loose.length === 0}
			/>
			<IconButton icon="open" label="Open a saved vessel" onclick={() => vab.openLibrary()} />
			<IconButton
				icon="save"
				label="Save to the library"
				hint="Ctrl+S"
				disabled={vab.editor.design.parts.length === 0}
				onclick={() => {
					vab.saveState = 'saving';
					void vab.flushSave();
				}}
			/>
			<span class="save" role="status">
				{vab.saveState === 'saving' ? 'Saving…' : vab.saveState === 'saved' ? 'Saved' : ''}
			</span>
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
			<IconButton
				icon="contrast"
				label="High-contrast markers"
				pressed={vab.highContrast}
				onclick={() => vab.toggleContrast()}
			/>
		</div>
		<button
			type="button"
			class="launch"
			disabled={vab.launchBlocked}
			title={vab.launchBlocked
				? vab.checks.find((c) => c.severity === 'error')?.text
				: vab.warnings > 0
					? `${vab.warnings} warning${vab.warnings === 1 ? '' : 's'}: you will be asked to confirm`
					: 'Fly this vessel'}
			onclick={(e) => vab.launch(false, e.shiftKey)}
		>
			<Icon name="launch" size={18} />
			Launch
		</button>
	</div>
</div>

<style>
	.top {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: var(--s-3);
		pointer-events: none;
	}
	.top > * {
		pointer-events: auto;
	}
	.center {
		pointer-events: none;
	}
	.center :global(.context > *) {
		pointer-events: auto;
	}
	.left,
	.right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	/* refs: glass capsules, 44 high */
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
	.files {
		gap: 0.25rem;
		padding: 0 0.25rem;
	}
	.save {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.save:empty {
		display: none;
	}
	.launch {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 2.75rem;
		padding: 0 1.25rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--selected-bg);
		color: var(--selected-fg);
		font: inherit;
		font-size: var(--t-button);
		font-weight: 700;
		cursor: pointer;
	}
	.launch:hover:not(:disabled) {
		background: var(--text-primary);
	}
	.launch:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 3px;
	}
	.launch:disabled {
		background: var(--surface-button);
		color: var(--text-disabled);
		cursor: default;
	}
	.center {
		display: flex;
		justify-content: center;
		min-width: 0;
	}
	.context {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--s-2);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		min-height: 2.25rem;
		padding: 0 0.875rem;
		font-size: var(--t-small);
		color: var(--text-body);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.chip.warn {
		color: var(--warn);
	}
	.dim {
		color: var(--text-muted);
	}
	.hintline {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-1);
		padding: 0.25rem 0.75rem;
		font-size: var(--t-label);
		color: var(--text-muted);
		background: var(--surface-glass);
		border-radius: var(--radius-pill);
	}
	.drawer-btns {
		display: none;
	}
	@media (max-width: 899px) {
		.drawer-btns {
			display: inline-flex;
		}
		.cap,
		.save {
			display: none;
		}
		.name input {
			width: 9rem;
		}
	}
</style>
