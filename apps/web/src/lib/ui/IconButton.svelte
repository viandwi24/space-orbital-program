<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';

	type Props = HTMLButtonAttributes & {
		icon: string;
		/** Accessible name and tooltip. */
		label: string;
		/** Visible text next to the icon. */
		text?: string;
		/** Toggle state (map view on, panel open). */
		pressed?: boolean;
		/** Key that triggers the same action, shown in the tooltip. */
		hint?: string;
	};
	let { icon, label, text, pressed, hint, ...rest }: Props = $props();
</script>

<button
	type="button"
	class="ib"
	class:labelled={text}
	class:on={pressed}
	aria-label={label}
	aria-pressed={pressed}
	title={hint ? `${label} (${hint})` : label}
	{...rest}
>
	<Icon name={icon} />
	{#if text}<span>{text}</span>{/if}
</button>

<style>
	@media (pointer: coarse) {
		.ib {
			min-width: 44px;
			height: 44px;
		}
	}
	.ib {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--s-2);
		min-width: 36px;
		height: 36px;
		padding: 0 var(--s-2);
		font-size: var(--t-sm);
		font-weight: 500;
		background: transparent;
		border: 1px solid transparent;
		border-radius: var(--r-control);
		color: var(--text-dim);
		transition:
			color var(--dur-fast) var(--ease),
			background var(--dur-fast) var(--ease);
	}
	.labelled {
		padding: 0 var(--s-3) 0 var(--s-2);
	}
	.ib:hover:not(:disabled) {
		color: var(--text);
		background: rgb(150 180 210 / 0.14);
	}
	.on {
		color: var(--c-accent);
		background: rgb(92 207 255 / 0.14);
		border-color: rgb(92 207 255 / 0.4);
	}
	.ib:disabled {
		opacity: 0.4;
	}
</style>
