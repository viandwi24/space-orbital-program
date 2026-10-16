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

	// Load a saved flight (plan 043): the flight page resumes it from `?load=<id>`.
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(`/flight?load=${encodeURIComponent(id)}`)
	});

	let settingsOpen = $state(false);
	let ready = $state(false);
	let hasDraft = $state(false);

	/** The newest readable save of any kind: what Continue opens. */
	const latest = $derived(saves.entries.find((e) => e.ok) ?? null);

	onMount(() => {
		hasDraft = loadDraft() !== null;
		void saves.refresh().finally(() => (ready = true));
	});
</script>

<PageMeta title="{GAME_NAME}: build a rocket, fly it to orbit" />

<MenuShell>
	<h1 class="sr-only">{GAME_NAME}</h1>
	<p class="lead">{GAME_TAGLINE}</p>
	<nav aria-label="Main menu">
		{#if latest?.ok}
			<MenuButton
				primary
				icon="play"
				label="Continue"
				hint="{latest.meta.name} · {ago(latest.meta.createdAt, saves.now)}"
				testid="menu-continue"
				onclick={() => void saves.load(latest.meta.id)}
			/>
		{:else}
			<MenuButton
				icon="play"
				label="Continue"
				hint={ready ? 'No saved flight yet' : 'Looking for saved flights'}
				disabled
				testid="menu-continue"
			/>
		{/if}
		<MenuButton
			primary={!latest?.ok}
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
			hint="Quicksaves, autosaves and named saves"
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
		<span>Desktop browsers only</span>
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
