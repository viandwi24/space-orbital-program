<script lang="ts">
	/** The Panel library (plan 112, ADR 0149 point 6): every panel, on the rail or not. */
	import type { CategoryIcon } from '@orbital/core';
	import Dialog from '../ui/Dialog.svelte';
	import Icon from '../ui/Icon.svelte';
	import Switch from '../ui/Switch.svelte';

	let {
		open,
		panels,
		chosen,
		onset,
		onclose
	}: {
		open: boolean;
		panels: readonly { id: string; title: string; icon: CategoryIcon; by: string }[];
		chosen: readonly string[];
		onset: (id: string, on: boolean) => void;
		onclose: () => void;
	} = $props();
</script>

<Dialog {open} title="Panel library" {onclose}>
	<p class="lead">Choose the panels on the dock. Mods can add their own.</p>
	<ul>
		{#each panels as p (p.id)}
			<li>
				<span class="ico"
					><Icon
						name={typeof p.icon === 'string' ? p.icon : undefined}
						path={typeof p.icon === 'string' ? undefined : p.icon.path}
						size={16}
					/></span
				>
				<span class="text"><span class="name">{p.title}</span><span class="by">{p.by}</span></span>
				<Switch
					checked={chosen.includes(p.id)}
					label="{p.title} on the dock"
					testid="library-{p.id}"
					onchange={(on) => onset(p.id, on)}
				/>
			</li>
		{/each}
	</ul>
</Dialog>

<style>
	.lead {
		margin: 0 0 0.75rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	ul {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
		min-width: 20rem;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem;
		border-radius: var(--radius-row);
	}
	li:hover {
		background: var(--surface-hover);
	}
	.ico {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.875rem;
		height: 1.875rem;
		border-radius: 0.5625rem;
		background: var(--surface-tile);
		color: var(--text-secondary);
	}
	.text {
		display: grid;
		flex: 1;
		gap: 2px;
	}
	.name {
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.by {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
</style>
