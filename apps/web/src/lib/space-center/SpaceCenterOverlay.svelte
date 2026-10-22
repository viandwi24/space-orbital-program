<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Space Center's overlay (plan 091; v3 since plan 273, V3 §1, ADR 0254): pins over the 3D
	 * site and one context bar at the bottom centre whose content follows the mode. Overview: Build,
	 * Buildings (the list, every building reachable by keyboard without the camera), Found a branch
	 * and Labels. Build: the build bar with Place and Demolish. Focus: the building's panel at the
	 * right and the bar back to Overview with previous and next. The world's name and the place are
	 * in the status bar (plan 233).
	 */
	import ListRow from '../ui/ListRow.svelte';
	import BuildMenu from './BuildMenu.svelte';
	import type { BuildCard, BuildCategory } from './build-menu';
	import { moveSelection, type BuildingRow, type MarketRow } from './model';
	import { focusLabel, modeOf, stepBuilding } from './sc-mode';

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
		onframe = () => {},
		onmark = () => {},
		picture
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
		/**
		 * The building to box in the scene, or null: red for the one the bulldozer points at (V3 §1.3,
		 * plan 274), white for a hovered Buildings card (plan 349).
		 */
		onmark?: (id: string | null, danger: boolean) => void;
		/** A building card's thumbnail (plan 349): a data URL once drawn, or null without a picture. */
		picture?: (row: BuildingRow) => Promise<string> | null;
	} = $props();

	const current = $derived(rows.find((r) => r.id === selected) ?? null);
	const attention = $derived(rows.filter((r) => r.status !== 'active'));

	/** The build bar is open (V3 §1.2); the tool in it; the Buildings list (V3 §1.1); a confirm. */
	let buildOpen = $state(false);
	let tool = $state<'place' | 'demolish'>('place');
	let listOpen = $state(false);
	/** The strip's Flows or Market line, opened from its header (plan 349). */
	let extra = $state<'flows' | 'market' | null>(null);
	/** The card under the pointer or focus: its building is boxed in the scene (plan 349). */
	let cardHover = $state<string | null>(null);
	function hoverCard(id: string | null): void {
		cardHover = id;
		onhover(id);
	}
	const STATUS_CHIP: Record<BuildingRow['status'], string> = {
		active: 'running',
		building: 'building',
		upgrading: 'upgrading',
		planned: 'planned'
	};
	// the strip's pictures, drawn once per session by the build menu's renderer queue (plan 349)
	let pictures = $state<Record<string, string>>({});
	$effect(() => {
		if (!listOpen) return;
		for (const row of rows) {
			if (pictures[row.id]) continue;
			void picture?.(row)
				?.then((url) => (pictures = { ...pictures, [row.id]: url }))
				.catch(() => {});
		}
	});
	let confirm = $state<string | null>(null);
	// a ghost being placed is Build mode too (the page can start one, ADR 0254 point 1)
	const mode = $derived(modeOf(buildOpen || build !== null, selected));
	const confirming = $derived(rows.find((r) => r.id === confirm) ?? null);
	const demolishing = $derived(mode === 'build' && tool === 'demolish');
	const ids = $derived(rows.map((r) => r.id));
	/** How many of each kind stand here, for the build cards' ×n chips. */
	const builtCount = $derived(
		rows.reduce<Record<string, number>>((n, r) => ({ ...n, [r.kind]: (n[r.kind] ?? 0) + 1 }), {})
	);

	function openBuild(): void {
		buildOpen = true;
		tool = 'place';
		listOpen = false;
		confirm = null;
		onselect(null);
	}
	function closeBuild(): void {
		onbuild(null);
		buildOpen = false;
		tool = 'place';
		confirm = null;
	}
	function setTool(t: 'place' | 'demolish'): void {
		// a tool or a category tab puts the ghost away, so the cards show again
		onbuild(null);
		tool = t;
		confirm = null;
	}
	function clickPin(id: string): void {
		if (mode === 'build') {
			// V3 §1.3: the bulldozer asks first; while placing, the pins do nothing
			if (tool === 'demolish') confirm = id;
			return;
		}
		// the strip stays open, so Overview comes back to it (plan 349)
		hoverCard(null);
		onselect(id);
	}
	function demolish(id: string): void {
		confirm = null;
		onremove(id);
	}
	// the bulldozer tints the building it points at, or the one being confirmed (V3 §1.3)
	const marked = $derived(demolishing ? (confirm ?? hovered) : null);
	// a card under the pointer boxes its building in white (plan 349)
	const lit = $derived(mode === 'overview' && listOpen ? cardHover : null);
	$effect(() => onmark(marked ?? lit, marked !== null));

	/** Back to Overview from any mode (the menu bar's Space Center icon, V3 §1.4). */
	export function overview(): void {
		if (buildOpen || build) closeBuild();
		confirm = null;
		listOpen = false;
		if (selected) onselect(null);
	}
	function onWindowKey(e: KeyboardEvent): void {
		if (e.key !== 'Escape' || e.defaultPrevented) return;
		// Escape steps back one level (ADR 0254 point 1): the confirm, the build bar, the focus
		if (confirm) confirm = null;
		else if (buildOpen) closeBuild();
		else if (selected) onselect(null);
		else if (listOpen) listOpen = false;
	}

	function onListKey(e: KeyboardEvent): void {
		const index = rows.findIndex((r) => r.id === selected);
		const next = moveSelection(rows.length, index, e.key);
		if (next !== index && next >= 0) {
			e.preventDefault();
			onselect(rows[next]!.id);
		}
	}
	const DOZER =
		'M5 16 H12 A2.5 2.5 0 0 1 12 21 H5 A2.5 2.5 0 0 1 5 16 Z M4 16 V10 H9 L11 13 V16 M6 10 V7 M11 14 H16 M16 9 L20 11 V21 H16 Z';
	const ICON = {
		build: 'M14 4 L20 10 L17 13 L11 7 Z M12.5 8.5 L4 17 A1.4 1.4 0 0 0 6 19 L14.5 10.5',
		list: 'M8 6 H20 M8 12 H20 M8 18 H20 M4 6 H4.01 M4 12 H4.01 M4 18 H4.01',
		building: 'M4 21 V9 L12 4 L20 9 V21 Z M9 21 V14 H15 V21 M4 21 H20',
		branch:
			'M12 21 C12 21 5 14.5 5 9.5 A7 7 0 0 1 19 9.5 C19 14.5 12 21 12 21 Z M12 7 V12 M9.5 9.5 H14.5',
		tag: 'M3 12 V4 H11 L21 14 L14 21 Z M7.5 8 H7.51',
		back: 'M15 5 L8 12 L15 19',
		next: 'M9 5 L16 12 L9 19'
	};
