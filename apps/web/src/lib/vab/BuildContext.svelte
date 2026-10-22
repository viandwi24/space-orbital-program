<script lang="ts">
	/**
	 * What the Hangar is doing now, over the top of the view (plan 238): the part being placed with
	 * its key hints, and the last refusal. A chip, not a bar: the shell's menu bar is the only bar.
	 */
	import Icon from '../ui/Icon.svelte';
	import Kbd from '../ui/Kbd.svelte';
	import type { VabController } from './controller.svelte';
	import { settings } from '../settings/settings.svelte';
	import type { ActionId } from '../keybindings';

	let { vab }: { vab: VabController } = $props();
	const key = (id: ActionId): string => settings.keymap.label(id);
</script>

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
				Click a part. <Kbd>Alt</Kbd> frees the angle; <Kbd>{key('nextPart')}</Kbd> selects a part and
				<Kbd>{key('place')}</Kbd> picks it. Copies follow a symmetric group.
			{:else if vab.targets.length === 0}
				Nowhere to attach this.
			{:else if vab.radialCapable}
				Click a ring or any face of a part; <Kbd>Alt</Kbd> keeps to the rings. <Kbd
					>{key('turnPlus')}</Kbd
				>
				<Kbd>{key('turnMinus')}</Kbd> turn the keyboard sites, <Kbd>{key('nextSite')}</Kbd> and
				<Kbd>{key('place')}</Kbd> place.
			{:else}
				Click a ring or any face of a part; <Kbd>Alt</Kbd> keeps to the rings. <Kbd
					>{key('nextSite')}</Kbd
				>
				to choose and <Kbd>{key('place')}</Kbd> to place.
			{/if}
			<Kbd>Esc</Kbd> or a right click to stop.
		</span>
	{/if}
	{#if !vab.armed && vab.tool === 'root'}
		<!-- the Root tool (plan 348) -->
		<span class="chip live" data-testid="tool-context">
			Root: click a part of the stack to make it the root of the vessel
		</span>
	{:else if !vab.armed && vab.tool !== 'place'}
		<span class="chip live" data-testid="tool-context">
			<Icon name={vab.tool === 'move' ? 'move' : 'rotate'} size={16} />
			{#if vab.toolTarget === null}
				{vab.tool === 'move' ? 'Move' : 'Rotate'}: select a part attached to the vessel
			{:else}
				{vab.tool === 'move' ? 'Moving' : 'Rotating'}
				<strong>{vab.titleOfPart(vab.toolTarget)}</strong>
				<span class="dim">({vab.toolFrame} axes{vab.freePlacement ? ', free mode' : ''})</span>
			{/if}
		</span>
		{#if vab.toolTarget !== null}
			<span class="hintline">
				Drag an {vab.tool === 'move' ? 'arrow' : 'ring'}, or
				<Kbd>{key('toolUp')}</Kbd><Kbd>{key('toolDown')}</Kbd>
				<Kbd>{key('toolLeft')}</Kbd><Kbd>{key('toolRight')}</Kbd>
				<Kbd>{key('toolFore')}</Kbd><Kbd>{key('toolAft')}</Kbd>
				{vab.tool === 'move' ? '0.1 m' : '15°'} (<Kbd>Shift</Kbd>
				{vab.tool === 'move' ? '0.01 m' : '5°'}); <Kbd>{key('toolFrame')}</Kbd> axes,
				<Kbd>{key('toolReset')}</Kbd> reset, <Kbd>{key('toolPlace')}</Kbd> done.
			</span>
		{/if}
	{/if}
	{#if vab.notice}
		<span class="chip warn" role="alert"><Icon name="alert" size={16} />{vab.notice}</span>
	{/if}
</div>

<style>
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
	.context > :global(*) {
		pointer-events: auto;
	}
</style>
