<script lang="ts">
	/**
	 * The menu bar, top right (BASE_LAYOUT §3, `Base.dc.html`): the page's actions, then the fixed
	 * group (Vessel, Map, Space Center, VAB) with a white icon and a 4 px dot on the active one,
	 * then Menu. The first rule shows only with page actions.
	 */
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { FIXED_GROUP, SHELL_ICONS, type FixedId } from './shell-model';
	import type { PageAction } from './page-actions.svelte';

	let {
		actions = [],
		custom,
		active,
		map = null,
		onmenu,
		menuOpen = false
	}: {
		actions?: readonly PageAction[];
		/** A page's own buttons (the Hangar's), before the fixed group. */
		custom?: Snippet;
		active: FixedId | null;
		/** Flight's map view: Vessel and Map switch it instead of navigating. */
		map?: { on: boolean; toggle: () => void } | null;
		onmenu: () => void;
		menuOpen?: boolean;
	} = $props();

	const hrefs: Record<FixedId, string> = {
		vessel: resolve('/(world)/flight'),
		map: resolve('/(world)/flight'),
		spacecenter: resolve('/(world)/space-center'),
		vab: resolve('/(world)/vab')
	};
	const testids: Record<FixedId, string> = {
		vessel: 'nav-vessel',
		map: 'nav-map',
		spacecenter: 'nav-space-center',
		vab: 'nav-vab'
	};
	function onfixed(e: MouseEvent, id: FixedId): void {
		if (!map || (id !== 'vessel' && id !== 'map')) return;
		e.preventDefault();
		if ((id === 'map') !== map.on) map.toggle();
	}
</script>

<nav class="bar menu" aria-label="World menu" data-testid="menu-bar">
	{#if actions.length > 0 || custom}
		{#each actions as a (a.id)}
			<button
				type="button"
				class="mb"
				class:on={a.on === true}
				class:primary={a.primary === true}
				aria-label={a.label}
				aria-pressed={a.on}
				data-tip={a.title ?? a.label}
				disabled={a.disabled}
				data-testid={a.testid}
				onclick={a.onclick}
			>
				<svg
					aria-hidden="true"
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.7"
					stroke-linejoin="round"
					stroke-linecap="round"><path d={SHELL_ICONS[a.icon]} /></svg
				>
				<span class="dot" aria-hidden="true"></span>
			</button>
		{/each}
		{#if custom}<div class="custom">{@render custom()}</div>{/if}
		<div class="rule" aria-hidden="true"></div>
	{/if}
	{#each FIXED_GROUP as f (f.id)}
		<a
			class="mb"
			class:on={active === f.id}
			href={hrefs[f.id]}
			aria-label={f.label}
			aria-current={active === f.id ? 'page' : undefined}
			data-tip={f.label}
			data-testid={testids[f.id]}
			onclick={(e) => onfixed(e, f.id)}
		>
			<svg
				aria-hidden="true"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.7"
				stroke-linejoin="round"
				stroke-linecap="round"><path d={SHELL_ICONS[f.icon]} /></svg
			>
			<span class="dot" aria-hidden="true"></span>
		</a>
	{/each}
	<div class="rule" aria-hidden="true"></div>
	<button
		type="button"
		class="mb menu-btn"
		aria-label="Menu"
		data-tip="Menu"
		aria-expanded={menuOpen}
		data-testid="nav-menu"
		onclick={onmenu}
	>
		<svg
			aria-hidden="true"
			width="18"
			height="18"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.7"
			stroke-linecap="round"><path d={SHELL_ICONS.menu} /></svg
		>
	</button>
</nav>

<style>
	.bar {
		position: fixed;
		z-index: 40;
		right: calc(1.5rem + var(--safe-right));
		top: calc(1.5rem + var(--safe-top));
		display: flex;
		align-items: center;
		gap: 0.25rem;
		height: 2.75rem;
		box-sizing: border-box;
		padding: 0.25rem;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: 999px;
	}
	.mb {
		position: relative;
		width: 2.25rem;
		height: 2.25rem;
		flex: none;
		border-radius: 50%;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: transparent;
		color: #8b8b93;
		cursor: pointer;
		text-decoration: none;
	}
	.mb svg {
		width: 1.125rem;
		height: 1.125rem;
	}
	.mb:hover:not(:disabled) {
		background: rgb(255 255 255 / 0.06);
	}
	.mb:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.mb.on {
		color: #fff;
	}
	.menu-btn {
		color: #e4e4e7;
	}
	.dot {
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
		background: transparent;
	}
	.mb.primary:not(:disabled) {
		color: #fff;
		background: rgb(92 207 255 / 0.18);
	}
	.mb.on .dot {
		background: #fff;
	}
	.custom {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.rule {
		width: 1px;
		height: 1.125rem;
		margin: 0 2px;
		background: rgb(255 255 255 / 0.12);
	}
</style>