</script>

<svelte:window onkeydown={onWindowKey} />

<div class="overlay" data-testid="space-center" data-mode={mode}>
	<!-- pins (plan 259): a dot on each building; the name shows on hover, focus and selection, or always -->
	{#each rows as row (row.id)}
		{@const at = labels[row.id]}
		{#if at}
			{@const red = demolishing && (row.id === hovered || row.id === confirm)}
			<button
				type="button"
				class="pin"
				class:selected={row.id === selected}
				class:shown={(labelMode === 'always' && mode === 'overview') ||
					row.id === selected ||
					row.id === hovered}
				class:planned={row.status !== 'active'}
				class:red
				style:left="{at.x}px"
				style:top="{at.y}px"
				data-testid="sc-label-{row.kind}"
				aria-label="{demolishing ? 'Demolish ' : ''}{row.label}: {row.statusText}"
				onclick={() => clickPin(row.id)}
				onpointerenter={() => onhover(row.id)}
				onpointerleave={() => onhover(null)}
			>
				<span class="tag">
					<span class="name">{red ? `Demolish ${row.label}` : row.label}</span>
					<span class="status">{row.statusText}</span>
				</span>
				<span class="stem" aria-hidden="true"></span>
				<span class="dot" aria-hidden="true"></span>
			</button>
		{/if}
	{/each}

	{#if confirming}
		{@const at = labels[confirming.id]}
		<!-- V3 §1.3: the demolish confirm, at the building (centred when its pin is off screen) -->
		<div
			class="confirm"
			class:floating={!at}
			role="dialog"
			aria-label="Demolish {confirming.label}?"
			data-testid="sc-confirm"
			style:left={at ? `${at.x}px` : undefined}
			style:top={at ? `${Math.max(200, at.y) - 10}px` : undefined}
		>
			<div class="confirm-head">
				<span class="confirm-ico"
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
						><path d={DOZER} /></svg
					></span
				>
				<strong>Demolish {confirming.label}?</strong>
			</div>
			<p>This can't be undone.</p>
			<div class="confirm-actions">
				<button
					type="button"
					class="soft"
					data-testid="sc-confirm-cancel"
					onclick={() => (confirm = null)}>Cancel</button
				>
				<button
					type="button"
					class="danger"
					data-testid="sc-remove"
					onclick={() => demolish(confirming.id)}>Demolish</button
				>
			</div>
		</div>
	{/if}

	<!-- Focus · the building's panel (V3 §1.4: right 24, top 80, 320 wide) -->
	{#if mode === 'focus' && current}
		<section class="detail" data-testid="sc-detail" aria-label="{current.label} details">
			<div class="dh">
				<span class="cap">{current.label}</span>
				<button
					type="button"
					class="x"
					aria-label="Back to overview"
					data-tip="Back to overview (Esc)"
					onclick={() => onselect(null)}
					><svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"
						><path d="M6 6 L18 18 M18 6 L6 18" /></svg
					></button
				>
			</div>
			<div class="title">
				<h2>{current.label}</h2>
				<div class="levels" aria-label="Level {current.level} of {current.maxLevel}">
					<span class="pips" aria-hidden="true">
						{#each { length: current.maxLevel } as _, k (k)}
							<span class="pip" class:on={k < current.level}></span>
						{/each}
					</span>
					<span class="lvl">Level {current.level} of {current.maxLevel}</span>
					<span class="state" class:planned={current.status !== 'active'}
						><span class="sdot" aria-hidden="true"></span>{current.status === 'active'
							? 'Running'
							: current.statusText}</span
					>
				</div>
			</div>
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
					<span class="cap">Next · Level {current.upgrade.level + 1}</span>
					<span class="next num"
						>{current.upgrade.cost.toLocaleString('en-US')} funds · {current.upgrade.days} days</span
					>
					<button
						type="button"
						class="soft big"
						onclick={() => onupgrade(current.id)}
						data-testid="sc-upgrade">Upgrade to level {current.upgrade.level + 1}</button
					>
				</div>
			{/if}
			{#if current.action.kind === 'link'}
				<a class="open" href={current.action.href} data-testid="sc-open">{current.action.label}</a>
			{:else}
				<p class="why">{current.action.reason}</p>
			{/if}
			<div class="foot">
				<button
					type="button"
					class="demolish"
					data-testid="sc-demolish"
					onclick={() => (confirm = current.id)}
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
						><path d={DOZER} /></svg
					>{current.status === 'planned' || current.status === 'building'
						? 'Cancel construction'
						: 'Demolish'}</button
				>
			</div>
		</section>
	{/if}

	<!-- the context bar (V3 §1): bottom centre, its content follows the mode -->
	<div class="context">
		<!-- Overview · the Buildings strip (plan 349, ADR 0298): cards along the bottom like the Build
		     menu, above the bar; mounted while closed, so its list and attention lines keep their state -->
		<section
			class="strip"
			aria-label="Buildings"
			data-testid="sc-buildings-list"
			hidden={!(mode === 'overview' && listOpen)}
		>
			<div class="ph">
				<span class="cap">Buildings</span>
				<span class="count">{rows.length}</span>
				<span class="attention" data-testid="sc-attention">
					{#if attention.length === 0 && notes.length === 0}
						<span class="calm">Every building is running.</span>
					{:else}
						<ul class="warnings">
							{#each notes as note (note)}
								<li>{note}</li>
							{/each}
							{#each attention as row (row.id)}
								<li>{row.label}: {row.statusText}</li>
							{/each}
						</ul>
					{/if}
				</span>
				{#if flows.length > 0}
					<button
						type="button"
						class="more"
						aria-pressed={extra === 'flows'}
						onclick={() => (extra = extra === 'flows' ? null : 'flows')}>Flows</button
					>
				{/if}
				{#if market.length > 0}
					<button
						type="button"
						class="more"
						aria-pressed={extra === 'market'}
						onclick={() => (extra = extra === 'market' ? null : 'market')}>Market</button
					>
				{/if}
				{#if sites.length > 1}
					<label class="site-pick"
						><span>Site</span>
						<select
							data-testid="sc-site"
							value={siteId ?? sites[0]?.id}
							onchange={(e) => onsite((e.currentTarget as HTMLSelectElement).value)}
						>
							{#each sites as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
						</select></label
					>
				{/if}
			</div>
			{#if extra === 'flows' && flows.length > 0}
				<ul class="plain" data-testid="sc-flows">
					{#each flows as f (f)}<li>{f}</li>{/each}
				</ul>
			{/if}
			{#if extra === 'market' && market.length > 0}
				<ul class="plain market" data-testid="sc-market">
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
			{/if}
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<ul
				class="list"
				role="listbox"
				aria-label="Buildings"
				aria-orientation="horizontal"
				tabindex="0"
				onkeydown={onListKey}
				data-testid="sc-list"
			>
				{#each rows as row (row.id)}
					<li
						role="option"
						aria-selected={row.id === selected}
						onpointerenter={() => hoverCard(row.id)}
						onpointerleave={() => hoverCard(null)}
					>
						<button
							type="button"
							class="bcard"
							class:hot={row.id === hovered}
							data-testid="sc-row-{row.id}"
							data-tip={row.statusText}
							onclick={() => clickPin(row.id)}
							onfocus={() => hoverCard(row.id)}
							onblur={() => hoverCard(null)}
						>
							<span class="bhead">
								<span class="bthumb">
									{#if pictures[row.id]}
										<img src={pictures[row.id]} alt="" />
									{:else}
										<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
											><path d={ICON.building} /></svg
										>
									{/if}
								</span>
								<span class="bchip {row.status}">{STATUS_CHIP[row.status]}</span>
							</span>
							<span class="bname">{row.label}</span>
							<span class="bsub"
								>{row.status === 'active'
									? `Level ${row.level} of ${row.maxLevel}`
									: row.statusText}</span
							>
							{#if row.progress !== null}
								<span
									class="bbar"
									role="progressbar"
									aria-label="{row.label} progress"
									aria-valuemin="0"
									aria-valuemax="100"
									aria-valuenow={Math.round(row.progress * 100)}
									><span style="width:{Math.round(row.progress * 100)}%"></span></span
								>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		</section>
		{#if mode === 'build'}
			<BuildMenu
				{menu}
				{thumbnail}
				onpick={(kind) => onbuild(kind)}
				{tool}
				ontool={setTool}
				ondone={closeBuild}
				built={builtCount}
				placing={build ? placingChip : undefined}
			/>
		{:else if mode === 'focus'}
			<nav class="bar" aria-label="Building navigation" data-testid="sc-focus-bar">
				<button type="button" class="back" data-testid="sc-overview" onclick={() => onselect(null)}
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
						><path d={ICON.back} /></svg
					>Overview</button
				>
				<span class="rule" aria-hidden="true"></span>
				<button
					type="button"
					class="round"
					aria-label="Previous building"
					data-tip="Previous building"
					data-testid="sc-prev"
					onclick={() => onselect(stepBuilding(ids, selected, -1))}
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
						><path d={ICON.back} /></svg
					></button
				>
				<span class="which"
					><strong>{current?.label ?? ''}</strong><span>{focusLabel(ids, selected)}</span></span
				>
				<button
					type="button"
					class="round"
					aria-label="Next building"
					data-tip="Next building"
					data-testid="sc-next"
					onclick={() => onselect(stepBuilding(ids, selected, 1))}
					><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"
						><path d={ICON.next} /></svg
					></button
				>
			</nav>
		{:else}
			<nav class="bar" aria-label="Space Center actions" data-testid="sc-overview-bar">
				<button type="button" class="act" data-testid="sc-build" onclick={openBuild}
					><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
						><path d={ICON.build} /></svg
					>Build<span class="adot" aria-hidden="true"></span></button
				>
				<button
					type="button"
					class="act"
					class:on={listOpen}
					aria-pressed={listOpen}
					data-testid="sc-buildings"
					onclick={() => (listOpen = !listOpen)}
					><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
						><path d={ICON.list} /></svg
					>Buildings<span class="adot" aria-hidden="true"></span></button
				>
				{#if onfoundbranch}
					<button type="button" class="act" data-testid="sc-found-branch" onclick={onfoundbranch}
						><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
							><path d={ICON.branch} /></svg
						>Found a branch<span class="adot" aria-hidden="true"></span></button
					>
				{/if}
				<span class="rule" aria-hidden="true"></span>
				<button
					type="button"
					class="round"
					class:on={labelMode === 'always'}
					aria-pressed={labelMode === 'always'}
					aria-label="Building names: always shown"
					data-tip={labelMode === 'always' ? 'Names: always' : 'Names: on hover'}
					data-testid="sc-labels"
					onclick={() => onlabelmode(labelMode === 'always' ? 'hover' : 'always')}
					><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
						><path d={ICON.tag} /></svg
					><span class="adot" aria-hidden="true"></span></button
				>
			</nav>
		{/if}
	</div>
</div>

{#snippet placingChip()}
	{#if build}
		<!-- the placement chip (V3 §1.2; ADR 0254 point 3: in the bar, the ghost follows the pointer) -->
		<div class="placing" data-testid="sc-ghost" class:invalid={!build.valid}>
			<span class="pinfo">
				<strong>{build.label}</strong>
				{#if build.valid}
					<span>Click to place · R rotates · Esc cancels</span>
				{:else}
					{#each build.reasons as reason (reason)}<span class="reason">{reason}</span>{/each}
				{/if}
			</span>
			<button
				type="button"
				class="round"
				aria-label="Rotate"
				data-tip="Rotate (R)"
				data-testid="sc-rotate"
				onclick={onrotate}
				><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"
					><path d="M20 12 A8 8 0 1 1 17.7 6.3 M20 3 V7 H16" /></svg
				></button
			>
			<button type="button" class="soft" data-testid="sc-build-stop" onclick={() => onbuild(null)}
				>Cancel</button
			>
		</div>
	{/if}
{/snippet}

<style>
	.overlay {
		position: absolute;
		inset: 0;
		pointer-events: none;
		font-family: var(--font-ui);
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.overlay :global(button),
	.overlay :global(a),
	.overlay :global(select),
	.overlay :global(section),
	.overlay :global(aside),
	.overlay :global(nav),
	.overlay :global([role='dialog']) {
		pointer-events: auto;
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
		flex: none;
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
	.pin.red .tag {
		display: flex;
		border-color: rgb(255 138 142 / 0.5);
	}
	.pin.red .name {
		color: var(--danger);
	}
	.pin.red .dot {
		background: var(--danger);
	}
	.cap {
		font-size: var(--t-label);
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	/* the building panel at the right (V3 §1.4): the bars' glass, radius 16 */
	.detail {
		position: absolute;
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap));
		right: var(--margin-hud);
		box-sizing: border-box;
		max-height: calc(100% - 10rem);
		overflow-y: auto;
		scrollbar-width: thin;
		display: flex;
		flex-direction: column;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-panel);
	}
	/* the Buildings strip (plan 349, ADR 0298): the build bar's glass, width and cards */
	.strip {
		width: min(65rem, calc(100vw - 3rem));
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.5rem;
		border-radius: 18px;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
	}
	.strip[hidden] {
		display: none;
	}
	.ph {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		min-height: 2rem;
		padding: 0 0.25rem 0 0.5rem;
	}
	.count {
		font-size: var(--t-label);
		color: var(--text-subtle);
	}
	.attention {
		flex: 1;
		min-width: 0;
		font-size: var(--t-label);
		line-height: 1.3;
		color: var(--text-muted);
	}
	.warnings {
		display: flex;
		flex-wrap: wrap;
		gap: 0 0.75rem;
	}
	.warnings li {
		color: var(--warn);
	}
	.more {
		height: 1.75rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.more[aria-pressed='true'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
		border-color: transparent;
	}
	.site-pick {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.site-pick select {
		font: inherit;
		color: var(--text-primary);
		background: var(--surface-tile);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		padding: 0.25rem 0.75rem;
	}
	.list,
	.plain,
	.warnings {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.plain {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		padding: 0 0.5rem;
	}
	.plain li {
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.plain.market li {
		min-width: 12rem;
	}
	.list {
		display: flex;
		gap: 0.375rem;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	.list:focus-visible {
		outline: 2px solid var(--text-primary);
		border-radius: 12px;
	}
	.list li {
		flex: 1 0 11rem;
		max-width: 15rem;
		display: flex;
	}
	.bcard {
		width: 100%;
		min-height: 5.75rem;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.4375rem;
		padding: 0.625rem;
		border: 1px solid transparent;
		border-radius: 12px;
		background: rgb(255 255 255 / 0.035);
		color: var(--text-primary);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.bcard:hover,
	.bcard.hot {
		border-color: rgb(255 255 255 / 0.22);
		background: rgb(255 255 255 / 0.08);
	}
	.bcard:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: -2px;
	}
	.bhead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}
	.bthumb {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 1.75rem;
		border-radius: 7px;
		background: var(--surface-tile);
		color: var(--text-secondary);
		overflow: hidden;
	}
	.bthumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.bthumb svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linejoin: round;
	}
	.bchip {
		height: 1rem;
		padding: 0 0.375rem;
		display: flex;
		align-items: center;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--tone, var(--text-secondary)) 16%, transparent);
		color: var(--tone, var(--text-secondary));
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-chip);
		text-transform: uppercase;
	}
	.bchip.active {
		--tone: var(--ok);
	}
	.bchip.building,
	.bchip.upgrading {
		--tone: var(--warn);
	}
	.bname {
		font-size: var(--t-button);
		font-weight: 600;
		line-height: 1;
	}
	.bsub {
		font-size: var(--t-label);
		line-height: 1.3;
		color: var(--text-muted);
	}
	.bbar {
		width: 100%;
		height: 3px;
		border-radius: 2px;
		background: var(--surface-track);
		overflow: hidden;
	}
	.bbar span {
		display: block;
		height: 100%;
		background: var(--warn);
	}
	.detail {
		width: 20rem;
		gap: 0.75rem;
		padding: 0.875rem;
	}
	.dh {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.x {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}
	.x svg {
		stroke-width: 2.2;
	}
	.x:hover {
		color: var(--text-primary);
		background: var(--surface-hover);
	}
	.title {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	h2 {
		margin: 0;
		font-size: 1.375rem;
		line-height: 1.1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.levels {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}
	.pips {
		display: flex;
		gap: 3px;
	}
	.pip {
		width: 1.375rem;
		height: 0.25rem;
		border-radius: 2px;
		background: rgb(255 255 255 / 0.14);
	}
	.pip.on {
		background: var(--selected-bg);
	}
	.lvl {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.state {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		font-size: var(--t-label);
		font-weight: 600;
		color: var(--text-primary);
	}
	.sdot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background: var(--ok);
	}
	.state.planned .sdot {
		background: var(--warn);
	}
	.desc {
		margin: 0;
		font-size: var(--t-small);
		line-height: 1.45;
		color: var(--text-secondary);
	}
	.facts {
		display: flex;
		flex-direction: column;
		gap: 0.4375rem;
		margin: 0;
	}
	.facts div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		font-size: var(--t-label);
	}
	.facts dt {
		color: var(--text-muted);
	}
	.facts dd {
		margin: 0;
		font-weight: 600;
		color: var(--text-primary);
		text-align: right;
	}
	.upgrade {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.625rem;
		border-radius: 12px;
		background: var(--surface-inset);
	}
	.next {
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.open {
		height: 2.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 10px;
		text-decoration: none;
		font-size: var(--t-button);
		font-weight: 700;
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.why {
		margin: 0;
		font-size: var(--t-small);
		line-height: 1.4;
		color: var(--text-muted);
	}
	.foot {
		display: flex;
		gap: 0.375rem;
	}
	.demolish {
		height: 1.875rem;
		padding: 0 0.625rem;
		display: flex;
		align-items: center;
		gap: 0.375rem;
		border: 0;
		border-radius: 8px;
		background: transparent;
		color: var(--danger);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.demolish:hover {
		background: rgb(255 138 142 / 0.1);
	}
	.soft,
	.danger {
		height: 2rem;
		padding: 0 0.75rem;
		border: 0;
		border-radius: 9px;
		background: var(--surface-button);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 700;
		cursor: pointer;
	}
	.soft.big {
		height: 2.25rem;
		border-radius: 10px;
		font-size: var(--t-button);
	}
	.soft:hover {
		background: var(--surface-track);
	}
	.danger {
		background: rgb(255 138 142 / 0.14);
		color: var(--danger);
	}
	.danger:hover {
		background: rgb(255 138 142 / 0.22);
	}
	/* the demolish confirm (V3 §1.3): 248 wide, above the building */
	.confirm {
		position: absolute;
		transform: translate(-50%, -100%);
		width: 15.5rem;
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		padding: 0.75rem;
		border-radius: 14px;
		background: rgb(22 23 26 / 0.8);
		-webkit-backdrop-filter: blur(24px);
		backdrop-filter: blur(24px);
		border: 1px solid rgb(255 138 142 / 0.35);
		z-index: 3;
	}
	.confirm.floating {
		left: 50%;
		top: 40%;
	}
	.confirm-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--t-button);
		color: var(--text-primary);
	}
	.confirm-head strong {
		font-weight: 600;
	}
	.confirm-ico {
		display: grid;
		place-items: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 7px;
		background: rgb(255 138 142 / 0.12);
		color: var(--danger);
	}
	.confirm p {
		margin: 0;
		font-size: var(--t-label);
		line-height: 1.45;
		color: var(--text-muted);
	}
	.confirm-actions {
		display: flex;
		gap: 0.375rem;
	}
	.confirm-actions button {
		flex: 1;
	}
	/* the context bar (V3 §1): bottom 52, centred */
	.context {
		position: absolute;
		left: 50%;
		bottom: calc(env(safe-area-inset-bottom, 0px) + 3.25rem);
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 2px;
		height: 2.75rem;
		box-sizing: border-box;
		padding: 0.25rem;
		background: var(--surface-glass);
		-webkit-backdrop-filter: var(--bar-filter);
		backdrop-filter: var(--bar-filter);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		white-space: nowrap;
	}
	.act {
		position: relative;
		height: 2.25rem;
		padding: 0 0.875rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: #c4c4cc;
		font: inherit;
		font-size: var(--t-button);
		font-weight: 600;
		cursor: pointer;
	}
	.act:hover,
	.round:hover {
		background: var(--surface-hover);
		color: var(--text-primary);
	}
	.act.on,
	.round.on {
		color: var(--text-primary);
	}
	.adot {
		position: absolute;
		left: 50%;
		bottom: 3px;
		width: 4px;
		height: 4px;
		margin-left: -2px;
		border-radius: 50%;
	}
	.act.on .adot,
	.round.on .adot {
		background: var(--text-primary);
	}
	.rule {
		width: 1px;
		height: 1.125rem;
		margin: 0 0.25rem;
		background: rgb(255 255 255 / 0.12);
	}
	.round {
		position: relative;
		width: 2.25rem;
		height: 2.25rem;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		color: var(--text-subtle);
		cursor: pointer;
	}
	.back {
		height: 2.25rem;
		padding: 0 0.875rem 0 0.625rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: var(--selected-bg);
		color: var(--selected-fg);
		font: inherit;
		font-size: var(--t-button);
		font-weight: 700;
		cursor: pointer;
	}
	.back svg {
		stroke-width: 2.2;
	}
	.which {
		min-width: 9.375rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.which strong {
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.placing {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 3.25rem;
		padding: 0.25rem 0.375rem 0.25rem 0.625rem;
		border-radius: 12px;
		border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}
	.placing.invalid {
		border-color: rgb(255 138 142 / 0.5);
		background: rgb(255 138 142 / 0.06);
	}
	.pinfo {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.pinfo strong {
		font-size: var(--t-button);
		font-weight: 600;
		color: var(--text-primary);
	}
	.reason {
		color: var(--danger);
	}
	.act:focus-visible,
	.round:focus-visible,
	.back:focus-visible,
	.soft:focus-visible,
	.danger:focus-visible,
	.demolish:focus-visible,
	.x:focus-visible,
	.open:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 1px;
	}
	@media (pointer: coarse) {
		.act,
		.round,
		.back {
			min-height: var(--touch-min);
		}
	}
</style>
