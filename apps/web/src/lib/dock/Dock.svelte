<script lang="ts">
	/**
	 * The flight dock (plan 112, ADR 0149 point 6; v3 since plan 272, ADR 0253): one glass box with a
	 * rail grouped as Vessel · Flight · Plugins, the open panel beside it, and the Panel library at the
	 * foot of the rail. The page draws each panel's body; the box gives it the close button.
	 */
	import type { Snippet } from 'svelte';
	import type { CategoryIcon } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import { REGIONS, clampSpan } from '../layout/regions';
	import { settings } from '../settings/settings.svelte';
	import { railGroups } from './dock-model';

	let {
		entries,
		open,
		ontoggle,
		onlibrary,
		body,
		side = 'left',
		width,
		onresize
	}: {
		entries: readonly { id: string; title: string; icon: CategoryIcon }[];
		open: string | null;
		ontoggle: (id: string) => void;
		onlibrary: () => void;
		body: Snippet<[string]>;
		/** On narrow screens the dock stands at the right, its rail on the edge (plan 112). */
		side?: 'left' | 'right';
		/** The open panel's width, px at 100 % (260 to 400, plan 250); absent: the default. */
		width?: number;
		/** Dragged at the panel's free edge. */
		onresize?: (width: number) => void;
	} = $props();

	const shown = $derived(entries.find((e) => e.id === open) ?? null);
	const groups = $derived(railGroups(entries));
	const GROUP_NAMES = { vessel: 'Vessel', flight: 'Flight', plugins: 'Plugins' } as const;

	function startResize(e: PointerEvent): void {
		if (!onresize) return;
		const grip = e.currentTarget as HTMLElement;
		grip.setPointerCapture(e.pointerId);
		const startX = e.clientX;
		const start = width ?? REGIONS.dock.default;
		const sign = side === 'left' ? 1 : -1;
		const move = (m: PointerEvent): void =>
			onresize(clampSpan(REGIONS.dock, start + (sign * (m.clientX - startX)) / uiScale()));
		const up = (): void => {
			grip.removeEventListener('pointermove', move);
			grip.removeEventListener('pointerup', up);
		};
		grip.addEventListener('pointermove', move);
		grip.addEventListener('pointerup', up);
	}
	const uiScale = (): number => settings.ui.scale;
</script>

<div
	class="dock"
	class:right={side === 'right'}
	style:--dock-w={width === undefined ? undefined : `${width / 16}rem`}
	data-testid="dock"
