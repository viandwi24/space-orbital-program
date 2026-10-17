<script lang="ts">
	/**
	 * One row of a list (refs): a 24 px icon box, a name and a sub line, and a control on the right
	 * (switch, chip, chevron). A row with `onclick` is a button; `selected` draws the hover surface and
	 * the 4 px dot at the right end, never a filled accent.
	 */
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		name,
		sub,
		icon,
		selected = false,
		onclick,
		trailing,
		testid
	}: {
		name: string;
		sub?: string;
		icon?: string;
		selected?: boolean;
		onclick?: () => void;
		trailing?: Snippet;
		testid?: string;
	} = $props();
</script>

{#snippet body()}
	{#if icon}<span class="icon"><Icon name={icon} size={13} /></span>{/if}
	<span class="text">
		<span class="name">{name}</span>
		{#if sub}<span class="sub">{sub}</span>{/if}
	</span>
	{#if trailing}<span class="trailing">{@render trailing()}</span>{/if}
{/snippet}

{#if onclick}
	<button
		type="button"
		class="row"
		class:selected
		aria-current={selected ? 'true' : undefined}
		data-testid={testid}
		{onclick}>{@render body()}</button
	>
{:else}
	<div class="row" class:selected data-testid={testid}>{@render body()}</div>
{/if}

<style>
	.row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2.25rem;
		padding: 0.375rem 0.75rem 0.375rem 0.375rem;
		box-sizing: border-box;
		border: 0;
		border-radius: var(--radius-row);
		background: transparent;
		color: var(--text-body);
		text-align: left;
	}
	button.row:hover,
	.selected {
		background: var(--surface-hover);
	}
	@media (pointer: coarse) {
		button.row {
			min-height: var(--touch-min);
		}
	}
	.selected::after {
		content: '';
		position: absolute;
		right: 0.25rem;
		top: 50%;
		width: var(--dot);
		height: var(--dot);
		margin-top: calc(var(--dot) / -2);
		border-radius: 50%;
		background: var(--text-primary);
	}
	.icon {
		flex: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-icon);
		background: var(--surface-tile);
		color: var(--text-secondary);
	}
	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1875rem;
	}
	.name {
		font-size: var(--t-small);
		font-weight: 600;
		line-height: 1.1;
		color: var(--text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		font-size: var(--t-label);
		line-height: 1.1;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.trailing {
		flex: none;
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}
</style>
