<script lang="ts">
	/**
	 * The Space Center's overlay (plan 091, refs Space Center): labels over the 3D site, the building
	 * list (every building reachable by keyboard without the camera), the detail panel of the
	 * selected building, the "Needs attention" list, the build dock and the world capsule.
	 */
	import BackButton from '../ui/BackButton.svelte';
	import Button from '../ui/Button.svelte';
	import Capsule from '../ui/Capsule.svelte';
	import ListRow from '../ui/ListRow.svelte';
	import Panel from '../ui/Panel.svelte';
	import { moveSelection, type BuildingRow } from './model';

	let {
		worldName,
		rows,
		labels,
		selected,
		onselect,
		buildKinds,
		build,
		onbuild,
		onrotate,
		onremove
	}: {
		worldName: string;
		rows: readonly BuildingRow[];
		/** CSS pixel of each building's label, or null when off screen. */
		labels: Readonly<Record<string, { x: number; y: number } | null>>;
		selected: string | null;
		onselect: (id: string | null) => void;
		buildKinds: readonly { id: string; label: string }[];
		/** Build mode: the kind being placed and what the ghost under the pointer is told. */
		build: { kind: string; label: string; valid: boolean; reasons: readonly string[] } | null;
		onbuild: (kind: string | null) => void;
		onrotate: () => void;
		onremove: (id: string) => void;
	} = $props();

	const current = $derived(rows.find((r) => r.id === selected) ?? null);
	const attention = $derived(rows.filter((r) => r.status !== 'active'));

	function onListKey(e: KeyboardEvent): void {
		const index = rows.findIndex((r) => r.id === selected);
		const next = moveSelection(rows.length, index, e.key);
		if (next !== index && next >= 0) {
			e.preventDefault();
			onselect(rows[next]!.id);
		}
		if (e.key === 'Escape') onselect(null);
	}
</script>

<div class="overlay" data-testid="space-center">
	<div class="top">
		<BackButton label="Main menu" href="/" testid="sc-home" />
		<Capsule data-testid="world-capsule"
			><span class="world">{worldName}</span><span class="u">Space Center</span></Capsule
		>
	</div>

	{#each rows as row (row.id)}
		{@const at = labels[row.id]}
		{#if at}
			<button
				type="button"
				class="label"
				class:selected={row.id === selected}
				style:left="{at.x}px"
				style:top="{at.y}px"
				data-testid="sc-label-{row.kind}"
				aria-label="{row.label}: {row.statusText}"
				onclick={() => onselect(row.id)}
			>
				<span class="name">{row.label}</span>
				<span class="status" class:planned={row.status !== 'active'}>{row.statusText}</span>
			</button>
		{/if}
	{/each}

	<aside class="side">
		<Panel title="Buildings">
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<ul
				class="list"
				role="listbox"
				aria-label="Buildings"
				tabindex="0"
				onkeydown={onListKey}
				data-testid="sc-list"
			>
				{#each rows as row (row.id)}
					<li role="option" aria-selected={row.id === selected}>
						<ListRow
							name={row.label}
							sub={row.statusText}
							selected={row.id === selected}
							onclick={() => onselect(row.id)}
							testid="sc-row-{row.id}"
						/>
					</li>
				{/each}
			</ul>
		</Panel>
		<Panel title="Needs attention">
			{#if attention.length === 0}
				<p class="calm" data-testid="sc-attention">Every building is running.</p>
			{:else}
				<ul class="list" data-testid="sc-attention">
					{#each attention as row (row.id)}
						<li>{row.label}: {row.statusText}</li>
					{/each}
				</ul>
			{/if}
		</Panel>
	</aside>

	{#if current}
		<section class="detail" data-testid="sc-detail" aria-label="{current.label} details">
			<Panel title={current.label}>
				<p class="status-line">{current.statusText}</p>
				{#if current.action.kind === 'link'}
					<a class="open" href={current.action.href} data-testid="sc-open">{current.action.label}</a
					>
				{:else}
					<p class="why">{current.action.reason}</p>
				{/if}
				{#if build}
					<Button variant="danger" onclick={() => onremove(current.id)} data-testid="sc-remove"
						>Remove</Button
					>
				{/if}
				<Button variant="ghost" onclick={() => onselect(null)}>Close</Button>
			</Panel>
		</section>
	{/if}

	<div class="dock" role="toolbar" aria-label="Build">
		{#if build}
			<div class="ghost-info" data-testid="sc-ghost" class:invalid={!build.valid}>
				<strong>{build.label}</strong>
				{#if build.valid}
					<span>Click to place · R to rotate · Esc to stop</span>
				{:else}
					{#each build.reasons as reason (reason)}<span class="reason">{reason}</span>{/each}
				{/if}
			</div>
			<Button onclick={onrotate} data-testid="sc-rotate">Rotate</Button>
			<Button variant="ghost" onclick={() => onbuild(null)} data-testid="sc-build-stop">Done</Button
			>
		{:else}
			{#each buildKinds as k (k.id)}
				<Button onclick={() => onbuild(k.id)} data-testid="sc-build-{k.id}">{k.label}</Button>
			{/each}
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		font-family: var(--font-ui);
		color: var(--text);
	}
	.overlay :global(button),
	.overlay :global(a),
	.overlay :global(section),
	.overlay :global(aside),
	.overlay :global(.dock),
	.overlay .top {
		pointer-events: auto;
	}
	.top {
		position: absolute;
		top: var(--space-4, 1rem);
		left: var(--space-4, 1rem);
		display: flex;
		gap: var(--space-3, 0.75rem);
		align-items: center;
	}
	.world {
		font-weight: 600;
	}
	.u {
		color: var(--text-muted);
		margin-left: 0.5rem;
		font-size: var(--t-sm, 0.8125rem);
	}
	.label {
		position: absolute;
		transform: translate(-50%, -100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.125rem;
		padding: 0.375rem 0.625rem;
		border-radius: var(--radius-pill, 999px);
		border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		backdrop-filter: blur(10px) brightness(0.4);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.label.selected {
		border-color: var(--accent-text);
	}
	.name {
		font-weight: 600;
		font-size: var(--t-sm, 0.8125rem);
	}
	.status {
		font-size: var(--t-xs, 0.6875rem);
		color: var(--text-muted);
	}
	.status.planned {
		color: var(--warning, #e8b04a);
	}
	.side {
		position: absolute;
		top: 4.5rem;
		right: var(--space-4, 1rem);
		width: 16rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-3, 0.75rem);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.calm,
	.why,
	.status-line {
		color: var(--text-muted);
		font-size: var(--t-sm, 0.8125rem);
		margin: 0 0 0.5rem;
	}
	.detail {
		position: absolute;
		left: var(--space-4, 1rem);
		top: 4.5rem;
		width: 18rem;
	}
	.open {
		display: inline-block;
		margin: 0 0 0.75rem;
		color: var(--accent-text);
		font-weight: 600;
	}
	.dock {
		position: absolute;
		bottom: var(--space-4, 1rem);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		align-items: center;
		justify-content: center;
		max-width: calc(100% - 2rem);
	}
	.ghost-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md, 0.75rem);
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		font-size: var(--t-sm, 0.8125rem);
	}
	.ghost-info.invalid strong {
		color: var(--danger, #e2483d);
	}
	.reason {
		color: var(--text-muted);
	}
</style>
