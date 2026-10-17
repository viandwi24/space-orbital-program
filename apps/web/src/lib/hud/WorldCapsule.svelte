<script lang="ts">
	/**
	 * The world capsule (refs `Main` top left; plan 088, ADR 0144 point 7): the home button, the
	 * world's name and `MODE · SYSTEM`. Home leads to the Space Center (plan 091; wired in plan 113).
	 */
	import Icon from '../ui/Icon.svelte';

	let { name, mode, system }: { name: string; mode: string; system: string } = $props();
</script>

<div class="world" data-testid="world-capsule">
	<a
		class="home"
		href="/space-center"
		aria-label="Back to the Space Center"
		title="Back to the Space Center"><Icon name="home" size={16} /></a
	>
	<span class="text">
		<span class="name">{name}</span>
		<span class="sub">{mode} · {system}</span>
	</span>
</div>

<style>
	.world {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: var(--capsule);
		padding: 0.25rem 0.875rem 0.25rem 0.25rem;
		box-sizing: border-box;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
	}
	.home {
		display: grid;
		place-items: center;
		width: var(--round-btn);
		height: var(--round-btn);
		border-radius: 50%;
		background: var(--surface-tile);
		color: var(--text-secondary);
	}
	.home:hover {
		background: var(--surface-track);
	}
	.text {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}
	.name {
		font-size: var(--t-small);
		font-weight: 600;
		line-height: 1;
		color: var(--text-primary);
		white-space: nowrap;
	}
	.sub {
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
		white-space: nowrap;
	}
</style>
