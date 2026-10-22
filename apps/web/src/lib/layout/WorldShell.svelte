<script lang="ts">
	/**
	 * The Base layout (plan 204, ADR 0201 points 2 and 3; plan 233, ADR 0222 point 1, after
	 * `refs/space-orbital-program-ui-v2/docs/BASE_LAYOUT.md`): the time bar top left, the menu bar
	 * top right and the status bar along the bottom, over the page. A 3D page (Flight, the Space
	 * Center) fills the window under the bars; the others sit in the safe area (top 80, sides 24,
	 * bottom 56). The page puts its actions, its time and its location in `pageShell`.
	 */
	import type { Snippet } from 'svelte';
	import type { Snapshot } from '@orbital/core';
	import { WARP_STEPS } from '../warp';
	import TimeBar from './TimeBar.svelte';
	import MenuBar from './MenuBar.svelte';
	import StatusBar from './StatusBar.svelte';
	import { pageShell } from './page-actions.svelte';
	import { activeFixed, elapsedText, isImmersive, warpText } from './shell-model';
	import type { BellFeed } from './status-bar';

	let {
		snapshot,
		warp,
		path,
		calendar,
		date = '',
		world,
		system,
		place,
		home = '',
		focus = null,
		savedAt,
		mods,
		bell,
		programs,
		onsettings,
		onworldsettings,
		onhome,
		clockChip = null,
		paused = false,
		pauseLocked = false,
		onpause,
		warpSteps = WARP_STEPS,
		onwarp,
		onsave,
		onload,
		ondebug,
		onchip,
		children
	}: {
		snapshot: Snapshot | null;
		warp: number;
		/** The page's path inside the app (`/flight`). */
		path: string;
		/** Day and year lengths of the world calendar, s, for T+. */
		calendar: { day: number; year: number };
		/** The world date, the time's tooltip. */
		date?: string;
		world: { name: string; mode: string };
		system: string;
		/** Where the player is: `Space Center`, `Flight`, ... */
		place: string;
		/** The home body's name, after the place (`Space Center · Kerbin`). */
		home?: string;
		focus?: number | null;
		savedAt: number | null;
		mods: number;
		bell: BellFeed;
		/** The status bar's programs popover actions (plan 359). */
		programs?: import('../programs-model').ProgramActions;
		onsettings: () => void;
		/** World settings during play (plan 230). */
		onworldsettings?: () => void;
		/** Leave the world (the sim stops). */
		onhome: () => void;
		/** The clock's chip (plan 205): `PAUSED`, `PAUSED · HANGAR`, `LOCKED`, `BACKGROUND`, or null. */
		clockChip?: string | null;
		/** The clock stands (the player, the place or a menu). */
		paused?: boolean;
		pauseLocked?: boolean;
		onpause?: () => void;
		/** The world's warp levels, for pages that do not drive the warp themselves (plan 248). */
		warpSteps?: readonly number[];
		/** Ask the sim for a warp factor; it grants what the world allows. */
		onwarp?: (factor: number) => void;
		/** Save and Load in the menu (plan 248); Save is absent while there is nothing to save. */
		onsave?: () => void;
		onload?: () => void;
		/** Debug in the menu, where debug tools are allowed. */
		ondebug?: () => void;
		/** The clock chip toggles the place's pause (plan 248). */
		onchip?: () => void;
		children: Snippet;
	} = $props();

	const time = $derived(pageShell.time);
	const index = $derived(
		time?.index ?? warpSteps.reduce((at, step, i) => (step <= warp ? i : at), 0)
	);
	// A page that does not drive the warp (everything but Flight) gets the world's own: the sim
	// grants what the world allows, the limit comes from the snapshot (plan 248).
	const pageLimit = $derived(snapshot?.warpLimit?.reason ? snapshot.warpLimit.max : null);
	const pageReason = $derived(
		snapshot?.warpLimit?.reason
			? `Max ${warpText(snapshot.warpLimit.max)} — ${snapshot.warpLimit.reason}`
			: ''
	);
	const location = $derived(
		pageShell.location ?? {
			icon: 'spaceCenter' as const,
			text: home ? `${place} · ${home}` : place
		}
	);
	const debugAllowed = $derived(
		snapshot?.debug !== undefined && snapshot.debug.access !== 'locked'
	);
	let menuOpen = $state(false);
	function onmenu(): void {
		if (pageShell.menu) pageShell.menu();
		else menuOpen = !menuOpen;
	}
</script>

<div class="page" class:immersive={isImmersive(path)}>{@render children()}</div>

