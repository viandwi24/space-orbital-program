<script lang="ts">
	import { API_VERSION } from '@orbital/sdk';
	import { SIM_VERSION } from '@orbital/sim';
</script>

<main>
	<h1>Orbital</h1>
	<p>Web-based space-flight game. Foundation phase — nothing to fly yet.</p>
	<p><small>mod API {API_VERSION} · sim {SIM_VERSION}</small></p>
	<p>Routes <code>/vab</code>, <code>/flight</code> and <code>/map</code> arrive with plan 009.</p>
</main>

<style>
	main {
		font-family: system-ui, sans-serif;
		max-width: 40rem;
		margin: 4rem auto;
		padding: 0 1rem;
	}
</style>
