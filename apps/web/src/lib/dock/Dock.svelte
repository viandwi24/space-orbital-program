<script lang="ts">
	/**
	 * The flight dock (plan 112, ADR 0149 point 6; refs Main "Dock kiri"): a rail of panels, one open
	 * beside it, and the Panel library at the foot of the rail. The page draws each panel's body.
	 */
	import type { Snippet } from 'svelte';
	import type { CategoryIcon } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import { REGIONS, clampSpan } from '../layout/regions';
	import { settings } from '../settings/settings.svelte';

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
		{#each entries as e (e.id)}
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
					size={18}
				/>
				<span class="dot" aria-hidden="true"></span>
			</button>
		{/each}
		<button
			type="button"
			class="tab lib"
			aria-label="Panel library"
			data-tip="Panel library"
			data-testid="dock-library"
			onclick={onlibrary}><Icon name="plus" size={18} /></button
		>
	</div>
	{#if shown}
		<div class="open" role="tabpanel" aria-label={shown.title}>
			{@render body(shown.id)}
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
		</div>
	{/if}
</div>

<style>
	/* the dock shrinks inside the left stack (which stops above the deck); the open panel scrolls */
	.dock {
		display: flex;
		flex: 0 1 auto;
		align-items: flex-start;
		gap: 0.5rem;
		min-height: 0;
	}
	/* the rail is as tall as its tabs (plan 256: it used to stretch with a tall panel beside it) and
	   scrolls only when the left stack is shorter than that */
	.rail {
		align-self: flex-start;
		max-height: 100%;
		min-height: 0;
		overflow-y: auto;
		scrollbar-width: none;
		display: flex;
		flex: none;
		flex-direction: column;
		gap: 2px;
		padding: 0.25rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
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
		background: var(--surface-tile);
		color: var(--text-primary);
	}
	.tab:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: -2px;
	}
	.dot {
		position: absolute;
		right: 1px;
		top: 50%;
		width: var(--dot);
		height: var(--dot);
		margin-top: calc(var(--dot) / -2);
		border-radius: 50%;
	}
	.tab[aria-selected='true'] .dot {
		background: var(--text-primary);
	}
	.lib {
		margin-top: 0.25rem;
		border-top: 1px solid var(--border-divider);
		border-radius: 0 0 50% 50%;
	}
	.dock.right {
		flex-direction: row-reverse;
	}
	/* host and mod panels take the dock region's default width (280 px at 100 %, plan 215); the script editor sets its own */
	.open > :global(*) {
		flex: 0 1 auto;
		min-height: 0;
		overflow-y: auto;
	}
	.open > :global(.panel) {
		width: var(--dock-w, 17.5rem);
	}
	.open {
		position: relative;
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
	/* a column whose child shrinks and scrolls itself, so its box is what shows */
	.open {
		align-self: stretch;
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		scrollbar-width: thin;
	}
</style>
