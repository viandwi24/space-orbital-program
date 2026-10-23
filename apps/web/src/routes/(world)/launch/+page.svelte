<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Launch screen (plan 094, ADR 0150; redesigned by plan 346, ADR 0295 point 4): the vessel
	 * library on the left, the chosen vessel as a hero in the middle, and the facility, crew,
	 * checks and the big LAUNCH on the right.
	 */
	import {
		designLocks,
		loadWorldTech,
		NO_TREE,
		type WorldTech
	} from '../../../lib/tech/world-tech';
	import { goto } from '$app/navigation';
	import {
		designCost,
		homeBodyOf,
		loadPlugins,
		sitesOf,
		type Command,
		type Site,
		type Snapshot,
		type VesselDesign,
		type WorldInfo
	} from '@orbital/core';
	import { onMount } from 'svelte';
	import { worldSession } from '../../../lib/world-session';
	import { bootWorld } from '../../../lib/world-boot';
	import type { SimClient } from '../../../lib/sim-client';
	import { loadContent, partLookup } from '../../../lib/catalog';
	import { parseDesign, serialiseDesign } from '../../../lib/design';
	import { designStats } from '../../../lib/editor/stats';
	import { LAUNCH_REPORT, checkDesign } from '../../../lib/editor/checks';
	import { formatFunds, formatMass, formatSpeed } from '../../../lib/format';
	import {
		accepts,
		facilitiesOf,
		placementOf,
		saveLaunchChoice,
		seatIn,
		seatsOf,
		toggleSeat,
		type Facility
	} from '../../../lib/launch/launch-model';
	import {
		designKey as sameDesignKey,
		editedText,
		FILTER_LABELS,
		shownLibrary,
		SORT_LABELS,
		type ShownVessel,
		type VesselFilter,
		type VesselItem,
		type VesselSort
	} from '../../../lib/launch/vessel-library';
	import VesselPicture from '../../../lib/launch/VesselPicture.svelte';
	import FacilityArt from '../../../lib/launch/FacilityArt.svelte';
	import CrewPortrait from '../../../lib/astronauts/CrewPortrait.svelte';
	import { occupiedPrompt, spotOccupants } from '../../../lib/fleet-actions';
	import { limitsOn, massUpgrade } from '../../../lib/capacity';
	import { activePlugins } from '../../../lib/mods/runtime';
	import { BUILTIN_PLUGINS } from '../../../lib/builtins';
	import { GAME_NAME } from '../../../lib/public/about';
	import { bootedMods, modHint } from '../../../lib/save/mods';
	import { SaveController } from '../../../lib/save/save-controller.svelte';
	import { loadDraft, saveDraft, saveLibraryId } from '../../../lib/storage';
	import BackButton from '../../../lib/ui/BackButton.svelte';
	import Dialog from '../../../lib/ui/Dialog.svelte';
	import Icon from '../../../lib/ui/Icon.svelte';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import {
		browserEnv,
		deleteEntry,
		duplicateEntry,
		listEntries,
		memoryStore,
		renameEntry,
		withFallback
	} from '../../../lib/vab/library';
	import { indexedDbStore } from '../../../lib/vab/library-idb';
	import { activeWorldId } from '../../../lib/worlds/worlds';
	import { loadRoster } from '../../../lib/launch/roster';
	import {
		fanText,
		launchRange,
		rangeModeOf,
		type LaunchRange
	} from '../../../lib/range/range-model';

	const { catalog, content } = loadContent();
	// the world's own system (plan 124): a Sol world's site is on `sol.earth` (fixed with plan 125)
	let registries = $state.raw(loadPlugins([...BUILTIN_PLUGINS, ...activePlugins()]).registries);
	const lookup = partLookup(catalog);
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`)),
		world: activeWorldId
	});
	const store = withFallback(typeof indexedDB === 'undefined' ? memoryStore() : indexedDbStore());

	/** Available crew of the world's newest save (plan 108, ADR 0152 point 5). */
	let roster = $state.raw<{ id: string; name: string; profession: string }[]>([]);
	let seated = $state.raw<{ member: string; part: number }[]>([]);

	/** The world's home-planet space centers (plan 236): the HQ and its branches. */
	let launchSites = $state.raw<Site[]>([]);
	let siteId = $state<string | null>(null);
	const site = $derived(launchSites.find((s) => s.id === siteId) ?? launchSites[0] ?? null);
	let items = $state.raw<VesselItem[]>([]);
	let facilityId = $state<string | null>(null);
	let designKey = $state<string | null>(null);

	// the library's search, filter and sort (plan 346, ADR 0295 point 6)
	let query = $state('');
	let filter = $state<VesselFilter>('all');
	let sort = $state<VesselSort>('recent');
	const shown = $derived(shownLibrary(items, { query, filter, sort }));
	const listed = $derived([...(shown.hangar ? [shown.hangar] : []), ...shown.library]);
	const now = Date.now();

	let limits = $state(false);
	const facilities = $derived(site ? facilitiesOf(site, registries.buildings, limits) : []);
	// an aircraft from the Hangar starts on a runway by default (plan 063, ADR 0161 point 3)
	const preferred = $derived(
		items.find((d) => d.from === 'hangar')?.design.aircraft === true ? 'runway' : 'pad'
	);
	const facility = $derived(
		facilities.find((f) => f.id === facilityId) ??
			facilities.find((f) => f.kind === preferred) ??
			facilities[0] ??
			null
	);
	// an aircraft rolls out to a runway, anything else stands on a pad (plan 063, ADR 0161 point 3)
	const fits = (d: VesselItem): boolean =>
		facility !== null && accepts(facility, d.wet, d.design.aircraft === true);
	const overLimit = (d: VesselItem): boolean => facility !== null && !accepts(facility, d.wet);
	const chosen = $derived(
		listed.find((d) => d.key === designKey && fits(d)) ?? listed.find((d) => fits(d)) ?? null
	);
	const body = $derived(site ? registries.bodies.get(site.body) : undefined);
	const gravity = $derived(body ? (6.6743e-11 * body.mass) / (body.radius * body.radius) : 9.81);
	const seats = $derived(chosen ? seatsOf(chosen.design, registries.parts) : []);
	const deltaV = $derived(
		chosen ? designStats(chosen.design, content, 'sea-level', gravity).totalDv : null
	);
	// range safety: the site's fan and a nominal estimate of the drops (plan 127, ADR 0155 point 6)
	let worldInfo = $state.raw<WorldInfo | null>(null);
	const range = $derived.by((): LaunchRange | null => {
		if (!site || !body || !chosen || !worldInfo) return null;
		const dv = designStats(chosen.design, content, 'sea-level', gravity)
			.rows.filter((r) => r.dv > 0)
			.map((r) => r.dv);
		const home = homeBodyOf(registries.bodies.list())?.id === body.id;
		const mode = rangeModeOf(worldInfo, registries.rules, registries.presets);
		return launchRange(mode, site, body, home, worldInfo, dv);
	});
	const dropText = (d: LaunchRange['drops'][number]): string =>
		d.place === 'orbit'
			? 'reaches orbit'
			: `falls ${Math.round((d.downrange ?? 0) / 1000)} km downrange, ${
					d.place === 'site' ? `on site "${d.site}"` : d.place === 'land' ? 'on land' : 'at sea'
				}`;
	// the seats chosen in the Hangar (plan 218), for crew who are still available
	$effect(() => {
		void chosen?.key;
		const free = new Set(roster.map((r) => r.id));
		seated = (chosen?.design.crew ?? []).filter(
			(c) => free.has(c.member) && seats.some((p) => p.part === c.part)
		);
	});
	// the pre-flight report's crew items with the seats as they are now (plan 218)
	const report = $derived(
		chosen
			? checkDesign(
					{ design: chosen.design, loose: [] },
					content,
					{ liftoffTwr: null },
					undefined,
					[],
					null,
					seated.length > 0 ? seated : null
				).filter((c) => LAUNCH_REPORT.includes(c.id))
			: []
	);
	// the world's tech tree (plan 105, ADR 0154 point 4)
	let tech = $state<WorldTech>(NO_TREE);
	const locks = $derived(
		chosen ? designLocks(chosen.design, registries.techNodes.list(), registries.parts, tech) : []
	);

	// who stands on each facility now (plan 318, ADR 0274), from the running sim
	let client: SimClient | null = null;
	let snapshot = $state.raw<Snapshot | null>(null);
	const occupied = (f: Facility) =>
		site && snapshot
			? occupiedPrompt(spotOccupants(snapshot, site.id, { east: f.east, north: f.north }))
			: null;
	let fleetNote = $state<string | null>(null);
	let busy = $state(false);
	let terminating = $state<Facility | null>(null);
	async function clearSpot(
		f: Facility,
		kind: 'recover-vessel' | 'terminate-vessel'
	): Promise<void> {
		const prompt = occupied(f);
		if (!prompt || !client) return;
		busy = true;
		let why: string | null = null;
		for (const vessel of prompt.ids) {
			const r = await client.dispatch({ type: kind, vessel } as Command);
			if (!r.ok) why = r.reason;
		}
		fleetNote = why;
		await worldSession.saveNow();
		busy = false;
	}

	function itemOf(
		key: string,
		design: VesselDesign,
		from: VesselItem['from'],
		updatedAt: number,
		thumbnail: string | null
	): VesselItem {
		const stats = designStats(design, content, 'sea-level', gravity);
		const seats = design.parts.reduce(
			(n, p) => n + (registries.parts.get(p.part)?.crewCapacity ?? 0),
			0
		);
		return {
			key,
			name: design.name,
			from,
			design,
			wet: stats.wetMass,
			cost: designCost(design, registries).total,
			seats,
			parts: stats.partCount,
			updatedAt,
			thumbnail
		};
	}

	async function loadItems(): Promise<void> {
		const list: VesselItem[] = [];
		const draft = loadDraft();
		if (draft) {
			const parsed = parseDesign(draft, lookup);
			if (parsed.ok) list.push(itemOf('hangar', parsed.design, 'hangar', Date.now(), null));
		}
		for (const e of await listEntries(store, lookup, 'vessel'))
			if (e.ok)
				list.push(itemOf(e.record.id, e.design, 'library', e.record.updatedAt, e.record.thumbnail));
		// the Hangar's design takes the picture of its saved record
		const hangar = list.find((d) => d.from === 'hangar');
		if (hangar) {
			const key = sameDesignKey(hangar.design);
			const twin = list.find(
				(d) => d.from === 'library' && d.thumbnail && sameDesignKey(d.design) === key
			);
			if (twin) hangar.thumbnail = twin.thumbnail;
		}
		items = list;
	}

	onMount(() => {
		let gone = false;
		let off: (() => void) | null = null;
		void (async () => {
			const worlds = await saves.worldsService();
			const info = await worlds.startInfo(activeWorldId());
			if (info)
				registries = loadPlugins([...BUILTIN_PLUGINS, ...activePlugins()], {
					system: { id: info.systemId, variant: info.variant }
				}).registries;
			// the HQ and the branches, with their buildings as the running sim has them (construction
			// finishes on the world tick; the record is written by the Space Center)
			const all = sitesOf(info ?? { sites: [] });
			const live = worldSession.snapshot?.sites;
			launchSites = all
				.filter(
					(s) => s.body === all[0]?.body && (s.kind === 'space-center' || s.kind === 'branch')
				)
				.map((s) => {
					const now = live?.find((x) => x.id === s.id);
					return now ? { ...s, buildings: now.buildings, roads: now.roads } : s;
				});
			worldInfo = info ?? null;
			limits = limitsOn(info, registries);
			await loadItems();
			roster = await loadRoster(saves);
			tech = await loadWorldTech(saves, activeWorldId());
			// the running sim, for who stands on a pad (plan 318)
			try {
				const c = await bootWorld(worldSession, activeWorldId());
				if (gone) return;
				client = c;
				snapshot = worldSession.snapshot;
				off = c.onSnapshot((s) => (snapshot = s));
			} catch {
				// no sim: the facility cards say nothing about occupants
			}
		})();
		return () => {
			gone = true;
			off?.();
		};
	});

	function launch(): void {
		if (!site || !facility || !chosen || !body || locks.length > 0) return;
		saveDraft(serialiseDesign(chosen.design));
		saveLaunchChoice({
			facility: facility.id,
			placement: placementOf(site, facility),
			...(seated.length > 0 ? { crew: seated } : {})
		});
		void goto(resolve('/(world)/flight'));
	}

	const limit = (f: Facility): string =>
		f.massLimit === null ? 'Any vessel' : `Up to ${formatMass(f.massLimit * 1000)}`;

	// --- managing the library (plan 346, ADR 0295 point 6) ---------------------------------------
	let renaming = $state<string | null>(null);
	let renameText = $state('');
	let removing = $state<ShownVessel | null>(null);
	let removeCopies = $state(true);
	let libraryNote = $state<string | null>(null);

	async function act(run: () => Promise<unknown>): Promise<void> {
		try {
			await run();
			libraryNote = null;
		} catch (error) {
			libraryNote = (error as Error).message;
		}
		await loadItems();
	}
	function startRename(v: ShownVessel): void {
		renaming = v.key;
		renameText = v.name;
	}
	async function finishRename(v: ShownVessel): Promise<void> {
		if (renaming !== v.key) return;
		const name = renameText.trim();
		renaming = null;
		if (name === '' || name === v.name) return;
		await act(() => renameEntry(store, browserEnv(), v.key, name));
	}
	async function confirmRemove(): Promise<void> {
		const v = removing;
		removing = null;
		if (!v) return;
		await act(async () => {
			for (const id of [v.key, ...(removeCopies ? v.copies : [])]) await deleteEntry(store, id);
		});
		if (designKey === v.key) designKey = null;
	}
	function openInHangar(v: ShownVessel): void {
		saveDraft(serialiseDesign(v.design));
		saveLibraryId(v.from === 'library' ? v.key : (v.copies[0] ?? null));
		void goto(resolve('/(world)/vab'));
	}

	// --- seats by drag (plan 346) ---------------------------------------------------------------------
	let dragging = $state<string | null>(null);
	let dropPart = $state<number | null>(null);
	const memberOf = (id: string) => roster.find((r) => r.id === id);
</script>

<PageMeta title="Launch · {GAME_NAME}" />

{#snippet card(v: ShownVessel)}
	{@const ok = fits(v)}
	<div class="vcard" class:on={chosen?.key === v.key} class:off={!ok}>
		<button
			type="button"
			role="radio"
			class="pick"
			aria-checked={chosen?.key === v.key}
			aria-disabled={!ok}
			data-testid="launch-design"
			onclick={() => {
				if (ok) designKey = v.key;
			}}
		>
			<span class="thumb"
				><VesselPicture
					design={v.design}
					thumbnail={v.thumbnail}
					parts={registries.parts}
					width={44}
					height={52}
				/></span
			>
			<span class="text">
				<span class="name" class:hidden={renaming === v.key}
					>{v.name}{#if v.variant !== null}<span class="tag">v{v.variant}</span>{/if}</span
				>
				<span class="sub"
					>{formatMass(v.wet)} · {v.parts} parts{v.seats > 0 ? ` · ${v.seats} seats` : ''}</span
				>
				<span class="sub faint"
					>{v.from === 'hangar'
						? v.copies.length > 0
							? 'Open in the Hangar · saved'
							: 'Open in the Hangar · not saved'
						: `Edited ${editedText(v.updatedAt, now)}${
								v.copies.length > 0 ? ` · ×${v.copies.length + 1} copies` : ''
							}`}</span
				>
			</span>
		</button>
		{#if renaming === v.key}
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="rename"
				bind:value={renameText}
				maxlength="48"
				aria-label="New name"
				autofocus
				onkeydown={(e) => {
					if (e.key === 'Enter') void finishRename(v);
					if (e.key === 'Escape') renaming = null;
				}}
				onblur={() => void finishRename(v)}
			/>
		{/if}
		<span class="tools">
			<button
				type="button"
				class="tool"
				aria-label="Open {v.name} in the Hangar"
				data-tip="Open in the Hangar"
				onclick={() => openInHangar(v)}><Icon name="hangar" size={14} /></button
			>
			{#if v.from === 'library'}
				<button
					type="button"
					class="tool"
					aria-label="Rename {v.name}"
					data-tip="Rename"
					onclick={() => startRename(v)}><Icon name="pencil" size={14} /></button
				>
				<button
					type="button"
					class="tool"
					aria-label="Duplicate {v.name}"
					data-tip="Duplicate"
					onclick={() => void act(() => duplicateEntry(store, browserEnv(), v.key))}
					><Icon name="copy" size={14} /></button
				>
				<button
					type="button"
					class="tool danger"
					aria-label="Delete {v.name}"
					data-tip="Delete"
					onclick={() => {
						removeCopies = true;
						removing = v;
					}}><Icon name="trash" size={14} /></button
				>
			{/if}
		</span>
		{#if overLimit(v)}
			<!-- over this pad's limit, with the upgrade that takes it (plan 096, ADR 0123) -->
			<p class="over" data-testid="launch-over-limit">
				Too heavy for {facility?.label}: {massUpgrade(registries.buildings, v.wet) ??
					'no pad takes this mass'}
			</p>
		{/if}
	</div>
{/snippet}

<main class="launch">
	<header>
		<BackButton href={resolve('/(world)/vab')} label="Back to the Hangar" />
		<div class="title">
			<span class="cap">Launch</span>
			<h1>{site?.name ?? 'Space Center'}</h1>
		</div>
		{#if launchSites.length > 1}
			<div class="sites" role="radiogroup" aria-label="Launch site" data-testid="launch-sites">
				{#each launchSites as s (s.id)}
					<button
						type="button"
						role="radio"
						class="site"
						aria-checked={site?.id === s.id}
						data-testid="launch-site-{s.id}"
						onclick={() => {
							siteId = s.id;
							facilityId = null;
						}}
					>
						{s.name}<span class="sub">{s.kind === 'branch' ? 'Branch' : 'HQ'}</span>
					</button>
				{/each}
			</div>
		{/if}
	</header>

	<div class="cols">
		<!-- the vessel library -->
		<section class="panel library" aria-label="Vessels" data-testid="launch-designs">
			<div class="phead">
				<span class="cap">Vessels <span class="count">{listed.length}</span></span>
				<label class="sort">
					<span class="sr-only">Sort by</span>
					<select bind:value={sort}>
						{#each Object.entries(SORT_LABELS) as [id, label] (id)}
							<option value={id}>{label}</option>
						{/each}
					</select>
				</label>
			</div>
			<label class="search">
				<Icon name="search" size={14} />
				<span class="sr-only">Search vessels</span>
				<input bind:value={query} placeholder="Search vessels" spellcheck="false" />
			</label>
			<div class="filters">
				<div class="chips" role="radiogroup" aria-label="Show">
					{#each Object.entries(FILTER_LABELS) as [id, label] (id)}
						<button
							type="button"
							role="radio"
							class="chip"
							aria-checked={filter === id}
							onclick={() => (filter = id as VesselFilter)}>{label}</button
						>
					{/each}
				</div>
			</div>
			<div class="vlist" role="radiogroup" aria-label="Vessel">
				{#if shown.hangar}
					<span class="group">In the Hangar</span>
					{@render card(shown.hangar)}
				{/if}
				{#if shown.library.length > 0}
					<span class="group">Library · {shown.library.length}</span>
					{#each shown.library as v (v.key)}
						{@render card(v)}
					{/each}
				{/if}
				{#if listed.length === 0}
					<p class="empty">
						{items.length === 0
							? 'No vessel yet. Build one in the Hangar.'
							: 'No vessel matches. Clear the search or the filter.'}
					</p>
				{:else if !chosen}
					<p class="empty">No vessel fits this facility. Choose another, or build a lighter one.</p>
				{/if}
			</div>
			{#if libraryNote}<p class="warn" role="status">{libraryNote}</p>{/if}
		</section>

		<!-- the hero -->
		<section class="hero" aria-label="Chosen vessel">
			<div class="stage">
				<svg class="backdrop" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden="true">
					<defs>
						<radialGradient id="launch-glow" cx="50%" cy="80%" r="60%">
							<stop offset="0" stop-color="#ffffff" stop-opacity="0.1" />
							<stop offset="1" stop-color="#ffffff" stop-opacity="0" />
						</radialGradient>
					</defs>
					<rect width="400" height="300" fill="url(#launch-glow)" />
					<path d="M0 262 H400" class="horizon" />
					<ellipse cx="200" cy="268" rx="110" ry="12" class="padring" />
					<ellipse cx="200" cy="268" rx="56" ry="6" class="padring" />
				</svg>
				{#if chosen}
					{#key chosen.key}
						<div class="ship">
							<VesselPicture
								design={chosen.design}
								thumbnail={chosen.thumbnail}
								parts={registries.parts}
								width={260}
								height={300}
							/>
						</div>
					{/key}
				{/if}
				<div class="label">
					<span class="cap"
						>{chosen?.from === 'hangar'
							? 'From the Hangar'
							: chosen
								? 'From the library'
								: 'Nothing chosen'}</span
					>
					<h2>{chosen?.name ?? 'No vessel'}</h2>
				</div>
			</div>
			<div class="stats" data-testid="launch-summary">
				<div class="stat">
					<span class="k">Mass</span><span class="v">{chosen ? formatMass(chosen.wet) : '—'}</span>
				</div>
				<div class="stat">
					<span class="k">Cost</span><span class="v">{chosen ? formatFunds(chosen.cost) : '—'}</span
					>
				</div>
				<div class="stat">
					<span class="k">Parts</span><span class="v">{chosen?.parts ?? '—'}</span>
				</div>
				<div class="stat">
					<span class="k">Δv sea level</span><span class="v"
						>{deltaV !== null ? formatSpeed(deltaV) : '—'}</span
					>
				</div>
				<div class="stat">
					<span class="k">Seats</span><span class="v">{chosen?.seats ?? '—'}</span>
				</div>
			</div>
			{#if report.length > 0 || locks.length > 0 || range}
				<div class="notes">
					{#each report as c (c.id)}
						<p class="warn" role="status" data-testid="launch-check-{c.id}">{c.text}</p>
					{/each}
					{#each locks as l (l.title)}
						<p class="locked" role="status" data-testid="launch-locked">
							"{l.title}" is locked: research "{l.node}" in R&D.
						</p>
					{/each}
					{#if range}
						<div class="range" data-testid="launch-range">
							<span class="cap"
								>Range safety · {range.mode === 'hard' ? 'enforced' : 'penalties'}</span
							>
							<p class="note">
								Safe fan: {fanText(range.fan)}{range.east
									? ''
									: '; the eastward ascent is outside it'}.
							</p>
							{#each range.drops as d (d.stage)}
								<p class="note" data-testid="launch-drop">Stage {d.stage + 1} {dropText(d)}.</p>
							{/each}
							{#if range.penalty.funds > 0}
								<p class="warn" role="status" data-testid="launch-range-penalty">
									{range.mode === 'hard'
										? 'Staging over land or a site will be refused in flight.'
										: `Estimated penalty: ${formatFunds(range.penalty.funds)} and ${range.penalty.reputation} reputation.`}
								</p>
							{/if}
							<p class="note">
								An estimate: each drop is judged in flight, when the stage separates.
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</section>

		<!-- facility, crew, LAUNCH -->
		<section class="side">
			<div class="panel" data-testid="launch-facilities">
				<div class="phead"><span class="cap">Facility</span></div>
				<div class="facs" role="radiogroup" aria-label="Launch facility">
					{#each facilities as f (f.id)}
						{@const occ = occupied(f)}
						<div class="fac" class:on={facility?.id === f.id}>
							<button
								type="button"
								role="radio"
								class="fpick"
								aria-checked={facility?.id === f.id}
								data-testid="launch-facility-{f.id}"
								onclick={() => (facilityId = f.id)}
							>
								<FacilityArt kind={f.kind} />
								<span class="text">
									<span class="name">{f.label}</span>
									<span class="sub">{limit(f)}</span>
									<span class="status" class:busy={occ}
										><span class="dot" aria-hidden="true"></span>{occ
											? `Occupied: ${occ.names}`
											: 'Free'}</span
									>
								</span>
							</button>
							{#if occ}
								<div class="clear">
									{#if occ.canRecover}
										<button
											type="button"
											class="small"
											disabled={busy}
											onclick={() => void clearSpot(f, 'recover-vessel')}
											>Recover{occ.credit ? ` (+${occ.credit})` : ''}</button
										>
									{/if}
									<button
										type="button"
										class="small danger"
										disabled={busy}
										onclick={() =>
											occ.crewWarning ? (terminating = f) : void clearSpot(f, 'terminate-vessel')}
										>Terminate</button
									>
								</div>
							{/if}
						</div>
					{:else}
						<p class="empty">
							This site has no launch pad or runway. Build one in the Space Center.
						</p>
					{/each}
				</div>
				{#if fleetNote}<p class="warn" role="status">{fleetNote}</p>{/if}
			</div>

			<div class="panel">
				<div class="phead">
					<span class="cap">Crew · {seated.length} of {chosen?.seats ?? 0} seats</span>
				</div>
				{#if seats.length > 0}
					<div class="seats" role="list" aria-label="Seats">
						{#each seats as p (p.part)}
							{#each Array.from({ length: p.capacity }) as _, i (i)}
								{@const who = seated.filter((s) => s.part === p.part)[i]}
								{@const m = who ? memberOf(who.member) : undefined}
								<span
									class="seat"
									class:on={who}
									class:drop={dropPart === p.part && dragging !== null}
									role="listitem"
									data-tip={m
										? `${m.name}, ${p.title}`
										: `${p.title}, seat ${i + 1}: drop crew here`}
									ondragover={(e) => {
										if (!dragging) return;
										e.preventDefault();
										dropPart = p.part;
									}}
									ondragleave={() => (dropPart = null)}
									ondrop={(e) => {
										e.preventDefault();
										if (dragging) seated = seatIn(seated, seats, dragging, p.part);
										dragging = null;
										dropPart = null;
									}}
								>
									{#if who}
										<CrewPortrait
											member={{ id: who.member, profession: m?.profession ?? 'pilot' }}
											size={44}
										/>
									{:else}
										<Icon name="plus" size={14} />
									{/if}
								</span>
							{/each}
						{/each}
					</div>
				{/if}
				{#if roster.length > 0 && seats.length > 0}
					<div class="crew" role="group" aria-label="Available crew">
						{#each roster as m (m.id)}
							<button
								type="button"
								class="member"
								draggable="true"
								aria-pressed={seated.some((s) => s.member === m.id)}
								data-testid="launch-crew-{m.id}"
								ondragstart={(e) => {
									dragging = m.id;
									e.dataTransfer?.setData('text/plain', m.id);
								}}
								ondragend={() => {
									dragging = null;
									dropPart = null;
								}}
								onclick={() => (seated = toggleSeat(seated, seats, m.id))}
							>
								<CrewPortrait member={{ id: m.id, profession: m.profession }} size={28} />
								<span class="mname">{m.name}</span><span class="sub">{m.profession}</span>
								<span class="tick" aria-hidden="true"><Icon name="check" size={12} /></span>
							</button>
						{/each}
					</div>
				{:else}
					<p class="note">
						{#if seats.length === 0}
							This vessel has no seats.
						{:else}
							No crew available: hire in the <a href={resolve('/(world)/astronauts')}
								>Astronaut Complex</a
							>.
						{/if}
					</p>
				{/if}
			</div>

			<button
				type="button"
				class="go"
				disabled={!chosen || !facility || locks.length > 0}
				data-testid="launch-go"
				onclick={launch}
			>
				<span class="word">Launch</span>
				<span class="where"
					>{facility?.kind === 'runway' ? 'roll out to runway' : 'from pad'}{facility
						? ` · ${facility.label}`
						: ''}</span
				>
			</button>
		</section>
	</div>
</main>

<Dialog
	open={removing !== null}
	title="Delete {removing?.name ?? 'vessel'}?"
	onclose={() => (removing = null)}
>
	<p class="dtext">It leaves the library for good. This can't be undone.</p>
	{#if removing && removing.copies.length > 0}
		<label class="dcheck">
			<input type="checkbox" bind:checked={removeCopies} />
			Also delete its {removing.copies.length} identical
			{removing.copies.length === 1 ? 'copy' : 'copies'}
		</label>
	{/if}
	<div class="dbuttons">
		<button type="button" class="small" onclick={() => (removing = null)}>Cancel</button>
		<button
			type="button"
			class="small danger solid"
			data-testid="launch-delete-confirm"
			onclick={() => void confirmRemove()}>Delete</button
		>
	</div>
</Dialog>

<Dialog
	open={terminating !== null}
	title="Terminate the vessel on {terminating?.label ?? 'the pad'}?"
	onclose={() => (terminating = null)}
>
	<p class="dtext">{terminating ? (occupied(terminating)?.crewWarning ?? '') : ''}</p>
	<div class="dbuttons">
		<button type="button" class="small" onclick={() => (terminating = null)}>Cancel</button>
		<button
			type="button"
			class="small danger solid"
			onclick={() => {
				const f = terminating;
				terminating = null;
				if (f) void clearSpot(f, 'terminate-vessel');
			}}>Terminate</button
		>
	</div>
</Dialog>

<style>
	.launch {
		min-height: 100vh;
		min-height: 100dvh;
		box-sizing: border-box;
		padding: var(--margin-hud) var(--margin-hud) calc(3.5rem + var(--safe-bottom));
		background:
			radial-gradient(80rem 40rem at 50% 110%, rgb(255 255 255 / 0.05), transparent 60%),
			var(--bg-ground);
	}
	header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 1.25rem;
	}
	.title {
		display: grid;
		gap: 0.25rem;
	}
	.cap {
		font-size: var(--t-label);
		line-height: 1;
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	h1 {
		margin: 0;
		font-size: var(--t-display);
		line-height: 1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.sites {
		display: flex;
		gap: 0.25rem;
		margin-left: auto;
		padding: 0.25rem;
		border-radius: var(--radius-pill);
		background: var(--surface-inset);
	}
	.site {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		height: 2rem;
		padding: 0 0.875rem;
		border: 0;
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.site[aria-checked='true'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
	}
	.site[aria-checked='true'] .sub {
		color: inherit;
		opacity: 0.6;
	}

	.cols {
		display: grid;
		grid-template-columns: 21rem minmax(0, 1fr) 22rem;
		gap: 0.75rem;
		align-items: start;
	}
	.panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		border-radius: var(--radius-card);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	.phead {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem 0.25rem 0;
	}
	.count {
		margin-left: 0.25rem;
		font-size: var(--t-label);
		color: var(--text-subtle);
	}

	/* library */
	.library {
		max-height: calc(100dvh - 13rem);
		min-height: 0;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		height: 2.125rem;
		padding: 0 0.75rem;
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		color: var(--text-muted);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		outline: none;
	}
	.filters {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.chips {
		display: flex;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}
	.chip {
		height: 1.5rem;
		padding: 0 0.5rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: transparent;
		color: var(--text-muted);
		font: inherit;
		font-size: var(--t-label);
		font-weight: 600;
		cursor: pointer;
	}
	.chip[aria-checked='true'] {
		background: var(--selected-bg);
		color: var(--selected-fg);
		border-color: transparent;
	}
	.sort select {
		height: 1.5rem;
		padding: 0 0.375rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		color: var(--text-secondary);
		font: inherit;
		font-size: var(--t-label);
	}
	.vlist {
		display: flex;
		flex-direction: column;
		gap: 2px;
		overflow-y: auto;
		scrollbar-width: thin;
		min-height: 0;
		margin: 0 -0.25rem;
		padding: 0 0.25rem;
	}
	.group {
		margin: 0.5rem 0.25rem 0.25rem;
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-subtle);
	}
	.vcard {
		position: relative;
		flex: none;
		border-radius: 0.75rem;
	}
	.vcard:hover,
	.vcard.on {
		background: var(--surface-tile);
	}
	.vcard.on {
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
	}
	.vcard.off .pick {
		opacity: 0.5;
		cursor: default;
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		padding: 0.375rem 0.5rem;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.pick:focus-visible {
		outline: 2px solid var(--text-primary);
		border-radius: 0.75rem;
	}
	.thumb {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3.5rem;
		flex: none;
		border-radius: 0.5rem;
		background: var(--surface-inset);
	}
	.text {
		display: grid;
		gap: 0.1875rem;
		min-width: 0;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: var(--t-button);
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.name.hidden {
		visibility: hidden;
	}
	.tag {
		padding: 0 0.3125rem;
		border-radius: var(--radius-pill);
		background: rgb(255 255 255 / 0.1);
		font-size: var(--t-label);
		font-weight: 700;
		color: var(--text-secondary);
	}
	.sub {
		font-size: var(--t-label);
		color: var(--text-muted);
	}
	.faint {
		color: var(--text-subtle);
	}
	.rename {
		position: absolute;
		left: 4rem;
		top: 0.375rem;
		width: calc(100% - 5rem);
		height: 1.5rem;
		box-sizing: border-box;
		padding: 0 0.5rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-tile);
		background: var(--surface-inset);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		outline: none;
	}
	.tools {
		position: absolute;
		right: 0.375rem;
		bottom: 0.375rem;
		display: none;
		gap: 2px;
	}
	.vcard:hover .tools,
	.vcard:focus-within .tools {
		display: flex;
	}
	.tool {
		display: grid;
		place-items: center;
		width: 1.625rem;
		height: 1.625rem;
		padding: 0;
		border: 0;
		border-radius: 0.4375rem;
		background: var(--surface-glass);
		color: var(--text-secondary);
		cursor: pointer;
	}
	.tool:hover {
		background: var(--surface-track);
		color: var(--text-primary);
	}
	.tool.danger:hover {
		color: var(--danger);
	}
	.over {
		margin: 0 0.5rem 0.375rem 4.125rem;
		font-size: var(--t-label);
		color: var(--warn);
	}

	/* hero */
	.hero {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		min-width: 0;
	}
	.stage {
		position: relative;
		height: min(30rem, calc(100dvh - 19rem));
		min-height: 18rem;
		border-radius: 1.25rem;
		overflow: hidden;
		background: linear-gradient(180deg, #0d1016 0%, #12151b 70%, #0b0c0f 100%);
		border: 1px solid var(--border-subtle);
	}
	.backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.horizon,
	.padring {
		fill: none;
		stroke: rgb(255 255 255 / 0.12);
		stroke-width: 1;
		vector-effect: non-scaling-stroke;
	}
	.ship {
		position: absolute;
		left: 50%;
		bottom: 10%;
		height: 80%;
		aspect-ratio: 260 / 300;
		transform: translateX(-50%);
		display: grid;
		place-items: end center;
		animation: rise var(--dur-med) var(--ease);
	}
	.ship :global(.pic) {
		width: 100% !important;
		height: 100% !important;
		color: var(--text-primary);
	}
	@keyframes rise {
		from {
			opacity: 0;
			transform: translate(-50%, 8px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ship {
			animation: none;
		}
	}
	.label {
		position: absolute;
		left: 1.25rem;
		top: 1.125rem;
		display: grid;
		gap: 0.375rem;
	}
	h2 {
		margin: 0;
		font-size: 1.75rem;
		line-height: 1.1;
		font-weight: 300;
		color: var(--text-primary);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.375rem;
	}
	.stat {
		display: grid;
		gap: 0.375rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-tile);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	.k {
		font-size: var(--t-label);
		font-weight: 700;
		letter-spacing: var(--tracking-label);
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.v {
		font-size: var(--t-value);
		font-weight: 600;
		color: var(--text-primary);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.notes {
		display: grid;
		gap: 0.25rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-tile);
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
	}
	.range {
		display: grid;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}

	/* side */
	.side {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.facs {
		display: grid;
		gap: 0.375rem;
	}
	.fac {
		border-radius: 0.75rem;
		background: var(--surface-inset);
		border: 1px solid transparent;
	}
	.fac.on {
		border-color: rgb(255 255 255 / 0.22);
		background: var(--surface-tile);
	}
	.fpick {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.5rem 0.75rem 0.5rem 0.375rem;
		border: 0;
		background: transparent;
		color: var(--text-primary);
		text-align: left;
		font: inherit;
		cursor: pointer;
	}
	.fpick:focus-visible {
		outline: 2px solid var(--text-primary);
		border-radius: 0.75rem;
	}
	.status {
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		font-size: var(--t-label);
		font-weight: 600;
		color: var(--ok);
	}
	.status.busy {
		color: var(--warn);
	}
	.dot {
		width: 6px;
		height: 6px;
		flex: none;
		border-radius: 50%;
		background: currentColor;
	}
	.clear {
		display: flex;
		gap: 0.375rem;
		padding: 0 0.75rem 0.625rem;
	}
	.small {
		height: 1.75rem;
		padding: 0 0.75rem;
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-pill);
		background: var(--surface-button);
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		font-weight: 600;
		cursor: pointer;
	}
	.small.danger {
		color: var(--danger);
	}
	.small.danger.solid {
		background: var(--danger);
		color: #fff;
		border-color: transparent;
	}
	.small:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.seats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0 0.25rem;
	}
	.seat {
		display: grid;
		place-items: center;
		width: 2.75rem;
		height: 2.75rem;
		box-sizing: border-box;
		border-radius: 50%;
		border: 1.5px dashed rgb(255 255 255 / 0.2);
		color: var(--text-subtle);
	}
	.seat.on {
		border: 0;
		box-shadow: 0 0 0 2px var(--surface-tile);
	}
	.seat.drop {
		border-color: var(--text-primary);
		color: var(--text-primary);
		background: rgb(255 255 255 / 0.06);
	}
	.crew {
		display: grid;
		gap: 2px;
		max-height: 14rem;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.member {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.3125rem 0.5rem;
		border: 0;
		border-radius: var(--radius-tile);
		background: transparent;
		color: var(--text-primary);
		font: inherit;
		font-size: var(--t-small);
		cursor: grab;
	}
	.member:hover,
	.member[aria-pressed='true'] {
		background: var(--surface-tile);
	}
	.mname {
		font-weight: 600;
	}
	.member .sub {
		text-transform: capitalize;
	}
	.tick {
		margin-left: auto;
		color: var(--ok);
		visibility: hidden;
	}
	.member[aria-pressed='true'] .tick {
		visibility: visible;
	}
	.empty,
	.note {
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--text-muted);
	}
	.locked,
	.warn {
		margin: 0.25rem;
		font-size: var(--t-small);
		color: var(--warn);
	}
	/* the big LAUNCH (ADR 0295 point 4) */
	.go {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		width: 100%;
		height: 4rem;
		border: 0;
		border-radius: 1.25rem;
		background: #f4f4f5;
		color: #0b0b0c;
		font: inherit;
		cursor: pointer;
		box-shadow: 0 10px 36px rgb(0 0 0 / 0.45);
	}
	.go:hover:not(:disabled) {
		background: #fff;
	}
	.go:focus-visible {
		outline: 2px solid var(--text-primary);
		outline-offset: 2px;
	}
	.go .word {
		font-size: 1.125rem;
		font-weight: 800;
		letter-spacing: 0.28em;
		text-transform: uppercase;
	}
	.go .where {
		font-size: var(--t-label);
		font-weight: 600;
		opacity: 0.6;
	}
	.go:disabled {
		background: var(--surface-button);
		color: var(--text-disabled);
		box-shadow: none;
		cursor: not-allowed;
	}
	.dtext {
		margin: 0 0 0.75rem;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.dcheck {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.dbuttons {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	@media (max-width: 1199px) {
		.cols {
			grid-template-columns: 19rem minmax(0, 1fr);
		}
		.side {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 799px) {
		.cols {
			grid-template-columns: 1fr;
		}
		.stats {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
