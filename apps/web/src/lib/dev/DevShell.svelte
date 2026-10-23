<script lang="ts" module>
	import type { Snippet } from 'svelte';

	/** What a developer page adds to the shell's bar: its own buttons, right of the tabs. */
	export const devBar = $state<{ actions: Snippet | null }>({ actions: null });
</script>

<script lang="ts">
	/**
	 * The frame of every developer page (plan 375): a bar with Back, Main menu and the tabs between
	 * the tools, and the page below it. Tools that are a 3D view (Parts, Crew, Hangar) fill the area
	 * under the bar; the others scroll in a column over the menu's space backdrop.
	 */
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import BackButton from '../ui/BackButton.svelte';
	import SpaceBackdrop from '../ui/SpaceBackdrop.svelte';
	import { devHref } from './href';
	import { devTabOf, shownTabs } from './tabs';

	let { children }: { children: Snippet } = $props();

	const tab = $derived(devTabOf(page.url.pathname));
	const full = $derived(tab?.full === true);
	const overview = $derived(tab?.id === 'overview');
</script>

<div class="dev" class:full data-testid="dev-shell">
	<header class="bar">
		<BackButton
			href={overview ? resolve('/') : resolve('/developer')}
			label={overview ? 'Back to the main menu' : 'Back to Developer'}
			testid="dev-back"
		/>
		<a class="menu" href={resolve('/')} data-testid="dev-main-menu">Main menu</a>
		<nav aria-label="Developer tools">
			{#each shownTabs() as t (t.id)}
				<a
					href={devHref(t.path)}
					aria-current={tab?.id === t.id ? 'page' : undefined}
					data-testid="dev-tab-{t.id}">{t.label}</a
				>
			{/each}
		</nav>
		<div class="actions">
			{#if devBar.actions}{@render devBar.actions()}{/if}
		</div>
	</header>
	{#if full}
		<div class="tool">{@render children()}</div>
	{:else}
		<SpaceBackdrop />
		<main class="doc">{@render children()}</main>
	{/if}
</div>

<style>
	.dev {
		--dev-bar: 3.5rem;
		position: relative;
		min-height: 100vh;
		min-height: 100dvh;
		color: var(--text-body);
	}
	.dev.full {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: var(--bg-hangar);
	}
	.bar {
		position: fixed;
		inset: 0 0 auto;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		height: var(--dev-bar);
		padding: 0 1rem;
		box-sizing: border-box;
		background: rgb(10 11 13 / 0.82);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border-bottom: 1px solid var(--border-subtle);
	}
	.bar :global(.back) {
		width: var(--round-btn);
		height: var(--round-btn);
	}
	.menu {
		color: var(--text-muted);
		font-size: var(--t-button);
		text-decoration: none;
		white-space: nowrap;
	}
	.menu:hover {
		color: var(--text-primary);
	}
	nav {
		display: flex;
		gap: 2px;
		margin-left: 0.5rem;
		padding: 3px;
		border-radius: var(--radius-pill);
		background: var(--surface-inset);
		overflow-x: auto;
		scrollbar-width: none;
	}
	nav a {
		padding: 0.35rem 0.8rem;
		border-radius: var(--radius-pill);
		color: var(--text-muted);
		font-size: var(--t-button);
		font-weight: 500;
		text-decoration: none;
		white-space: nowrap;
	}
	nav a:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	nav a[aria-current='page'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-left: auto;
	}
	.tool {
		position: absolute;
		inset: var(--dev-bar) 0 0;
		overflow: hidden;
	}
	.doc {
		position: relative;
		max-width: 60rem;
		margin: 0 auto;
		padding: calc(var(--dev-bar) + 2rem) 1.5rem 3rem;
		box-sizing: border-box;
	}
	@media (max-width: 720px) {
		.menu {
			display: none;
		}
	}
</style>
