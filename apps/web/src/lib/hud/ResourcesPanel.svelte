<script lang="ts">
	import Panel from '../ui/Panel.svelte';
	import Meter from '../ui/Meter.svelte';
	import { resourceLabel } from '../format';
	import type { ResourceRow } from '../hud-controller';

	let { resources }: { resources: ResourceRow[] } = $props();
	const shown = $derived(resources.filter((r) => r.capacity > 0));
	const tone = (f: number) => (f < 0.05 ? 'danger' : f < 0.15 ? 'warning' : 'positive');
</script>

<Panel title="Resources">
	{#if shown.length === 0}
		<p class="empty">Nothing on board.</p>
	{:else}
		<ul>
			{#each shown as r (r.id)}
				{@const f = r.amount / r.capacity}
				<li>
					<div class="row">
						<span>{resourceLabel(r.id)}</span>
						<span class="num"
							>{Math.round(r.amount)}<span class="u">{' '}/ {Math.round(r.capacity)} {r.unit}</span
							></span
						>
					</div>
					<Meter value={f} tone={tone(f)} label="{resourceLabel(r.id)} remaining" />
				</li>
			{/each}
		</ul>
	{/if}
</Panel>

<style>
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: var(--s-2);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: var(--s-4);
		margin-bottom: 3px;
		font-size: var(--t-sm);
	}
	.u {
		color: var(--text-dim);
		font-size: var(--t-xs);
	}
	.empty {
		margin: 0;
		color: var(--text-dim);
		font-size: var(--t-sm);
	}
</style>
