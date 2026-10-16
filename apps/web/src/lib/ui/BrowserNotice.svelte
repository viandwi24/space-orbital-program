<script lang="ts">
	import { SUPPORTED_BROWSERS } from '../browser-support';

	let { missing }: { missing: string[] } = $props();
</script>

<main role="alert" data-testid="browser-notice">
	<h1>This browser cannot run Orbital</h1>
	<p>The game needs features your browser does not offer here:</p>
	<ul>
		{#each missing as feature (feature)}
			<li>{feature}</li>
		{/each}
	</ul>
	<p>
		Please open this page in {SUPPORTED_BROWSERS}. If you are already using one, check that hardware
		acceleration is turned on in its settings and that the browser is up to date.
	</p>
	<p class="meta">
		Phones and tablets are not supported yet. See the support list in the project documentation
		(<code>docs/product/browser-support.md</code>).
	</p>
</main>

<style>
	main {
		max-width: 34rem;
		margin: 12vh auto 0;
		padding: 0 var(--s-4);
	}
	h1 {
		margin: 0 0 var(--s-3);
		font-size: var(--t-xl);
		font-weight: 600;
	}
	li {
		color: var(--c-warning);
	}
	.meta {
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
</style>
