<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Space Center's overlay (plan 091, refs Space Center): labels over the 3D site, the building
	 * list (every building reachable by keyboard without the camera), the detail panel of the
	 * selected building, the "Needs attention" list and the build dock. The world's name and the
	 * place are in the status bar (plan 233).
	 */
	import Button from '../ui/Button.svelte';
	import ListRow from '../ui/ListRow.svelte';
	import BuildMenu from './BuildMenu.svelte';
	import type { BuildCard, BuildCategory } from './build-menu';
	import Panel from '../ui/Panel.svelte';
	import { moveSelection, type BuildingRow, type MarketRow } from './model';

	let {
		rows,
		labels,
		selected,
		onselect,
		menu,
		thumbnail,
		build,
		onbuild,
		onrotate,
		onremove,
		onupgrade = () => {},
		notes = [],
		market = [],
		sites = [],
		siteId = null,
		onsite = () => {},
		flows = [],
		onfoundbranch,
		labelMode = 'hover',
		onlabelmode = () => {},
		hovered = null,
		onhover = () => {},
		onframe = () => {}
	}: {
		rows: readonly BuildingRow[];
		/** CSS pixel of each building's label, or null when off screen. */
		labels: Readonly<Record<string, { x: number; y: number } | null>>;
		selected: string | null;
		onselect: (id: string | null) => void;
		/** The build menu's categories and cards (plan 235). */
		menu: readonly BuildCategory[];
		/** A card's thumbnail (plan 235): a data URL once drawn, or null without a picture. */
		thumbnail?: (card: BuildCard) => Promise<string> | null;
		/** Build mode: the kind being placed and what the ghost under the pointer is told. */
		build: { kind: string; label: string; valid: boolean; reasons: readonly string[] } | null;
		onbuild: (kind: string | null) => void;
		onrotate: () => void;
		onremove: (id: string) => void;
		/** Upgrade a building one level (plan 096). */
		onupgrade?: (id: string) => void;
		/** More "Needs attention" lines: finished construction, upkeep over the funds (plan 096). */
		notes?: readonly string[];
		/** The read-only Market panel (plan 097); empty with the economy off. */
		market?: readonly MarketRow[];
		/** The world's sites for the picker (plan 128): the primary site first, then bases. */
		sites?: readonly { id: string; label: string }[];
		siteId?: string | null;
		onsite?: (id: string) => void;
		/** The Flows panel of the chosen site (ADR 0125 point 7). */
		flows?: readonly string[];
		/** Open the branch picker (plan 236, ADR 0229). */
		onfoundbranch?: () => void;
		/** Plan 259: names on hover and selection (the default), or always. */
		labelMode?: 'hover' | 'always';
		onlabelmode?: (mode: 'hover' | 'always') => void;
		/** The building under the pointer in the scene or on a pin, to show its name (plan 259). */
		hovered?: string | null;
		onhover?: (id: string | null) => void;
		/** Frame the camera on a building (plan 259). */
		onframe?: (id: string) => void;
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
	<!-- pins (plan 259): a dot on each building; the name shows on hover, focus and selection, or always -->
	{#each rows as row (row.id)}
		{@const at = labels[row.id]}
		{#if at}
			<button
				type="button"
				class="pin"
				class:selected={row.id === selected}
				class:shown={labelMode === 'always' || row.id === selected || row.id === hovered}
				class:planned={row.status !== 'active'}
				style:left="{at.x}px"
				style:top="{at.y}px"
				data-testid="sc-label-{row.kind}"
				aria-label="{row.label}: {row.statusText}"
				onclick={() => onselect(row.id)}
				onpointerenter={() => onhover(row.id)}
				onpointerleave={() => onhover(null)}
			>
				<span class="tag">
					<span class="name">{row.label}</span>
					<span class="status">{row.statusText}</span>
				</span>
				<span class="stem" aria-hidden="true"></span>
				<span class="dot" aria-hidden="true"></span>
			</button>
		{/if}
	{/each}

	<!-- the right column (SpaceCenterV2: right 24, top 80, 320 wide): the selected building first -->
	<aside class="side">
		<div class="sites">
			{#if sites.length > 1}
				<label class="site-pick"
					><span class="u">Site</span>
					<select
						data-testid="sc-site"
						value={siteId ?? sites[0]?.id}
						onchange={(e) => onsite((e.currentTarget as HTMLSelectElement).value)}
					>
						{#each sites as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
					</select></label
				>
			{/if}
			{#if onfoundbranch}
				<Button onclick={onfoundbranch} data-testid="sc-found-branch">Found a branch</Button>
			{/if}
			<button
				type="button"
				class="labels-toggle"
				aria-pressed={labelMode === 'always'}
				data-tip="Show every building's name, or only the one you point at"
				data-testid="sc-labels"
				onclick={() => onlabelmode(labelMode === 'always' ? 'hover' : 'always')}
				>Names: {labelMode === 'always' ? 'always' : 'on hover'}</button
			>
		</div>
		{#if current}
			<section class="detail" data-testid="sc-detail" aria-label="{current.label} details">
				<Panel title={current.label}>
					{#snippet aside()}
						<button
							type="button"
							class="icon"
							aria-label="Close the building panel"
							data-tip="Close (Esc)"
							onclick={() => onselect(null)}>×</button
						>
					{/snippet}
					<div class="levels" aria-label="Level {current.level} of {current.maxLevel}">
						{#each { length: current.maxLevel } as _, k (k)}
							<span class="pip" class:on={k < current.level}></span>
						{/each}
						<span class="lvl">Level {current.level} of {current.maxLevel}</span>
					</div>
					<p class="status-line" class:planned={current.status !== 'active'}>
						{current.statusText}
					</p>
					{#if current.description}<p class="desc">{current.description}</p>{/if}
					<dl class="facts">
						{#each current.capacity as line (line)}
							<div>
								<dt>Provides</dt>
								<dd>{line}</dd>
							</div>
						{/each}
						{#if current.upkeep > 0}
							<div>
								<dt>Upkeep</dt>
								<dd>{current.upkeep.toLocaleString('en-US')} funds / 30 days</dd>
							</div>
						{/if}
					</dl>
					{#if current.upgrade}
						<div class="upgrade">
							<span class="u">Next: level {current.upgrade.level + 1}</span>
							<span class="num"
								>{current.upgrade.cost.toLocaleString('en-US')} funds · {current.upgrade.days} days</span
							>
							<Button onclick={() => onupgrade(current.id)} data-testid="sc-upgrade"
								>Upgrade to level {current.upgrade.level + 1}</Button
							>
						</div>
					{/if}
					<div class="actions">
						{#if current.action.kind === 'link'}
							<a class="open" href={current.action.href} data-testid="sc-open"
								>{current.action.label}</a
							>
						{:else}
							<p class="why">{current.action.reason}</p>
						{/if}
						<Button variant="ghost" onclick={() => onframe(current.id)} data-testid="sc-frame"
							>Frame</Button
						>
						{#if build}
							<Button variant="danger" onclick={() => onremove(current.id)} data-testid="sc-remove"
								>Remove</Button
							>
						{/if}
					</div>
				</Panel>
			</section>
		{/if}
		<Panel title="Buildings">
			{#snippet aside()}
				<span class="num" class:warn={attention.length + notes.length > 0}
					>{attention.length + notes.length > 0
						? `${attention.length + notes.length} need attention`
						: `${rows.length}`}</span
				>
			{/snippet}
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
					<li
						role="option"
						aria-selected={row.id === selected}
						onpointerenter={() => onhover(row.id)}
						onpointerleave={() => onhover(null)}
					>
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
			<div class="attention" data-testid="sc-attention">
				{#if attention.length === 0 && notes.length === 0}
					<p class="calm">Every building is running.</p>
				{:else}
					<ul class="list warnings">
						{#each notes as note (note)}
							<li>{note}</li>
						{/each}
						{#each attention as row (row.id)}
							<li>{row.label}: {row.statusText}</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Panel>
		{#if flows.length > 0}
			<Panel title="Flows">
				<ul class="list" data-testid="sc-flows">
					{#each flows as f (f)}<li>{f}</li>{/each}
				</ul>
			</Panel>
		{/if}
		{#if market.length > 0}
			<Panel title="Market">
				<ul class="list" data-testid="sc-market">
					{#each market as m (m.id)}
						<li>
							<ListRow
								name={m.label}
								sub="{m.price}{m.trend ? ` · ${m.trend}` : ''}{m.held !== null
									? ` · ${m.held.toLocaleString('en-US')} held`
									: ''}"
								testid="sc-market-{m.id}"
							/>
						</li>
					{/each}
				</ul>
			</Panel>
		{/if}
	</aside>

	<div class="dock">
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
			<BuildMenu {menu} {thumbnail} onpick={(kind) => onbuild(kind)} />
		{/if}
	</div>
</div>

<style>
	.sites {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		pointer-events: auto;
	}
	.site-pick {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		pointer-events: auto;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.site-pick select {
		font: inherit;
		color: var(--text-primary);
		background: var(--surface-tile);
		border: 1px solid var(--border-subtle, transparent);
		border-radius: var(--radius-pill, 999px);
		padding: 0.25rem 0.75rem;
	}
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
	.overlay :global(.dock) {
		pointer-events: auto;
	}
	.u {
		color: var(--text-muted);
		font-size: var(--t-sm, 0.8125rem);
	}
	/* pins (plan 259): a dot at the building; the tag opens on hover, focus or selection */
	.pin {
		position: absolute;
		transform: translate(-50%, -100%);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.25rem;
		border: 0;
		background: none;
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.tag {
		display: none;
		flex-direction: column;
		align-items: center;
		gap: 0.0625rem;
		padding: 0.25rem 0.625rem;
		margin-bottom: 0.125rem;
		border-radius: var(--radius-md, 0.75rem);
		border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
		background: var(--surface-glass, rgba(22, 23, 26, 0.6));
		backdrop-filter: blur(10px) brightness(0.4);
		white-space: nowrap;
	}
	.pin:hover .tag,
	.pin:focus-visible .tag,
	.pin.shown .tag {
		display: flex;
	}
	.pin.selected .tag {
		border-color: var(--accent-text);
	}
	.stem {
		width: 1px;
		height: 0.875rem;
		background: color-mix(in srgb, var(--text) 55%, transparent);
	}
	.dot {
		width: 0.625rem;
		height: 0.625rem;
		border-radius: 50%;
		background: var(--accent-text);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--surface-glass, #16171a) 80%, transparent),
			0 0 0 3px color-mix(in srgb, var(--accent-text) 60%, transparent);
	}
	.pin.planned .dot {
		background: var(--warning, #e8b04a);
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--surface-glass, #16171a) 80%, transparent),
			0 0 0 3px color-mix(in srgb, var(--warning, #e8b04a) 60%, transparent);
	}
	.pin.selected .dot {
		transform: scale(1.3);
	}
	.pin:focus-visible {
		outline: 2px solid var(--focus-ring, var(--accent-text));
		outline-offset: 2px;
		border-radius: var(--radius-md, 0.75rem);
	}
	.name {
		font-weight: 600;
		font-size: var(--t-sm, 0.8125rem);
	}
	.status {
		font-size: var(--t-xs, 0.6875rem);
		color: var(--text-muted);
	}
	.pin.planned .status {
		color: var(--warning, #e8b04a);
	}
	.labels-toggle {
		font: inherit;
		font-size: var(--t-small, 0.8125rem);
		color: var(--text-secondary);
		background: var(--surface-tile);
		border: 1px solid var(--border-subtle, transparent);
		border-radius: var(--radius-pill, 999px);
		padding: 0.25rem 0.75rem;
		cursor: pointer;
	}
	.labels-toggle[aria-pressed='true'] {
		color: var(--accent-text);
	}
	.levels {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-bottom: 0.375rem;
	}
	.pip {
		width: 1.25rem;
		height: 0.25rem;
		border-radius: 2px;
		background: var(--surface-tile);
	}
	.pip.on {
		background: var(--accent-text);
	}
	.lvl {
		margin-left: 0.375rem;
		font-size: var(--t-xs, 0.6875rem);
		color: var(--text-muted);
	}
	.desc {
		margin: 0 0 0.5rem;
		font-size: var(--t-sm, 0.8125rem);
	}
	.facts {
		margin: 0 0 0.625rem;
		display: grid;
		gap: 0.25rem;
		font-size: var(--t-sm, 0.8125rem);
	}
	.facts div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
	}
	.facts dt {
		color: var(--text-muted);
	}
	.facts dd {
		margin: 0;
		text-align: right;
	}
	.upgrade {
		display: grid;
		gap: 0.25rem;
		margin-bottom: 0.625rem;
		padding: 0.5rem;
		border-radius: var(--radius-md, 0.75rem);
		background: var(--surface-tile);
		font-size: var(--t-sm, 0.8125rem);
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.actions .why {
		flex: 1 1 100%;
		margin: 0;
	}
	.icon {
		border: 0;
		background: none;
		color: var(--text-muted);
		font: inherit;
		font-size: 1.125rem;
		line-height: 1;
		cursor: pointer;
	}
	.status-line.planned,
	.num.warn {
		color: var(--warning, #e8b04a);
	}
	.attention {
		margin-top: 0.5rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--border-subtle, transparent);
	}
	.attention .calm {
		margin: 0;
	}
	.warnings {
		font-size: var(--t-sm, 0.8125rem);
		color: var(--warning, #e8b04a);
	}
	.side {
		position: absolute;
		top: calc(5rem + var(--safe-top));
		right: calc(1.5rem + var(--safe-right));
		width: 20rem;
		max-height: calc(100% - 5rem - 7rem - var(--safe-top) - var(--safe-bottom));
		overflow-y: auto;
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
	.open {
		display: inline-block;
		margin: 0 0 0.75rem;
		color: var(--accent-text);
		font-weight: 600;
	}
	.dock {
		position: absolute;
		/* over the status bar (BASE_LAYOUT §5: 24 → 52) */
		bottom: calc(3.25rem + var(--safe-bottom));
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
