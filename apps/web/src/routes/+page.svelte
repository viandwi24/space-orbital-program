<script lang="ts">
	import { leaveLesson } from '../lib/onboarding/lesson-world';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { API_VERSION } from '@orbital/sdk';
	import { goto } from '$app/navigation';
	import PageMeta from '../lib/ui/PageMeta.svelte';
	import MenuButton from '../lib/ui/MenuButton.svelte';
	import MenuShell from '../lib/ui/MenuShell.svelte';
	import SettingsDialog from '../lib/ui/SettingsDialog.svelte';
	import { GAME_NAME, GAME_TAGLINE, GAME_VERSION } from '../lib/public/about';
	import { ago } from '../lib/save/describe';
	import { bootedMods, modHint } from '../lib/save/mods';
	import { SaveController } from '../lib/save/save-controller.svelte';
	import type { WorldRecord } from '../lib/save/world-record';
	import { enterWorld } from '../lib/worlds/enter';
	import LastWorldCard from '../lib/worlds/LastWorldCard.svelte';
	import type { SaveMeta } from '../lib/save/game-save';
	import { activeWorldId, type Worlds } from '../lib/worlds/worlds';

	// Saves belong to a world: the main menu has none of the world's own entries (New flight, Fly the
	// last vessel, Load a flight); they are in the world, the Hangar and the pause menu.
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`)),
		// Load a flight lists the active world's saves (plan 087)
		world: activeWorldId
	});

	let settingsOpen = $state(false);
	let ready = $state(false);

	/** The world played last (plan 087, ADR 0143): Continue enters it. */
	let lastWorld = $state<WorldRecord | null>(null);
	/** Its newest save, for the last-world card (plan 089). */
	let newest = $state<SaveMeta | null>(null);
	let worlds: Worlds | null = null;

	/** `stock.career` -> `Career`; the Home screen loads no plugins. */
	const modeOf = (preset: string): string => {
		const name = preset.slice(preset.lastIndexOf('.') + 1).replace(/-/g, ' ');
		return name.charAt(0).toUpperCase() + name.slice(1);
	};
	const KIND = { auto: 'Autosave', quick: 'Quicksave', manual: 'Saved' } as const;

	onMount(() => {
		void saves
			.worldsService()
			.then(async (w) => {
				worlds = w;
				// a lesson quit from the pause menu ends here: the player's world comes back (plan 229)
				await leaveLesson(w);
				lastWorld = (await w.list()).flatMap((e) => (e.ok ? [e.record] : []))[0] ?? null;
				if (lastWorld) newest = (await w.saves(lastWorld.id))[0] ?? null;
			})
			.finally(() => (ready = true));
	});

	function closeSettings(): void {
		settingsOpen = false;
		// keyboard users land back on the entry that opened the dialog (ADR 0025)
		queueMicrotask(() =>
			document.querySelector<HTMLElement>('[data-testid="menu-settings"]')?.focus()
		);
	}
</script>

<PageMeta title="{GAME_NAME}: build a rocket, fly it to orbit" />

<MenuShell>
	<h1>{GAME_TAGLINE}</h1>
	{#if lastWorld}
		{@const last = lastWorld}
		<MenuButton
			variant="primary"
			icon="play"
			label="Continue · {last.name}"
			hint="{modeOf(last.preset)} · {newest
				? `${KIND[newest.kind]} ${ago(newest.createdAt, saves.now)}`
				: ago(last.lastPlayedAt, saves.now)}"
			testid="menu-continue"
			onclick={() => void (worlds && enterWorld(worlds, last.id, (url) => goto(url)))}
		/>
	{:else}
		<MenuButton
			variant="primary"
			icon="play"
			label="Continue"
			hint={ready ? 'No world yet' : 'Looking for your worlds'}
			disabled
			testid="menu-continue"
		/>
	{/if}
	<nav aria-label="Main menu">
		<MenuButton
			icon="globe"
			label="Worlds"
			hint="Open, create or manage your worlds"
			href={resolve('/worlds')}
			testid="menu-worlds"
		/>
		<MenuButton
			icon="orbit"
			label="Lessons"
			hint="Landing, maneuver nodes, docking and a transfer, step by step"
			href={resolve('/lessons')}
			testid="menu-lessons"
		/>
		<MenuButton
			icon="cube"
			label="Vessel library"
			hint="Designs you can launch in any world"
			href={resolve('/(world)/vab?library')}
			testid="menu-library"
		/>
		<MenuButton
			icon="mods"
			label="Mods"
			hint="Add-ons active in every world"
			href={resolve('/(world)/mods')}
			testid="menu-mods"
		/>
		<MenuButton
			icon="gear"
			label="Settings"
			hint="Graphics, units, controls"
			testid="menu-settings"
			onclick={() => (settingsOpen = true)}
		/>
	</nav>
	<div class="small">
		<MenuButton
			variant="compact"
			icon="map"
			label="Roadmap"
			href={resolve('/roadmap')}
			testid="menu-roadmap"
		/>
		<MenuButton
			variant="compact"
			icon="help"
			label="Glossary"
			href={resolve('/glossary')}
			testid="menu-glossary"
		/>
		<MenuButton
			variant="compact"
			icon="info"
			label="Credits"
			href={resolve('/credits')}
			testid="menu-credits"
		/>
	</div>
	<SettingsDialog open={settingsOpen} onclose={closeSettings} />
	{#snippet aside()}
		{#if lastWorld}
			<LastWorldCard world={lastWorld} mode={modeOf(lastWorld.preset)} {newest} now={saves.now} />
		{/if}
	{/snippet}
	{#snippet footer()}
		<span class="mono">{GAME_NAME} {GAME_VERSION}</span>
		<span class="mono">mod API {API_VERSION}</span>
		<span>Computers and tablets</span>
	{/snippet}
</MenuShell>

<style>
	h1 {
		margin: 0 0 1.25rem;
		font-size: 1.875rem;
		line-height: 1.2;
		font-weight: 300;
		letter-spacing: -0.01em;
		color: var(--text-primary);
	}
	/* refs: the glass menu, padding 6, gap 2, radius 16 */
	nav {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-top: 1.25rem;
		padding: 0.375rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.small {
		display: flex;
		gap: 0.25rem;
		margin-top: 1.25rem;
	}
</style>
