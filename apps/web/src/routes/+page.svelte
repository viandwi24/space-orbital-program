<script lang="ts">
	import { API_VERSION } from '@orbital/sdk';
	import { SIM_VERSION } from '@orbital/sim';
	import { goto } from '$app/navigation';
	import LoadDialog from '../lib/save/LoadDialog.svelte';
	import { bootedMods, modHint } from '../lib/save/mods';
	import { SaveController } from '../lib/save/save-controller.svelte';

	// Load a saved flight (plan 043): the flight page resumes it from `?load=<id>`.
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(`/flight?load=${encodeURIComponent(id)}`)
	});
</script>

<svelte:head><title>Orbital</title></svelte:head>

<main>
	<h1>Orbital</h1>
	<p class="lead">Build a rocket from parts, stage it, and fly it into orbit.</p>
	<nav aria-label="Start">
		<a class="primary" href="/vab">Build a vessel</a>
		<a href="/flight">Fly the last vessel</a>
		<button type="button" onclick={() => void saves.showLoad()}>Load a flight</button>
		<a href="/mods">Mods</a>
	</nav>
	<LoadDialog {saves} />
	<p class="meta num">mod API {API_VERSION} · sim {SIM_VERSION}</p>
</main>

<style>
	main {
		max-width: 34rem;
		margin: 14vh auto 0;
		padding: 0 var(--s-4);
	}
	h1 {
		margin: 0;
		font-size: 3rem;
		font-weight: 600;
		letter-spacing: 0.01em;
	}
	.lead {
		margin: var(--s-2) 0 var(--s-5);
		font-size: var(--t-lg);
		color: var(--text-dim);
	}
	nav {
		display: flex;
		gap: var(--s-3);
		flex-wrap: wrap;
	}
	a,
	nav button {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 0 var(--s-5);
		font-weight: 500;
		text-decoration: none;
		color: var(--text);
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	nav button {
		font: inherit;
		cursor: pointer;
	}
	a:hover,
	nav button:hover {
		border-color: var(--c-accent);
	}
	a.primary {
		color: var(--c-ink);
		background: var(--c-accent);
		border-color: var(--c-accent);
		font-weight: 600;
	}
	.meta {
		margin-top: var(--s-6);
		font-size: var(--t-xs);
		color: var(--text-faint);
	}
</style>
