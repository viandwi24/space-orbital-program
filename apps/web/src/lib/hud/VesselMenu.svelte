<script lang="ts">
	/**
	 * The vessel menu of the Flight view (plan 310, ADR 0270): a click on another vessel offers to fly
	 * it, target it or one of its free docking ports, look at it, or rename it. Arrows move the focus,
	 * Escape or a press outside closes it; keys pressed in it stay in it (Space would stage).
	 */
	import type { EntityId } from '@orbital/core';
	import type { VesselMenu } from '../vessel-menu';
	import { vesselTooltip } from '../vessel-menu';

	let {
		menu,
		x,
		y,
		oncontrol,
		ontarget,
		onport,
		onfocus,
		onrename,
		onrecover,
		onterminate,
		onclose
	}: {
		menu: VesselMenu;
		x: number;
		y: number;
		oncontrol: () => void;
		ontarget: () => void;
		onport: (part: EntityId) => void;
		onfocus: () => void;
		onrename: (name: string) => void;
		/** Plan 318: recover it (landed at rest) or end it; Terminate asks again when crew are aboard. */
		onrecover?: () => void;
		onterminate?: () => void;
		onclose: () => void;
	} = $props();

	let box = $state<HTMLElement>();
	let portsOpen = $state(false);
	let renaming = $state(false);
	let ending = $state(false);
	let name = $state('');

	const items = (): HTMLElement[] => [
		...(box?.querySelectorAll<HTMLElement>('button[data-item], input') ?? [])
	];
	// the menu is re-read with every snapshot: move the focus only for another vessel
	const vesselId = $derived(menu.vessel);
	$effect(() => {
		void vesselId;
		items()[0]?.focus();
	});

	function onkeydown(e: KeyboardEvent): void {
		e.stopPropagation();
		const all = items();
		const at = all.indexOf(document.activeElement as HTMLElement);
		const go = (i: number): void => {
			e.preventDefault();
			all[(i + all.length) % all.length]?.focus();
		};
		if (e.key === 'ArrowDown') go(at + 1);
		else if (e.key === 'ArrowUp') go(at < 0 ? -1 : at - 1);
		else if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}
	function outside(e: PointerEvent): void {
		if (box && !box.contains(e.target as Node)) onclose();
	}
	function rename(e: SubmitEvent): void {
		e.preventDefault();
		const next = name.trim();
		if (next.length > 0) onrename(next);
	}
</script>

<svelte:window onpointerdown={outside} />

<div
	class="menu"
	style:left="{x}px"
	style:top="{y}px"
	role="menu"
	aria-label="{menu.name} actions"
	tabindex="-1"
	data-testid="vessel-menu"
	bind:this={box}
	{onkeydown}
