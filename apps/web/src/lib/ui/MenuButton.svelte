<script lang="ts">
	import Icon from './Icon.svelte';

	/** One entry of the main menu: a link when it has an `href`, else a button. */
	let {
		label,
		hint,
		icon,
		href,
		onclick,
		primary = false,
		disabled = false,
		testid
	}: {
		label: string;
		hint?: string;
		icon: string;
		href?: string;
		onclick?: () => void;
		primary?: boolean;
		disabled?: boolean;
		testid?: string;
	} = $props();
</script>

{#if href && !disabled}
	<a class="item" class:primary {href} data-testid={testid}>
		<Icon name={icon} size={22} />
		<span class="text"
			><span class="label">{label}</span>{#if hint}<span class="hint">{hint}</span>{/if}</span
		>
	</a>
{:else}
	<button class="item" class:primary type="button" {disabled} {onclick} data-testid={testid}>
		<Icon name={icon} size={22} />
		<span class="text"
			><span class="label">{label}</span>{#if hint}<span class="hint">{hint}</span>{/if}</span
		>
	</button>
{/if}

<style>
	.item {
		display: flex;
		align-items: center;
		gap: var(--s-3);
		width: 100%;
		min-height: 52px;
		padding: 0 var(--s-4);
		box-sizing: border-box;
		text-align: left;
		text-decoration: none;
		color: var(--text);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-panel);
		backdrop-filter: blur(10px) saturate(1.2);
		transition:
			border-color var(--dur-fast) var(--ease),
			background var(--dur-fast) var(--ease),
			transform var(--dur-fast) var(--ease);
	}
	.item:hover:not(:disabled),
	.item:focus-visible {
		border-color: var(--c-accent);
		background: rgb(92 207 255 / 0.12);
		transform: translateX(3px);
	}
	.item:disabled {
		opacity: 0.55;
	}
	.primary {
		color: var(--c-ink);
		background: var(--c-accent);
		border-color: var(--c-accent);
	}
	.primary:hover:not(:disabled),
	.primary:focus-visible {
		background: #8be0ff;
		border-color: #8be0ff;
	}
	.text {
		display: grid;
		gap: 1px;
		min-width: 0;
	}
	.label {
		font-size: var(--t-md);
		font-weight: 600;
		letter-spacing: 0.01em;
	}
	.hint {
		font-size: var(--t-sm);
		color: var(--text-dim);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.primary .hint {
		color: rgb(4 18 26 / 0.78);
	}
</style>