>
	<div class="rail" role="tablist" aria-orientation="vertical" aria-label="Panels">
		{#each groups as g, gi (g.group)}
			{#if gi > 0}<span class="rule" aria-hidden="true"></span>{/if}
			<div class="group" role="group" aria-label={GROUP_NAMES[g.group]}>
				{#each g.entries as e (e.id)}
					<button
						type="button"
						role="tab"
						class="tab"
						aria-selected={open === e.id}
						aria-label={e.title}
						data-tip={e.title}
						data-testid="dock-tab-{e.id}"
						onclick={() => ontoggle(e.id)}
					>
						<Icon
							name={typeof e.icon === 'string' ? e.icon : undefined}
							path={typeof e.icon === 'string' ? undefined : e.icon.path}
							size={17}
						/>
						<span class="dot" aria-hidden="true"></span>
					</button>
				{/each}
			</div>
		{/each}
		<span class="rule" aria-hidden="true"></span>
		<button
			type="button"
			class="tab lib"
			aria-label="Panel library"
			data-tip="Add or remove panels"
			data-testid="dock-library"
			onclick={onlibrary}><Icon name="plus" size={17} /></button
		>
	</div>
	{#if shown}
		<div class="open" role="tabpanel" aria-label={shown.title}>
			<button
				type="button"
				class="close"
				aria-label="Close panel"
				data-tip="Close panel"
				data-testid="dock-close"
				onclick={() => ontoggle(shown.id)}
				><svg viewBox="0 0 24 24" width="10" height="10" aria-hidden="true"
					><path d="M6 6 L18 18 M18 6 L6 18" /></svg
				></button
			>
			{@render body(shown.id)}
		</div>
		{#if onresize}
			<!-- drag to resize, 260 to 400 px (plan 250, rancangan §7.5) -->
			<div
				class="grip"
				class:edge-right={side === 'left'}
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize the panel"
				data-testid="dock-grip"
				onpointerdown={startResize}
			></div>
		{/if}
	{/if}
</div>

<style>
	/* V3 §2.3: rail and panel are one glass box, radius 16; the dock shrinks inside the left stack
	   (which stops above the deck on narrow screens) and the open panel scrolls */
	.dock {
		position: relative;
		display: flex;
		flex: 0 1 auto;
		align-items: stretch;
		min-height: 0;
		max-height: 100%;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	/* the rail is as tall as its tabs and scrolls only when the stack is shorter than that */
	.rail {
		align-self: flex-start;
		max-height: 100%;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: none;
		display: flex;
		flex: none;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 0.25rem;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rule {
		flex: none;
		width: 1.125rem;
		height: 1px;
		margin: 0.25rem 0;
		background: var(--border-rule, rgb(255 255 255 / 0.12));
	}
	.tab {
		position: relative;
		flex: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.25rem;
		height: 2.25rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}
	.tab:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.tab[aria-selected='true'] {
		color: var(--text-primary);
	}
	.tab:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: -2px;
	}
	.dot {
		position: absolute;
		right: 0;
		top: 50%;
		width: var(--dot);
		height: var(--dot);
		margin-top: calc(var(--dot) / -2);
		border-radius: 50%;
	}
	.tab[aria-selected='true'] .dot {
		background: var(--text-primary);
	}
	.dock.right {
		flex-direction: row-reverse;
	}
	/* the open panel: 272 px by default (V3 §2.3), up to 860 px tall, then it scrolls */
	.open {
		position: relative;
		align-self: stretch;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		max-height: 53.75rem;
		overflow-y: auto;
		scrollbar-width: thin;
		padding: 0.625rem 0.75rem 0.75rem;
		border-left: 1px solid var(--border-divider);
	}
	.dock.right .open {
		border-left: 0;
		border-right: 1px solid var(--border-divider);
	}
	.open > :global(*) {
		flex: 0 0 auto;
	}
	/* a host or mod panel inside the box is flat: the box is its glass; its header is the v3 header
	   (9/700 caps, the aside as a sub-title beside it, room for the close button) */
	.open > :global(.panel) {
		width: calc(var(--dock-w, 17rem) - 1.5rem);
		padding: 0;
		background: none;
		border: 0;
		border-radius: 0;
		-webkit-backdrop-filter: none;
		backdrop-filter: none;
	}
	.open > :global(.panel > header) {
		justify-content: flex-start;
		align-items: center;
		gap: 0.375rem;
		min-height: 1.625rem;
		margin-bottom: 0.5rem;
		padding-right: 1.75rem;
	}
	.open > :global(.panel > header h2) {
		font-size: var(--t-label);
		letter-spacing: 0.14em;
		color: var(--text-secondary);
	}
	.open > :global(.panel > header .aside) {
		font-size: var(--t-small);
		color: var(--text-muted);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.close {
		position: absolute;
		top: 0.6875rem;
		right: 0.625rem;
		z-index: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}
	.close svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 2.6;
		stroke-linecap: round;
	}
	.close:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.close:focus-visible {
		outline: 2px solid var(--text-primary);
	}
	.grip {
		position: absolute;
		top: 0;
		bottom: 0;
		left: -0.375rem;
		width: 0.75rem;
		cursor: ew-resize;
		z-index: 1;
	}
	.grip.edge-right {
		left: auto;
		right: -0.375rem;
	}
</style>
