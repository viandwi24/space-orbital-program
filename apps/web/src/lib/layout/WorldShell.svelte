<script lang="ts">
	/**
	 * The Base layout's bars (plan 204, ADR 0201 points 2 and 3): the time bar with the world clock
	 * and the warp, the menu bar (the page's actions, then Flight, Mission Center, Space Center, Home
	 * and the menu), and the status bar (world, place, funds, science, reputation, contracts, the
	 * autosave age, mods and the bell). The page sits between the two bars.
	 */
	import type { Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { Snapshot } from '@orbital/core';
	import Icon from '../ui/Icon.svelte';
	import { savedAgo, statusItems, type BellFeed } from './status-bar';

	let {
		snapshot,
		warp,
		clock,
		world,
		place,
		savedAt,
		mods,
		bell,
		onmenu,
		onhome,
		clockChip = null,
		paused = false,
		pauseLocked = false,
		placePaused = false,
		onpause,
		onplace,
		actions,
		children
	}: {
		snapshot: Snapshot | null;
		warp: number;
		/** The world date and time, formatted by the layout. */
		clock: string;
		world: { name: string; mode: string };
		/** Where the player is: `Space Center`, `Flight`, ... */
		place: string;
		savedAt: number | null;
		mods: number;
		bell: BellFeed;
		onmenu: () => void;
		/** Leave the world (the sim stops). */
		onhome: () => void;
		/** The clock's chip (plan 205): `PAUSED`, `PAUSED · HANGAR`, `LOCKED`, `BACKGROUND`, or null. */
		clockChip?: string | null;
		/** The player's pause is on. */
		paused?: boolean;
		/** The world's rule forbids pausing (Hardcore). */
		pauseLocked?: boolean;
		/** This place pauses the clock by the player's choice. */
		placePaused?: boolean;
		onpause?: () => void;
		/** Switch whether this place pauses the clock. */
		onplace?: () => void;
		/** The page's own actions (Hangar: New · Open · Save · Launch). */
		actions?: Snippet;
		children: Snippet;
	} = $props();

	const items = $derived(statusItems(snapshot));
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	let bellOpen = $state(false);
	let bellVersion = $state(0);
	$effect(() => bell.subscribe(() => (bellVersion += 1)));
	const unread = $derived.by(() => {
		void bellVersion;
		return bell.unread;
	});
	const entries = $derived.by(() => {
		void bellVersion;
		return bell.entries;
	});
</script>

<div class="shell">
	<header class="top" data-testid="time-bar">
		<div class="clock">
			<span class="num" data-testid="world-clock" data-t={snapshot?.t ?? 0}>{clock}</span>
			<span class="warp num" data-testid="world-warp">{warp}×</span>
			{#if onpause}
				<button
					type="button"
					class="mb"
					data-testid="time-pause"
					aria-label={pauseLocked ? 'Pause is locked in this world' : paused ? 'Resume' : 'Pause'}
					aria-pressed={paused}
					title={pauseLocked ? 'This world does not allow pausing' : 'Pause or resume (P)'}
					disabled={pauseLocked}
					onclick={onpause}><Icon name={paused ? 'play' : 'pause'} size={15} /></button
				>
			{/if}
			{#if clockChip}<span class="chip" data-testid="time-chip">{clockChip}</span>{/if}
			{#if onplace && place}
				<button
					type="button"
					class="place"
					data-testid="time-place"
					aria-pressed={placePaused}
					title="Whether the clock pauses in {place} (Settings → Time)"
					onclick={onplace}>{placePaused ? `${place} pauses` : `${place} runs`}</button
				>
			{/if}
		</div>
		<nav class="menu" aria-label="World menu" data-testid="menu-bar">
			{#if actions}<div class="actions">{@render actions()}</div>{/if}
			<a
				class="mb"
				href={resolve('/(world)/flight')}
				data-testid="nav-flight"
				aria-label="Flight"
				title="Flight"><Icon name="launch" size={17} /></a
			>
			<a
				class="mb"
				href={resolve('/(world)/mission-center')}
				data-testid="nav-mission-center"
				aria-label="Mission Center"
				title="Mission Center"><Icon name="map" size={17} /></a
			>
			<a
				class="mb"
				href={resolve('/(world)/space-center')}
				data-testid="nav-space-center"
				aria-label="Space Center"
				title="Space Center"><Icon name="hangar" size={17} /></a
			>
			<button
				type="button"
				class="mb"
				data-testid="nav-home"
				aria-label="Home"
				title="Home"
				onclick={onhome}><Icon name="home" size={17} /></button
			>
			<button
				type="button"
				class="mb"
				data-testid="nav-menu"
				aria-label="Menu"
				title="Menu"
				onclick={onmenu}><Icon name="menu" size={17} /></button
			>
		</nav>
	</header>

	<div class="page">{@render children()}</div>

	<footer class="status" data-testid="status-bar">
		<span class="cell strong">{world.name}</span>
		<span class="cell dim">{world.mode}</span>
		<span class="cell">{place}</span>
		<span class="grow"></span>
		{#if items.funds !== null}<span class="cell" data-testid="hud-funds"
				>Funds <b class="num">{items.funds}</b></span
			>{/if}
		{#if items.science !== null}<span class="cell" data-testid="status-science"
				>Science <b class="num">{items.science}</b></span
			>{/if}
		{#if items.reputation !== null}<span class="cell" data-testid="status-reputation"
				>Rep <b class="num">{items.reputation}</b></span
			>{/if}
		{#if items.contracts !== null}<span class="cell"
				>Contracts <b class="num">{items.contracts}</b></span
			>{/if}
		<span class="cell dim" data-testid="status-saved">{savedAgo(savedAt, now)}</span>
		{#if mods > 0}<span class="cell dim">{mods} mod{mods === 1 ? '' : 's'}</span>{/if}
		<button
			type="button"
			class="bell"
			data-testid="status-bell"
			aria-label="Notifications{unread ? `, ${unread} unread` : ''}"
			onclick={() => {
				bellOpen = !bellOpen;
				if (!bellOpen) bell.markAllRead();
			}}
			>🔔{#if unread > 0}<span class="badge num">{unread}</span>{/if}</button
		>
		{#if bellOpen}
			<div class="feed" role="log" aria-label="Notifications" data-testid="bell-feed">
				{#each entries as e (e.id)}
					<p class:unread={!e.read}>{e.text}</p>
				{:else}
					<p class="dim">Nothing new.</p>
				{/each}
			</div>
		{/if}
	</footer>
</div>

<style>
	.shell {
		--shell-top: 2.25rem;
		--shell-bottom: 1.5rem;
	}
	.top,
	.status {
		position: fixed;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		align-items: center;
		gap: var(--s-3);
		padding: 0 var(--s-3);
		box-sizing: border-box;
		background: var(--surface-solid);
		border-color: var(--border-subtle);
		color: var(--text-body);
		font-size: var(--t-small);
	}
	.top {
		top: 0;
		height: var(--shell-top);
		border-bottom: 1px solid var(--border-subtle);
		justify-content: space-between;
	}
	.status {
		bottom: 0;
		height: var(--shell-bottom);
		border-top: 1px solid var(--border-subtle);
	}
	.page {
		position: fixed;
		top: var(--shell-top);
		bottom: var(--shell-bottom);
		left: 0;
		right: 0;
		overflow: auto;
		/* the containing block of the pages' own `position: fixed` roots: they fill this box */
		contain: layout;
	}
	.clock {
		display: flex;
		align-items: baseline;
		gap: var(--s-3);
		color: var(--text-primary);
		font-weight: 600;
	}
	.warp {
		color: var(--text-muted);
	}
	.chip {
		padding: 0 0.5rem;
		border-radius: var(--radius-pill);
		background: var(--surface-chip);
		color: var(--text-primary);
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: 0.08em;
	}
	.place {
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--t-label);
		padding: 0 0.5rem;
		cursor: pointer;
	}
	.menu,
	.actions {
		display: flex;
		align-items: center;
		gap: var(--s-1);
	}
	.actions {
		margin-right: var(--s-3);
	}
	.mb {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.875rem;
		height: 1.875rem;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		text-decoration: none;
	}
	.mb:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.mb:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.cell b {
		color: var(--text-primary);
		font-weight: 600;
	}
	.strong {
		color: var(--text-primary);
		font-weight: 600;
	}
	.dim {
		color: var(--text-muted);
	}
	.grow {
		flex: 1;
	}
	.bell {
		position: relative;
		border: 0;
		background: transparent;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.badge {
		position: absolute;
		top: -0.3rem;
		right: -0.5rem;
		min-width: 1rem;
		padding: 0 0.2rem;
		border-radius: var(--radius-pill);
		background: var(--c-accent);
		color: var(--c-ink);
		font-size: 0.65rem;
	}
	.feed {
		position: fixed;
		right: var(--s-3);
		bottom: calc(var(--shell-bottom) + var(--s-2));
		width: min(22rem, calc(100vw - 2rem));
		max-height: 50vh;
		overflow: auto;
		padding: var(--s-2) var(--s-3);
		background: var(--surface-dialog);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		box-shadow: var(--shadow-overlay);
	}
	.feed p {
		margin: var(--s-1) 0;
	}
	.feed .unread {
		color: var(--text-primary);
	}
</style>
