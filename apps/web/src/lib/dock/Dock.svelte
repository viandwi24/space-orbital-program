<script lang="ts">
	/**
	 * The flight dock (plan 112, ADR 0149 point 6; refs Main "Dock kiri"): a rail of panels, one open
	 * beside it, and the Panel library at the foot of the rail. The page draws each panel's body.
	 */
	import type { Snippet } from 'svelte';
	import type { CategoryIcon } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';

	let {
		entries,
		open,
		ontoggle,
		onlibrary,
		body
	}: {
		entries: readonly { id: string; title: string; icon: CategoryIcon }[];
		open: string | null;
		ontoggle: (id: string) => void;
		onlibrary: () => void;
		body: Snippet<[string]>;
	} = $props();

	const shown = $derived(entries.find((e) => e.id === open) ?? null);
</script>

<div class="dock" data-testid="dock">
	<div class="rail" role="tablist" aria-orientation="vertical" aria-label="Panels">
		{#each entries as e (e.id)}
			<button
				type="button"
				role="tab"
				class="tab"
				aria-selected={open === e.id}
				aria-label={e.title}
				title={e.title}
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
			title="Panel library"
			data-testid="dock-library"
			onclick={onlibrary}><Icon name="plus" size={18} /></button
		>
	</div>
	{#if shown}
		<div class="open" role="tabpanel" aria-label={shown.title}>
			{@render body(shown.id)}
		</div>
	{/if}
</div>

<style>
	.dock {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		min-height: 0;
		max-height: 100%;
	}
	.rail {
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
		width: 4px;
		height: 4px;
		margin-top: -2px;
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
	/* host and mod panels keep the width of the old right column (16.5 rem); the script editor sets its own */
	.open > :global(.panel) {
		width: 16.5rem;
	}
	.open {
		min-width: 0;
		min-height: 0;
		max-height: 100%;
		overflow-y: auto;
		scrollbar-width: thin;
	}
</style>
