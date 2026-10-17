<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * One entry of the main menu (plan 089, refs Home): a link when it has an `href`, else a button.
	 * `primary` is the light Continue capsule, `row` a line of the glass menu (icon tile, title, hint,
	 * a dot when hovered or focused), `compact` a small glass pill (Roadmap, Credits).
	 */
	let {
		label,
		hint,
		icon,
		href,
		onclick,
		variant = 'row',
		disabled = false,
		testid
	}: {
		label: string;
		hint?: string;
		icon: string;
		href?: string;
		onclick?: () => void;
		variant?: 'primary' | 'row' | 'compact';
		disabled?: boolean;
		testid?: string;
	} = $props();
</script>

{#snippet body()}
	{#if variant === 'row'}
		<span class="tile"><Icon name={icon} size={16} /></span>
	{:else}
		<Icon name={icon} size={variant === 'primary' ? 20 : 16} />
	{/if}
	{#if variant === 'compact'}
		<span class="label">{label}</span>
	{:else}
		<span class="text"
			><span class="label">{label}</span>{#if hint}<span class="hint">{hint}</span>{/if}</span
		>
	{/if}
	{#if variant === 'primary'}<span class="end"><Icon name="chevron" size={18} /></span>{/if}
	{#if variant === 'row'}<span class="dot" aria-hidden="true"></span>{/if}
{/snippet}

{#if href && !disabled}
	<a class="item {variant}" {href} data-testid={testid}>{@render body()}</a>
{:else}
	<button class="item {variant}" type="button" {disabled} {onclick} data-testid={testid}
		>{@render body()}</button
	>
{/if}

<style>
	.item {
		display: flex;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		text-decoration: none;
		font: inherit;
		color: var(--text-primary);
		border: 0;
		cursor: pointer;
		transition: background var(--dur-fast) var(--ease);
	}
	.item:disabled {
		cursor: default;
		opacity: 0.5;
	}
	.item:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	.text {
		display: grid;
		gap: 0.25rem;
		min-width: 0;
	}
	.label {
		line-height: 1;
		font-weight: 600;
	}
	.hint {
		font-size: var(--t-label);
		line-height: 1.1;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Continue: the light capsule, 56 px, radius 14 */
	.primary {
		gap: 0.875rem;
		height: 3.5rem;
		padding: 0 1rem;
		border-radius: 0.875rem;
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.primary .label {
		font-size: var(--t-value);
		font-weight: 700;
	}
	.primary .hint {
		color: var(--selected-muted);
	}
	.primary:hover:not(:disabled) {
		background: var(--text-primary);
	}
	.primary:focus-visible {
		outline-offset: 3px;
	}
	.end {
		margin-left: auto;
		display: flex;
	}

	/* A row of the glass menu: 52 px, icon tile 30, dot on the right when hovered */
	.row {
		gap: 0.75rem;
		height: 3.25rem;
		padding: 0 0.75rem 0 0.5rem;
		border-radius: 0.6875rem;
		background: transparent;
	}
	.row .label {
		font-size: var(--t-button);
	}
	.tile {
		display: flex;
		flex: none;
		align-items: center;
		justify-content: center;
		width: 1.875rem;
		height: 1.875rem;
		border-radius: 0.5625rem;
		background: var(--surface-tile);
		color: var(--text-secondary);
	}
	.dot {
		flex: none;
		width: 4px;
		height: 4px;
		margin-left: auto;
		border-radius: 50%;
		background: transparent;
	}
	.row:hover:not(:disabled),
	.row:focus-visible {
		background: var(--surface-tile);
	}
	.row:hover:not(:disabled) .dot,
	.row:focus-visible .dot {
		background: var(--text-primary);
	}

	/* Roadmap, Credits: a 40 px glass pill */
	.compact {
		justify-content: center;
		gap: 0.5rem;
		height: 2.5rem;
		border-radius: 0.75rem;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		-webkit-backdrop-filter: var(--glass-filter);
		backdrop-filter: var(--glass-filter);
		color: var(--text-secondary);
	}
	.compact .label {
		font-size: var(--t-small);
	}
	.compact:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
</style>
