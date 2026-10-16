<script lang="ts">
	import { API_VERSION } from '@orbital/sdk';
	import { SIM_VERSION } from '@orbital/sim';
</script>

<main>
	<h1>Orbital</h1>
	<p>Build a rocket, launch it, reach orbit.</p>
	<ul>
		<li><a href="/vab">Vehicle Assembly</a>: design a vessel from stock parts and stage it.</li>
		<li><a href="/flight">Flight</a>: fly the vessel from the VAB (map view with <kbd>M</kbd>).</li>
	</ul>
	<p><small>mod API {API_VERSION} · sim {SIM_VERSION}</small></p>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0d1117;
		color: #e6edf3;
	}
	a {
		color: #8ecbff;
	}
	main {
		font-family: system-ui, sans-serif;
		max-width: 40rem;
		margin: 4rem auto;
		padding: 0 1rem;
	}
</style>
