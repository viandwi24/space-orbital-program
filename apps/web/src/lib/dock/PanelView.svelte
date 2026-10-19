<script lang="ts">
	/** Draws an evaluated panel view (plan 112, ADR 0149 point 3) with the HUD's own components. */
	import Meter from '../ui/Meter.svelte';
	import Sparkline from '../ui/Sparkline.svelte';
	import StatCell from '../ui/StatCell.svelte';
	import Switch from '../ui/Switch.svelte';
	import Button from '../ui/Button.svelte';
	import Self from './PanelView.svelte';
	import type { ShownNode } from './evaluate';

	let {
		node,
		onaction
	}: {
		node: ShownNode;
		/** A button or switch at `path` was used (`on` for a switch). */
		onaction: (path: string, on?: boolean) => void;
	} = $props();
</script>

{#if node.kind === 'section'}
	<div class="section">
		{#if node.title}<h3>{node.title}</h3>{/if}
		<div class="grid">
			{#each node.children as child, i (i)}
				<Self node={child} {onaction} />
			{/each}
		</div>
	</div>
{:else if node.kind === 'readout'}
	<StatCell label={node.label} value={node.value} {...node.unit ? { unit: node.unit } : {}} />
{:else if node.kind === 'meter'}
	<div class="wide">
		<span class="k">{node.label}</span>
		{#if node.value === null}<span class="v">[—]</span>{:else}<Meter
				value={node.value}
				label={node.label}
			/>{/if}
	</div>
{:else if node.kind === 'switch'}
	<div class="wide">
		<Switch checked={node.on} label={node.label} onchange={(on) => onaction(node.path, on)} />
	</div>
{:else if node.kind === 'button'}
	<div class="wide">
		<Button disabled={!node.enabled} onclick={() => onaction(node.path)}>{node.label}</Button>
	</div>
{:else if node.kind === 'list'}
	<div class="wide">
		{#if node.label}<span class="k">{node.label}</span>{/if}
		<ul>
			{#each node.items as item, i (i)}
				<li>
					<span>{item.name}</span>{#if item.value}<span class="v">{item.value}</span>{/if}
					{#if item.actions}
						<span class="row-actions">
							{#each item.actions as a (a.path)}
								<Button
									variant="ghost"
									disabled={!a.enabled}
									onclick={() => onaction(a.path)}
									data-testid="panel-action-{a.path}">{a.label}</Button
								>
							{/each}
						</span>
					{/if}
				</li>
			{:else}
				<li class="none">[—]</li>
			{/each}
		</ul>
	</div>
{:else if node.kind === 'sparkline'}
	<div class="wide">
		<span class="k"
			>{node.label}<span class="v"
				>{node.last === null
					? '[—]'
					: node.last.toLocaleString('en-US', {
							maximumFractionDigits: 1
						})}</span
			></span
		>
		<Sparkline values={node.values} label={node.label} />
	</div>
{/if}

<style>
	.section {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.375rem;
	}
	h3 {
		margin: 0;
		padding: 0 0.25rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.25rem;
	}
	.wide {
		grid-column: 1 / -1;
		display: grid;
		gap: 0.25rem;
		padding: 0.375rem 0.5rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
	}
	.k {
		display: flex;
		justify-content: space-between;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.v {
		font-size: var(--t-small);
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text-primary);
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.125rem 0;
	}
	.row-actions {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
	}
</style>
