<script lang="ts">
	/**
	 * The vessels stacked under a map click (plan 270), like a loot list: each with its type's icon
	 * (plan 258), name, role or type and altitude. Focus moves into the list; arrows, Home and End move
	 * it, Enter picks, Escape or a press outside closes it. Keys pressed in the list stay in it (Space
	 * would stage the vessel otherwise).
	 */
	import { iconPath } from '@orbital/renderer/map-style';
	import type { MapStack, MapStackEntry } from './map-stack';

	let {
		stack,
		onpick,
		onclose
	}: { stack: MapStack; onpick: (entry: MapStackEntry) => void; onclose: () => void } = $props();

	let box = $state<HTMLElement>();
	const items = (): HTMLButtonElement[] => [
		...(box?.querySelectorAll<HTMLButtonElement>('button[data-entry]') ?? [])
	];

	$effect(() => {
		void stack.entries;
		items()[0]?.focus();
	});

	function onkeydown(e: KeyboardEvent): void {
		e.stopPropagation();
		const all = items();
		const at = all.indexOf(document.activeElement as HTMLButtonElement);
		const go = (i: number): void => {
			e.preventDefault();
			all[(i + all.length) % all.length]?.focus();
		};
		if (e.key === 'ArrowDown') go(at + 1);
		else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
		else if (e.key === 'Home') go(0);
		else if (e.key === 'End') go(-1);
		else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}

	function outside(e: PointerEvent): void {
		if (box && !box.contains(e.target as Node)) onclose();
	}
</script>

<svelte:window onpointerdown={outside} />

<div
	class="stack"
	style:left="{stack.x}px"
	style:top="{stack.y}px"
	role="dialog"
	aria-label="{stack.entries.length} vessels here"
	tabindex="-1"
	data-testid="map-stack"
	bind:this={box}
	{onkeydown}
>
	<div class="head">
		<span>{stack.entries.length} vessels here</span>
		<button
			type="button"
			class="close"
			aria-label="Close"
			data-testid="map-stack-close"
			onclick={onclose}>×</button
		>
	</div>
	<ul>
		{#each stack.entries as entry (entry.key)}
			<li>
				<button
					type="button"
					data-entry
					data-testid="map-stack-{entry.key}"
					aria-label="{entry.name}, {entry.role}, {entry.hint}"
					onclick={() => onpick(entry)}
				>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d={iconPath(entry.type)} /></svg>
					<span class="name">{entry.name}</span>
					<span
						class="role"
						class:active={entry.role === 'Active'}
						class:target={entry.role === 'Target'}>{entry.role}</span
					>
					<span class="hint">{entry.hint}</span>
				</button>
			</li>
		{/each}
	</ul>
</div>

<style>
	.stack {
		position: absolute;
		z-index: 6;
		transform: translate(0.75rem, 0.75rem);
		min-width: 15rem;
		max-width: min(24rem, calc(100vw - 2rem));
		padding: 0.25rem;
		font-size: var(--t-value);
		color: var(--text-primary);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: 8px;
	}
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.125rem 0.25rem 0.25rem 0.5rem;
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	ul {
		display: grid;
		gap: 2px;
		max-height: 16rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}
	button {
		border: 0;
		font: inherit;
		color: inherit;
		cursor: pointer;
	}
	.close {
		min-width: 1.75rem;
		min-height: 1.75rem;
		border-radius: var(--radius-tile);
		background: var(--surface-button);
	}
	button[data-entry] {
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr) auto auto;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		min-height: 2rem;
		padding: 0.25rem 0.5rem;
		text-align: left;
		background: transparent;
		border-radius: var(--radius-tile);
	}
	button[data-entry]:hover,
	button[data-entry]:focus-visible {
		background: var(--surface-hover);
	}
	button:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: -2px;
	}
	svg {
		width: 1.25rem;
		height: 1.25rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 1.9;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.name {
		overflow: hidden;
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.role,
	.hint {
		font-size: var(--t-xs);
		color: var(--text-dim);
		white-space: nowrap;
	}
	.role.active {
		color: var(--c-positive);
	}
	.role.target {
		color: var(--c-accent);
	}
	.hint {
		font-family: var(--font-num);
	}
</style>
