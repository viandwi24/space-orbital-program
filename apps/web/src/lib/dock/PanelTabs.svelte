<script lang="ts">
	/**
	 * A panel's tabs (ADR 0287 point 1): a v3 tab strip and the open tab's nodes. Which tab is open
	 * is this component's state; when the panel's `active` tab changes (a program was engaged) it opens.
	 */
	import { setContext } from 'svelte';
	import PanelView from './PanelView.svelte';
	import { OPEN_TAB } from './evaluate';
	import type { ShownNode } from './evaluate';

	type Tabs = Extract<ShownNode, { kind: 'tabs' }>;
	let {
		node,
		onaction
	}: {
		node: Tabs;
		onaction: (path: string, on?: boolean | string | number) => void;
	} = $props();

	let chosen = $state<string | null>(null);
	// a notice's button inside these tabs opens one of them (ADR 0288)
	setContext(OPEN_TAB, (id: string) => {
		if (node.tabs.some((t) => t.id === id)) chosen = id;
	});
	let lastActive: string | null = null;
	$effect(() => {
		const a = node.active;
		if (a !== null && a !== lastActive) chosen = a;
		lastActive = a;
	});
	// the player's choice, else the engaged program's tab, else the first
	const open = $derived(
		node.tabs.find((t) => t.id === chosen) ??
			node.tabs.find((t) => t.id === node.active) ??
			node.tabs[0]!
	);
	const index = $derived(node.tabs.indexOf(open));

	function key(e: KeyboardEvent, i: number): void {
		const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		e.preventDefault();
		const next = node.tabs[(i + step + node.tabs.length) % node.tabs.length]!;
		chosen = next.id;
		queueMicrotask(() =>
			(e.currentTarget as HTMLElement | null)?.parentElement
				?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)
				?.focus()
		);
	}
</script>

<div class="tabs">
	<div class="strip" role="tablist" aria-label={node.label} data-testid="panel-tabs-{node.path}">
		{#each node.tabs as t, i (t.id)}
			<button
				type="button"
				role="tab"
				id="tab-{node.path}-{t.id}"
				aria-selected={t.id === open.id}
				aria-controls="tabpanel-{node.path}"
				tabindex={t.id === open.id ? 0 : -1}
				data-tab={t.id}
				class:on={t.id === open.id}
				class:live={t.id === node.active}
				onclick={() => (chosen = t.id)}
				onkeydown={(e) => key(e, i)}
				>{t.label}{#if t.badge}<span class="badge">{t.badge}</span>{/if}</button
			>
		{/each}
	</div>
	<div
		class="page"
		role="tabpanel"
		id="tabpanel-{node.path}"
		aria-labelledby="tab-{node.path}-{open.id}"
		data-testid="panel-tab-{open.id}"
	>
		{#each open.children as child, i (`${index}.${i}`)}
			<PanelView node={child} {onaction} />
		{/each}
	</div>
</div>

<style>
	.tabs {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.5rem;
	}
	/* v3 Segmented / tabs: a pill track with padding 4; the open tab is the selected white */
	.strip {
		display: flex;
		gap: 0.125rem;
		padding: 0.25rem;
		border-radius: var(--radius-pill);
		background: var(--surface-button);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.strip::-webkit-scrollbar {
		display: none;
	}
	button {
		position: relative;
		flex: 1 1 auto;
		min-width: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		min-height: 1.75rem;
		padding: 0 0.3rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-label);
		font-weight: 700;
		cursor: pointer;
		white-space: nowrap;
	}
	button:hover {
		color: var(--text-primary);
	}
	button:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	button.on {
		color: var(--selected-fg);
		background: var(--selected-bg);
	}
	/* the engaged program: an accent dot under the label (v3 flat active indicator) */
	button.live::after {
		content: '';
		position: absolute;
		bottom: 2px;
		left: 50%;
		width: var(--dot, 4px);
		height: var(--dot, 4px);
		margin-left: calc(var(--dot, 4px) / -2);
		border-radius: 50%;
		background: var(--accent);
	}
	.badge {
		padding: 0 0.3rem;
		border-radius: var(--radius-pill);
		background: var(--accent);
		color: var(--on-accent);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		line-height: 1.4;
	}
	.page {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.375rem;
		align-content: start;
	}
</style>
