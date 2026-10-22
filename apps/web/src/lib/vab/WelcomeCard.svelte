<script lang="ts">
	/** The empty Hangar's inline card in a lesson (plan 285; plan 344's steps point at it). */
	import Button from '../ui/Button.svelte';
	import type { VabController } from './controller.svelte';

	let { vab, featured }: { vab: VabController; featured: readonly string[] } = $props();
</script>

<div class="welcome">
	<h2>Build a vessel</h2>
	<p>
		Pick a command pod on the left, then click the glowing ring on the platform. Keep adding parts
		below it, then stage the engines on the right.
	</p>
	<div class="featured" aria-label="Featured blueprints">
		{#each featured as id (id)}
			{@const card = vab.blueprints.find((c) => c.id === id)}
			{#if card}
				<button class="feature" onclick={() => vab.loadBlueprint(card.id)}>
					<strong>{card.title}</strong>
					<span>{card.inspiredBy ? `Inspired by ${card.inspiredBy}` : card.summary}</span>
				</button>
			{/if}
		{/each}
	</div>
	<div class="row">
		<Button onclick={() => (vab.blueprintsOpen = true)} data-testid="vab-open-library"
			>Open the Library</Button
		>
		{#if vab.vesselEntries.length > 0}
			<Button onclick={() => vab.openLibrary()}>Open a saved vessel</Button>
		{/if}
	</div>
</div>

<style>
	.welcome {
		position: absolute;
		left: 50%;
		top: 46%;
		transform: translate(-50%, -50%);
		display: grid;
		justify-items: center;
		gap: var(--s-3);
		max-width: 390px;
		padding: var(--s-4) var(--s-5);
		text-align: center;
		background: var(--panel);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
	}
	.welcome h2 {
		margin: 0;
		font-size: var(--t-xl);
		font-weight: 600;
	}
	.welcome p {
		margin: 0;
		color: var(--text-dim);
	}
	.featured {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: var(--s-2);
		margin: var(--s-2) 0;
	}
	.feature {
		display: grid;
		gap: 0.2rem;
		text-align: left;
		padding: 0.6rem 0.7rem;
		border-radius: 0.6rem;
		border: 1px solid rgb(255 255 255 / 0.14);
		color: inherit;
		font: inherit;
		cursor: pointer;
		background-color: #12355e;
		background-image:
			linear-gradient(rgb(255 255 255 / 0.1) 1px, transparent 1px),
			linear-gradient(90deg, rgb(255 255 255 / 0.1) 1px, transparent 1px);
		background-size: 12px 12px;
	}
	.feature:hover,
	.feature:focus-visible {
		border-color: rgb(255 255 255 / 0.5);
	}
	.feature span {
		font-size: var(--t-sm);
		color: var(--text-dim);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: var(--s-2);
	}
</style>
