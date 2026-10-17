<script lang="ts">
	import Icon from '../ui/Icon.svelte';
	import IconButton from '../ui/IconButton.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import type { VabController } from './controller.svelte';
	import { settings } from '../settings/settings.svelte';
	import type { ActionId } from '../keybindings';

	let { vab }: { vab: VabController } = $props();
	const key = (id: ActionId): string => settings.keymap.label(id);
</script>

<div class="top">
	<div class="bar tools" role="toolbar" aria-label="Design">
		<a class="back" href="/" title="Back to the main page"><Icon name="back" /><span>Menu</span></a>
		<span class="sep"></span>
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
		<span class="sep"></span>
		<IconButton
			icon="plus"
			label="New vessel"
			onclick={() => vab.newVessel()}
			disabled={vab.editor.design.parts.length === 0 && vab.editor.loose.length === 0}
		/>
		<IconButton
			icon="open"
			label="Open a saved vessel"
			text="Open"
			onclick={() => vab.openLibrary()}
		/>
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
		<span class="save dim" role="status">
			{vab.saveState === 'saving' ? 'Saving…' : vab.saveState === 'saved' ? 'Saved' : ''}
		</span>
	</div>

	<div class="center">
		<label class="name">
			<span class="sr-only">Vessel name</span>
			<input
				value={vab.editor.design.name === vab.defaultName ? '' : vab.editor.design.name}
				placeholder="Name your vessel"
				maxlength="48"
				spellcheck="false"
				oninput={(e) => vab.setName(e.currentTarget.value)}
			/>
		</label>
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
					{:else}
						Moving <strong>{vab.titleOfPart(armed.index)}</strong>
						{#if vab.shown.followers.length > 0}<span class="dim"
								>and {vab.shown.followers.length} copies</span
							>{/if}
					{/if}
				</span>
				{#if armed.kind === 'new' || armed.kind === 'assembly'}
					<div class="sym" role="group" aria-label="Symmetry: copies per placement">
						<span class="dim">Symmetry <Kbd>{settings.keymap.label('symmetry')}</Kbd></span>
						{#each vab.symmetryCounts as n (n)}
							<button
								type="button"
								class:on={vab.symmetry === n}
								aria-pressed={vab.symmetry === n}
								title={n === 1 ? 'One part' : `${n} copies around the vessel`}
								onclick={() => (vab.symmetry = n)}>{n === 1 ? 'Off' : n}</button
							>
						{/each}
					</div>
				{/if}
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

	<div class="bar right">
		<span class="drawer-btns">
			<IconButton
				icon="part"
				label="Parts and sub-assemblies"
				text="Parts"
				pressed={vab.drawer === 'parts'}
				onclick={() => (vab.drawer = vab.drawer === 'parts' ? null : 'parts')}
			/>
			<IconButton
				icon="stage"
				label="Stages and launch checks"
				text="Stages"
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
</div>

<style>
	.top {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: minmax(0, var(--col-l)) 1fr minmax(0, var(--col-r));
		align-items: start;
		gap: var(--s-3);
		pointer-events: none;
	}
	.top > * {
		pointer-events: auto;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px var(--s-2);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
		justify-self: start;
	}
	.bar.right {
		justify-self: end;
	}
	.sep {
		width: 1px;
		height: 20px;
		margin: 0 var(--s-1);
		background: var(--line);
	}
	.save {
		min-width: 3.4em;
		padding: 0 var(--s-1);
		font-size: var(--t-xs);
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		height: 36px;
		padding: 0 var(--s-2);
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-dim);
		text-decoration: none;
		border-radius: var(--r-control);
	}
	.back:hover {
		color: var(--text);
	}
	.center {
		display: grid;
		justify-items: center;
		gap: var(--s-2);
		pointer-events: none;
		min-width: 0;
	}
	.center > * {
		pointer-events: auto;
	}
	.name input {
		width: min(420px, 42vw);
		height: 44px;
		padding: 0 var(--s-3);
		text-align: center;
		font-family: var(--font-ui);
		font-size: var(--t-xl);
		font-weight: 600;
		color: var(--text);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--r-control);
		text-shadow: 0 2px 14px var(--bg-void);
	}
	.name input::placeholder {
		color: var(--text-dim);
		font-weight: 500;
	}
	.name input:hover {
		border-color: var(--line);
	}
	.name input:focus {
		outline: none;
		background: var(--panel);
		border-color: var(--c-accent);
	}
	.context {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: var(--s-3);
		min-height: 40px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: var(--s-2);
		min-height: 36px;
		padding: 0 var(--s-3);
		font-size: var(--t-sm);
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px);
	}
	.chip.live {
		border-color: var(--c-accent);
	}
	.chip.warn {
		border-color: var(--c-warning);
	}
	.dim {
		color: var(--text-dim);
	}
	.sym {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		padding: 0 var(--s-2);
		min-height: 36px;
		font-size: var(--t-sm);
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px);
	}
	.sym .dim {
		margin-right: var(--s-2);
	}
	.sym button {
		min-width: 28px;
		height: 28px;
		padding: 0 var(--s-2);
		color: var(--text);
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--r-control);
		cursor: pointer;
		font: inherit;
	}
	.sym button:hover {
		background: var(--field);
	}
	.sym button.on {
		background: color-mix(in srgb, var(--c-accent) 28%, transparent);
		border-color: var(--c-accent);
	}
	.sym button:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 1px;
	}
	.hintline {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--s-1);
		padding: var(--s-1) var(--s-3);
		font-size: var(--t-sm);
		color: var(--text-dim);
		background: var(--panel);
		border-radius: var(--r-panel);
	}
	.drawer-btns {
		display: none;
	}
	@media (max-width: 899px) {
		.drawer-btns {
			display: inline-flex;
		}
		.top {
			grid-template-columns: auto minmax(0, 1fr) auto;
			gap: var(--s-2);
		}
		.back span,
		.save {
			display: none;
		}
		.name input {
			width: min(300px, 100%);
			font-size: var(--t-lg);
		}
	}
</style>