<!-- the time bar and, right of it, the page's own row (ADR 0295 point 1: the Hangar's name) -->
<div class="topleft">
	<TimeBar
		t={snapshot?.t ?? 0}
		{paused}
		{pauseLocked}
		{onpause}
		steps={time?.steps ?? warpSteps}
		{index}
		limit={time ? time.limit : pageLimit}
		reason={time ? time.reason : pageReason}
		time={elapsedText(time?.elapsed ?? snapshot?.t ?? 0, calendar.day, calendar.year)}
		date={time?.date ?? date}
		met={time !== null}
		chip={clockChip}
		{onchip}
		onpick={time ? time.onpick : onwarp ? (i) => onwarp(warpSteps[i] ?? 1) : undefined}
		catchUp={time?.catchUp}
		oncatchup={time?.oncatchup}
	/>
	{#if pageShell.beside}{@render pageShell.beside()}{/if}
</div>
<MenuBar
	actions={pageShell.actions}
	custom={pageShell.current ?? undefined}
	active={activeFixed(path, pageShell.map?.on ?? false)}
	map={pageShell.map}
	home={pageShell.home}
	{onmenu}
	{menuOpen}
/>
{#if menuOpen}
	<div class="sysmenu" role="menu" aria-label="Menu" data-testid="system-menu">
		<button
			type="button"
			role="menuitem"
			data-testid="nav-settings"
			onclick={() => {
				menuOpen = false;
				onsettings();
			}}>Settings</button
		>
		{#if onworldsettings}
			<button
				type="button"
				role="menuitem"
				data-testid="nav-world-settings"
				onclick={() => {
					menuOpen = false;
					onworldsettings();
				}}>World settings</button
			>
		{/if}
		{#if onsave}
			<button
				type="button"
				role="menuitem"
				data-testid="nav-save"
				onclick={() => {
					menuOpen = false;
					onsave();
				}}>Save</button
			>
		{/if}
		{#if onload}
			<button
				type="button"
				role="menuitem"
				data-testid="nav-load"
				onclick={() => {
					menuOpen = false;
					onload();
				}}>Load</button
			>
		{/if}
		{#if ondebug && debugAllowed}
			<button
				type="button"
				role="menuitem"
				data-testid="nav-debug"
				onclick={() => {
					menuOpen = false;
					ondebug();
				}}>Debug (Alt+F12)</button
			>
		{/if}
		<button
			type="button"
			role="menuitem"
			data-testid="nav-home"
			onclick={() => {
				menuOpen = false;
				onhome();
			}}>Main menu</button
		>
	</div>
{/if}
<StatusBar {snapshot} {focus} {world} {system} {location} {savedAt} {mods} {bell} {programs} />

<style>
	.topleft {
		position: fixed;
		z-index: 40;
		left: calc(1.5rem + var(--safe-left));
		top: calc(1.5rem + var(--safe-top));
		display: flex;
		align-items: center;
		gap: 0.5rem;
		pointer-events: none;
	}
	.topleft > :global(*) {
		pointer-events: auto;
	}
	.topleft :global(.bar) {
		position: static;
	}
	/* F2 in flight (plan 226): the bars and the menu step aside with the rest of the interface */
	:global(html[data-ui-hidden] [data-testid='time-bar']),
	:global(html[data-ui-hidden] [data-testid='menu-bar']),
	:global(html[data-ui-hidden] [data-testid='status-bar']),
	:global(html[data-ui-hidden] [data-testid='system-menu']) {
		display: none !important;
	}
	/* the safe area (BASE_LAYOUT §1): pages without a 3D view sit in it */
	.page {
		position: fixed;
		top: calc(5rem + var(--safe-top));
		bottom: calc(3.5rem + var(--safe-bottom));
		left: calc(1.5rem + var(--safe-left));
		right: calc(1.5rem + var(--safe-right));
		overflow: auto;
		/* the containing block of the pages' own `position: fixed` roots: they fill this box */
		contain: layout;
	}
	/* a 3D page fills the window: the bars float over its view and it keeps its panels off them */
	.page.immersive {
		inset: 0;
		overflow: hidden;
	}
	.sysmenu {
		position: fixed;
		z-index: 41;
		right: calc(1.5rem + var(--safe-right));
		top: calc(4.5rem + var(--safe-top));
		display: flex;
		flex-direction: column;
		min-width: 11rem;
		padding: 0.25rem;
		background: var(--surface-dialog);
		border: 1px solid rgb(255 255 255 / 0.08);
		border-radius: var(--radius-panel);
		box-shadow: var(--shadow-overlay);
	}
	.sysmenu button {
		height: 2rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-button);
		text-align: left;
		cursor: pointer;
	}
	.sysmenu button:hover {
		background: rgb(255 255 255 / 0.06);
	}
</style>
