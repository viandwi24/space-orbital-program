<script lang="ts">
	let { name, situation }: { name: string; situation: string } = $props();
</script>

<header class="bar">
	<h1>{name}</h1>
	<p data-testid="hud-phase-text">{situation}</p>
</header>

<style>
	.bar {
		min-width: 200px;
		padding: var(--s-1) var(--s-5);
		text-align: center;
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	h1 {
		margin: 0;
		font-size: var(--t-lg);
		font-weight: 600;
		line-height: 1.1;
	}
	p {
		margin: 2px 0 0;
		font-size: var(--t-sm);
		color: var(--text);
	}
</style>
