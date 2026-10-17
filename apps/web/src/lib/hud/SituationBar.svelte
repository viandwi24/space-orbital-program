<script lang="ts">
	let { name, situation }: { name: string; situation: string } = $props();
</script>

<header class="bar">
	<h1>{name}</h1>
	<p data-testid="hud-phase-text">{situation}</p>
</header>

<style>
	/* a glass capsule (refs): the vessel's name over its situation, a capital label */
	.bar {
		display: grid;
		justify-items: center;
		gap: 0.25rem;
		min-width: 12.5rem;
		padding: 0.4375rem 1.25rem;
		box-sizing: border-box;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	h1 {
		margin: 0;
		font-size: var(--t-value);
		font-weight: 600;
		line-height: 1;
		color: var(--text-primary);
	}
	p {
		margin: 0;
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
</style>
