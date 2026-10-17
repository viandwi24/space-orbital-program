<script lang="ts">
	import { onMount } from 'svelte';
	import { API_VERSION } from '@orbital/sdk';
	import { goto } from '$app/navigation';
	import PageMeta from '../lib/ui/PageMeta.svelte';
	import MenuButton from '../lib/ui/MenuButton.svelte';
	import MenuShell from '../lib/ui/MenuShell.svelte';
	import SettingsDialog from '../lib/ui/SettingsDialog.svelte';
	import { GAME_NAME, GAME_TAGLINE, GAME_VERSION } from '../lib/public/about';
	import { ago, summaryLine } from '../lib/save/describe';
	import LoadDialog from '../lib/save/LoadDialog.svelte';
	import { bootedMods, modHint } from '../lib/save/mods';
	import { SaveController } from '../lib/save/save-controller.svelte';
	import { loadDraft } from '../lib/storage';
	import type { WorldRecord } from '../lib/save/world-record';
	import { enterWorld } from '../lib/worlds/enter';
	import { activeWorldId, type Worlds } from '../lib/worlds/worlds';

	// Load a saved flight (plan 043): the flight page resumes it from `?load=<id>`.
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(`/flight?load=${encodeURIComponent(id)}`),
		// Load a flight lists the active world's saves (plan 087)
		world: activeWorldId
	});

	let settingsOpen = $state(false);
	let ready = $state(false);
	let hasDraft = $state(false);

	/** The world played last (plan 087, ADR 0143): Continue enters it. */
	let lastWorld = $state<WorldRecord | null>(null);
	let worlds: Worlds | null = null;

	onMount(() => {
		hasDraft = loadDraft() !== null;
		void saves
			.worldsService()
			.then(async (w) => {
				worlds = w;
				lastWorld = (await w.list()).flatMap((e) => (e.ok ? [e.record] : []))[0] ?? null;
			})
			.finally(() => (ready = true));
	});
</script>

<PageMeta title="{GAME_NAME}: build a rocket, fly it to orbit" />

<MenuShell>
	<h1 class="sr-only">{GAME_NAME}</h1>
	<p class="lead">{GAME_TAGLINE}</p>
	<nav aria-label="Main menu">
		{#if lastWorld}
			{@const last = lastWorld}
			<MenuButton
				primary
				icon="play"
				label="Continue"
				hint="{last.name} · {ago(last.lastPlayedAt, saves.now)}"
				testid="menu-continue"
				onclick={() => void (worlds && enterWorld(worlds, last.id, (url) => goto(url)))}
			/>
		{:else}
			<MenuButton
				icon="play"
				label="Continue"
				hint={ready ? 'No world yet' : 'Looking for your worlds'}
				disabled
				testid="menu-continue"
			/>
		{/if}
		<MenuButton
			icon="map"
			label="Worlds"
			hint="Choose or create a world"
			href="/worlds"
			testid="menu-worlds"
		/>
		<MenuButton
			primary={!lastWorld}
			icon="launch"
			label="New flight"
			hint="Build a rocket in the hangar"
			href="/vab"
			testid="menu-new"
		/>
		{#if hasDraft}
			<MenuButton
				icon="stage"
				label="Fly the last vessel"
				hint="Launch what you built last"
				href="/flight"
				testid="menu-last"
			/>
		{/if}
		<MenuButton
			icon="open"
			label="Load a flight"
			hint="The saves of the world you are in"
			testid="menu-load"
			onclick={() => void saves.showLoad()}
		/>
		<MenuButton
			icon="assembly"
			label="Vessel library"
			hint="Your designs and sub-assemblies"
			href="/vab?library"
			testid="menu-library"
		/>
		<MenuButton
			icon="part"
			label="Mods"
			hint="Install and manage add-ons"
			href="/mods"
			testid="menu-mods"
		/>
		<MenuButton
			icon="wheel"
			label="Settings"
			hint="Graphics, units, controls"
			testid="menu-settings"
			onclick={() => (settingsOpen = true)}
		/>
		<div class="small">
			<MenuButton icon="map" label="Roadmap" href="/roadmap" testid="menu-roadmap" />
			<MenuButton icon="info" label="Credits" href="/credits" testid="menu-credits" />
		</div>
	</nav>
	<LoadDialog {saves} />
	<SettingsDialog open={settingsOpen} onclose={() => (settingsOpen = false)} />
	{#snippet footer()}
		<span class="num">{GAME_NAME} {GAME_VERSION}</span>
		<span class="num">mod API {API_VERSION}</span>
		<span>Computers and tablets</span>
	{/snippet}
</MenuShell>

<style>
	.lead {
		margin: 0 0 var(--s-5);
		max-width: 26ch;
		font-size: var(--t-xl);
		font-weight: 500;
		line-height: 1.18;
		color: var(--text);
	}
	nav {
		display: grid;
		gap: var(--s-2);
	}
	.small {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--s-2);
	}
	.small :global(.item) {
		min-height: 44px;
	}
</style>