>
	<div class="head">
		<span class="name">{menu.name}</span>
		<span class="hint">{vesselTooltip(menu).split(' · ').slice(1).join(' · ')}</span>
	</div>
	<button
		type="button"
		data-item
		role="menuitem"
		data-testid="vessel-menu-control"
		disabled={menu.controlBlocked !== null}
		data-tip={menu.controlBlocked ?? 'Fly this vessel'}
		onclick={oncontrol}>Control this vessel</button
	>
	<button
		type="button"
		data-item
		role="menuitem"
		data-testid="vessel-menu-target"
		class:on={menu.targeted && !menu.ports.some((p) => p.targeted)}
		onclick={ontarget}>{menu.targeted ? 'Target set' : 'Set as target'}</button
	>
	<button
		type="button"
		data-item
		role="menuitem"
		aria-haspopup="true"
		aria-expanded={portsOpen}
		data-testid="vessel-menu-ports"
		disabled={menu.ports.length === 0}
		data-tip={menu.ports.length === 0 ? 'No free docking port' : undefined}
		onclick={() => (portsOpen = !portsOpen)}
		>Target a docking port {menu.ports.length > 0 ? `(${menu.ports.length})` : ''} ▸</button
	>
	{#if portsOpen}
		<div class="sub" role="group" aria-label="Docking ports">
			{#each menu.ports as port (port.part)}
				<button
					type="button"
					data-item
					role="menuitem"
					class:on={port.targeted}
					data-testid="vessel-menu-port-{port.part}"
					onclick={() => onport(port.part)}>{port.label}{port.targeted ? ' ✓' : ''}</button
				>
			{/each}
		</div>
	{/if}
	<button
		type="button"
		data-item
		role="menuitem"
		data-testid="vessel-menu-focus"
		disabled={menu.focusPart === null}
		onclick={onfocus}>Focus camera</button
	>
	{#if renaming}
		<form onsubmit={rename}>
			<input
				aria-label="New name"
				data-testid="vessel-menu-name"
				maxlength="60"
				bind:value={name}
			/>
			<button type="submit">OK</button>
		</form>
	{:else}
		<button
			type="button"
			data-item
			role="menuitem"
			data-testid="vessel-menu-rename"
			disabled={menu.controlBlocked === 'belongs to another agency'}
			onclick={() => {
				name = menu.name;
				renaming = true;
				queueMicrotask(() => box?.querySelector('input')?.select());
			}}>Rename…</button
		>
	{/if}
	{#if menu.ours && onrecover}
		<button
			type="button"
			data-item
			role="menuitem"
			data-testid="vessel-menu-recover"
			disabled={menu.recovery === null}
			data-tip={menu.recovery === null
				? 'Only a vessel landed or splashed at rest can be recovered'
				: `Recover for ${Math.round(menu.recovery.factor * 1000) / 10} % of its value`}
			onclick={onrecover}>Recover</button
		>
	{/if}
	{#if menu.ours && onterminate}
		{#if ending}
			<button
				type="button"
				data-item
				role="menuitem"
				class="danger"
				data-testid="vessel-menu-terminate-confirm"
				onclick={onterminate}
				>Terminate: {menu.crew === 1 ? '1 crew member' : `${menu.crew} crew members`} aboard</button
			>
		{:else}
			<button
				type="button"
				data-item
				role="menuitem"
				data-testid="vessel-menu-terminate"
				data-tip="Remove it from the world"
				onclick={() => (menu.crew > 0 ? (ending = true) : onterminate())}>Terminate</button
			>
		{/if}
	{/if}
</div>

<style>
	.menu {
		position: absolute;
		z-index: 7;
		display: grid;
		gap: 2px;
		transform: translate(0.75rem, 0.75rem);
		min-width: 14rem;
		max-width: min(22rem, calc(100vw - 2rem));
		padding: 0.25rem;
		font-size: var(--t-value);
		color: var(--text-primary);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: 8px;
	}
	.head {
		display: grid;
		gap: 0.125rem;
		padding: 0.25rem 0.5rem 0.375rem;
	}
	.name {
		overflow: hidden;
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.hint {
		font-family: var(--font-num);
		font-size: var(--t-xs);
		color: var(--text-dim);
	}
	button {
		min-height: 2rem;
		padding: 0.25rem 0.5rem;
		border: 0;
		border-radius: var(--radius-tile);
		font: inherit;
		color: inherit;
		text-align: left;
		background: transparent;
		cursor: pointer;
	}
	button:hover:not(:disabled),
	button:focus-visible {
		background: var(--surface-hover);
	}
	button:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: -2px;
	}
	button:disabled {
		color: var(--text-dim);
		cursor: default;
	}
	button.on {
		color: var(--c-accent);
	}
	button.danger {
		color: var(--c-danger);
	}
	.sub {
		display: grid;
		gap: 2px;
		padding-left: 0.75rem;
	}
	form {
		display: flex;
		gap: 0.25rem;
		padding: 0.25rem;
	}
	input {
		flex: 1;
		min-width: 0;
		padding: 0.25rem 0.5rem;
		font: inherit;
		color: inherit;
		background: var(--surface-button);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-tile);
	}
	form button {
		background: var(--surface-button);
	}
</style>
