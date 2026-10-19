<script lang="ts">
	/**
	 * Crew seats in the Hangar (plan 218, ADR 0225): the design's seats and the world's available
	 * crew; a click seats a member in the first free seat or takes them out. The Launch screen
	 * starts from this seating.
	 */
	import type { VabController } from './controller.svelte';

	let { vab }: { vab: VabController } = $props();

	const total = $derived(vab.seats.reduce((n, p) => n + p.capacity, 0));
	const nameOf = (id: string): string => vab.roster.find((r) => r.id === id)?.name ?? id;
</script>

{#if vab.seats.length > 0}
	<details class="crew" aria-label="Crew seats" data-testid="crew-seats">
		<summary>
			<h3>Crew · {vab.seated.length} / {total} seats</h3>
			<span class="sum"
				>{vab.seated.length > 0
					? vab.seated.map((s) => nameOf(s.member)).join(', ')
					: 'Seated at launch'}</span
			>
		</summary>
		<div class="seats">
			{#each vab.seats as p (p.part)}
				{#each Array.from({ length: p.capacity }) as _, i (i)}
					{@const who = vab.seated.filter((s) => s.part === p.part)[i]}
					<span class="seat" class:on={who} title="{p.title}, seat {i + 1}"
						>{who ? nameOf(who.member) : 'Empty'}</span
					>
				{/each}
			{/each}
		</div>
		{#if vab.roster.length > 0}
			<div class="roster" role="group" aria-label="Available crew">
				{#each vab.roster as m (m.id)}
					<button
						type="button"
						aria-pressed={vab.seated.some((s) => s.member === m.id)}
						data-testid="vab-crew-{m.id}"
						onclick={() => vab.toggleCrew(m.id)}
						><span class="name">{m.name}</span><span class="sub">{m.profession}</span></button
					>
				{/each}
			</div>
		{:else}
			<p class="dim">No crew to choose: at launch the first free astronaut takes the pod.</p>
		{/if}
	</details>
{/if}

<style>
	.crew {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 10px;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
		backdrop-filter: blur(28px) saturate(160%);
	}
	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 6px;
		min-height: 22px;
		cursor: pointer;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	.sum {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	h3 {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.seats,
	.roster {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 0 6px;
	}
	.seat {
		padding: 4px 8px;
		border-radius: var(--radius-tile);
		font-size: var(--t-small);
		color: var(--text-muted);
		background: var(--surface-inset);
	}
	.seat.on {
		color: var(--text-primary);
	}
	.roster button {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 6px 10px;
		border: 0;
		border-radius: var(--radius-tile);
		font: inherit;
		font-size: var(--t-small);
		color: var(--text-secondary);
		background: var(--surface-button);
	}
	.roster button[aria-pressed='true'] {
		color: var(--selected-fg);
		background: var(--selected-bg);
	}
	.sub {
		font-size: var(--t-label);
		opacity: 0.8;
	}
	.dim {
		margin: 0;
		padding: 0 6px;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
</style>
