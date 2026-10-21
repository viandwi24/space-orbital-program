<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Space Center (plan 091, ADR 0117): the active world's first site in 3D from its building
	 * list, the overlay, and build mode. Buildings are checked with core's `canPlace` here and placed
	 * by the sim's `place-building`; the site list is then written into the world record.
	 */
	import {
		branchHqOf,
		homeBodyOf,
		hqReady,
		loadPlugins,
		SITE_BLEND_WIDTH,
		SITE_FLAT_RADIUS,
		sitesOf,
		terrainSeedOf,
		type Site,
		upkeepOf,
		type Rotation,
		type Snapshot,
		type WorldInfo
	} from '@orbital/core';
	import { BUILTIN_PLUGINS, STOCK_CHOICE } from '../../../lib/builtins';
	import { onMount } from 'svelte';
	import { pageShell } from '../../../lib/layout/page-actions.svelte';
	import { buildMenu, type BuildCard } from '../../../lib/space-center/build-menu';
	import BranchPicker from '../../../lib/space-center/BranchPicker.svelte';
	import { branchId, type BranchContext } from '../../../lib/space-center/branch-model';
	import { buildingThumbnails } from '../../../lib/space-center/thumbnails';
	import { bodyLabel } from '../../../lib/hud-model';
	import { GAME_NAME } from '../../../lib/public/about';
	import { bootedMods, modHint } from '../../../lib/save/mods';
	import { SaveController } from '../../../lib/save/save-controller.svelte';
	import { worldSession } from '../../../lib/world-session';
	import { bootWorld } from '../../../lib/world-boot';
	import { goto } from '$app/navigation';
	import { activePlugins } from '../../../lib/mods/runtime';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import PerfOverlay from '../../../lib/perf/PerfOverlay.svelte';
	import { settings } from '../../../lib/settings/settings.svelte';
	import SpaceCenterOverlay from '../../../lib/space-center/SpaceCenterOverlay.svelte';
	import {
		buildingRows,
		checkGhost,
		confirmPlacement,
		ghostCell,
		nextRotation,
		siteViews,
		pinPositions,
		upkeepWarning,
		flowRows,
		firstFreeCell,
		marketRows,
		productionNote,
		type GhostCheck,
		type SiteState
	} from '../../../lib/space-center/model';
	import { startSpaceCenter, type SpaceCenter } from '../../../lib/space-center/space-center-loop';
	import { activeWorldId } from '../../../lib/worlds/worlds';

	// The world's one sim (plan 204, ADR 0201): construction and spending happen in it, and the
	// world layout autosaves it after a change.
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`)),
		world: () => worldId
	});
	/** The world's own system once it is known (a Sol world's site is on `sol.earth`, plan 124). */
	const registriesOf = (info?: WorldInfo) =>
		loadPlugins([...BUILTIN_PLUGINS, ...activePlugins()], {
			system: info ? { id: info.systemId, variant: info.variant } : STOCK_CHOICE
		}).registries;
	let registries = $state.raw(registriesOf());
	const buildingRegistry = $derived(registries.buildings);
	/** The site shown in the overlay (plan 128): the primary site, or a base on another body. */
	let siteId = $state<string | null>(null);

	let canvas: HTMLCanvasElement;
	let center: SpaceCenter | null = null;
	let worldId = activeWorldId();
	let world = $state.raw<WorldInfo | undefined>(undefined);
	const homeId = $derived(homeBodyOf(registries.bodies.list(), world)?.id);
	let site = $state.raw<SiteState | undefined>(undefined);
	let selected = $state<string | null>(null);
	let labels = $state.raw<Record<string, { x: number; y: number } | null>>({});
	/** Building names on the pins (plan 259): on hover and selection, or always; remembered per browser. */
	const LABELS_KEY = 'orbital.space-center.labels';
	const readLabelMode = (): 'hover' | 'always' => {
		try {
			return localStorage.getItem(LABELS_KEY) === 'always' ? 'always' : 'hover';
		} catch {
			return 'hover';
		}
	};
	let labelMode = $state<'hover' | 'always'>(readLabelMode());
	let hovered = $state<string | null>(null);
	function setLabelMode(mode: 'hover' | 'always'): void {
		labelMode = mode;
		try {
			localStorage.setItem(LABELS_KEY, mode);
		} catch {
			// private window or blocked storage: the choice lasts for this visit
		}
	}
	/** Frames the camera on a building; the camera eases there unless the player prefers reduced motion. */
	function frame(id: string | null): void {
		const row = id === null ? undefined : rows.find((r) => r.id === id);
		const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		center?.renderer?.setSiteFocus(
			row ? { east: row.anchor.east, north: row.anchor.north, up: 0 } : null,
			{ ...(row ? { distance: 160 } : {}), animate: !still }
		);
	}
	let problem = $state<string | null>(null);
	let build = $state<{ kind: string; rotation: Rotation } | null>(null);
	let hover = $state.raw<{ cell: { i: number; j: number }; check: GhostCheck } | null>(null);

	let today = $state<number | undefined>(undefined);
	let funds = $state<number | undefined>(undefined);
	let economy = $state.raw<Snapshot['economy']>(undefined);
	/** Building kinds that run a recipe (plan 097). */
	const producers = $derived(new Set(registries.recipes.list().map((r) => r.building)));
	/** Construction finished while the page is open (plan 096, ADR 0123 point 6). */
	let finished = $state.raw<string[]>([]);
	const rows = $derived(buildingRows(site, buildingRegistry, today));
	const notes = $derived.by(() => {
		const upkeep = upkeepOf(site ? [site] : [], buildingRegistry).reduce((t, u) => t + u.amount, 0);
		const warning = upkeepWarning(funds, upkeep, today);
		const stopped = productionNote(economy, site, producers);
		return [...finished, ...(warning ? [warning] : []), ...(stopped ? [stopped] : [])];
	});
	const allSites = $derived(sitesOf(world ?? { sites: [] }));
	const siteInfo = $derived(allSites.find((s) => s.id === siteId) ?? allSites[0]!);
	const homeSelected = $derived(siteInfo.body === homeId);
	// the build menu (plan 235, ADR 0227): categories, cards and why a card cannot be built here
	const menu = $derived(
		buildMenu(buildingRegistry.list(), registries.categories.list(), {
			home: homeSelected,
			body: siteInfo.body,
			funds,
			bodyName: bodyLabel,
			hqPending: siteInfo.kind === 'branch' && !hqReady(site?.buildings ?? [], buildingRegistry)
		})
	);
	const thumbnail = (card: BuildCard): Promise<string> | null =>
		card.generator ? buildingThumbnails().get(card.generator, card.size) : null;
	let vessels = $state.raw<Snapshot['vessels']>([]);
	const label = (id: string): string =>
		(
			registries.commodities.get(id)?.label ??
			allSites.find((s) => s.id === id)?.name ??
			id
		).toLowerCase();
	const flows = $derived(
		flowRows(site, {
			buildings: buildingRegistry,
			recipes: registries.recipes.list(),
			vessels,
			drillPerDay: 50,
			economy,
			today,
			label
		})
	);

	function onSnapshot(s: Snapshot): void {
		today = s.day;
		funds = s.economy?.enabled ? s.economy.funds : undefined;
		if (JSON.stringify(s.economy) !== JSON.stringify(economy)) economy = s.economy;
		if (s.vessels.length !== vessels.length || s.sites?.some((x) => x.members?.length))
			vessels = s.vessels;
		// the 3D view draws the chosen site while it is on the home planet (the HQ or a branch,
		// plan 248); a base on another body keeps the primary site's view (ADR 0125 point 7)
		const primary =
			(homeSelected ? s.sites?.find((x) => x.id === siteInfo.id) : undefined) ?? s.sites?.[0];
		if (JSON.stringify(primary) !== JSON.stringify(shown)) {
			shown = primary;
			center?.setBuildings(siteViews(primary, buildingRegistry), primary?.roads ?? []);
		}
		const next = s.sites?.find((x) => x.id === siteInfo.id);
		for (const b of next?.buildings ?? []) {
			const was = site?.buildings.find((x) => x.id === b.id);
			if (was && was.state !== 'active' && was.state !== 'planned' && b.state === 'active') {
				const label = buildingRegistry.get(b.kind)?.label ?? b.kind;
				finished = [...finished, `${label} is ready (level ${b.level + 1})`];
			}
		}
		if (JSON.stringify(next) === JSON.stringify(site)) return;
		site = next;
	}
	let shown: SiteState | undefined;

	function ghostAt(at: { east: number; north: number } | null): void {
		if (!build || !at) {
			hover = null;
			center?.setGhost(null);
			return;
		}
		const def = buildingRegistry.get(build.kind)!;
		const cell = ghostCell(at, def, build.rotation);
		const check = checkGhost(
			siteInfo,
			site,
			buildingRegistry,
			build.kind,
			cell,
			build.rotation,
			homeSelected
		);
		hover = { cell, check };
		center?.setGhost({ size: def.size, cell, rotation: build.rotation, valid: check.valid });
	}

	/** After an accepted change: the world's save at once, the record once the snapshot has it. */
	function changed(): void {
		// the funds and construction live in the world's sim; its layout saves it (ADR 0201 point 11)
		worldSession.requestSave('change');
		setTimeout(() => void persist(), 300);
	}

	async function persist(): Promise<void> {
		if (!site) return;
		const sites = sitesOf(world ?? { sites: [] }).map((s) =>
			s.id === site!.id ? { ...s, buildings: site!.buildings, roads: site!.roads } : s
		);
		const worlds = await saves.worldsService();
		await worlds.setSites(worldId, sites);
		world = { ...(world ?? (await worlds.startInfo(worldId))!), sites };
	}

	async function onClick(at: { east: number; north: number } | null): Promise<void> {
		if (!build) return;
		ghostAt(at);
		if (!hover) return;
		const r = await confirmPlacement(
			{ kind: build.kind, cell: hover.cell, rotation: build.rotation, check: hover.check },
			siteInfo.id,
			() => crypto.randomUUID(),
			(c) => center!.dispatch(c)
		);
		if (r && !r.ok) problem = r.reason;
		else if (r?.ok) {
			problem = null;
			// the next snapshot carries the new building; the record is written once it has
			changed();
		}
	}

	async function upgrade(id: string): Promise<void> {
		const r = await center?.dispatch({ type: 'upgrade-building', site: siteInfo.id, id });
		if (r && !r.ok) problem = r.reason;
		else {
			problem = null;
			changed();
		}
	}

	async function remove(id: string): Promise<void> {
		const r = await center?.dispatch({ type: 'remove-building', site: siteInfo.id, id });
		if (r && !r.ok) problem = r.reason;
		else {
			selected = null;
			frame(null);
			changed();
		}
	}

	function onKey(e: KeyboardEvent): void {
		if (!build) return;
		if (e.key === 'r' || e.key === 'R')
			build = { ...build, rotation: nextRotation(build.rotation) };
		if (e.key === 'Escape') setBuild(null);
	}

	function setBuild(kind: string | null): void {
		// a base on another body has no 3D view yet: the building goes on the first free cell near
		// the centre (ADR 0125 point 7); the HQ and the branches are drawn and placed by hand (plan 248)
		if (kind && !homeSelected) {
			const cell = firstFreeCell(siteInfo, site, buildingRegistry, kind, homeSelected);
			if (!cell) {
				const why = checkGhost(
					siteInfo,
					site,
					buildingRegistry,
					kind,
					{ i: 0, j: 0 },
					0,
					homeSelected
				).reasons.find((r) => r.startsWith('The branch HQ'));
				problem = why ?? 'No free cell at this site for that building';
				return;
			}
			void center
				?.dispatch({
					type: 'place-building',
					site: siteInfo.id,
					kind,
					cell,
					rotation: 0,
					id: crypto.randomUUID()
				})
				.then((r) => {
					if (!r.ok) problem = r.reason;
					else {
						problem = null;
						changed();
					}
				});
			return;
		}
		build = kind ? { kind, rotation: 0 } : null;
		if (!kind) {
			hover = null;
			center?.setGhost(null);
		}
	}

	// founding a branch (plan 236, ADR 0229): the picker, the command, then a save and a reload so
	// the new zone shapes the ground (ADR 0229 point 5)
	let branchOpen = $state(false);
	const branchCtx = $derived.by((): BranchContext => {
		const home = homeId ? registries.bodies.get(homeId) : undefined;
		return {
			sites: allSites,
			home: {
				id: homeId ?? 'stock.home',
				radius: home?.radius ?? 600_000,
				rotationPeriod: home?.rotationPeriod ?? 21_600
			},
			terrain: { seed: world ? terrainSeedOf(world) : 0, radius: home?.radius ?? 600_000 },
			hq: branchHqOf(buildingRegistry),
			funds
		};
	});
	async function foundBranch(spot: {
		name: string;
		latitude: number;
		longitude: number;
	}): Promise<string | null> {
		const id = branchId(allSites);
		const r = await center?.dispatch({ type: 'found-branch', id, ...spot });
		if (!r) return 'The Space Center is not ready yet';
		if (!r.ok) return r.reason;
		// the record gets the branch as the sim made it; the HQ's state comes with the next snapshot
		const made = await new Promise<SiteState | undefined>((done) => {
			const off = worldSession.client?.onSnapshot((snap) => {
				const b = snap.sites?.find((x) => x.id === id);
				if (b) {
					off?.();
					done(b);
				}
			});
			setTimeout(() => {
				off?.();
				done(undefined);
			}, 3000);
		});
		const branch: Site = {
			id,
			name: spot.name,
			body: branchCtx.home.id,
			kind: 'branch',
			latitude: spot.latitude,
			longitude: spot.longitude,
			flatRadius: SITE_FLAT_RADIUS,
			blendWidth: SITE_BLEND_WIDTH,
			pads: [{ east: 0, north: 0 }],
			buildings: made?.buildings ?? [],
			roads: made?.roads ?? []
		};
		const sites = [...sitesOf(world ?? { sites: [] }), branch];
		const worlds = await saves.worldsService();
		await worlds.setSites(worldId, sites);
		await worldSession.saveNow();
		location.reload();
		return null;
	}

	// the shown site in the status bar (ADR 0229 point 7)
	$effect(() => {
		pageShell.location = {
			icon: 'spaceCenter',
			text: `${siteInfo.name} · ${bodyLabel(siteInfo.body)}`
		};
	});

	// the Space Center's page action (BASE_LAYOUT §3): the Mission Center
	$effect(() => {
		pageShell.actions = [
			{
				id: 'mission-center',
				label: 'Mission Center',
				icon: 'missionCenter',
				testid: 'nav-mission-center',
				onclick: () => void goto(resolve('/(world)/mission-center'))
			}
		];
		return () => pageShell.reset();
	});

	onMount(() => {
		let gone = false;
		void (async () => {
			const worlds = await saves.worldsService();
			worldId = activeWorldId();
			const client = await bootWorld(worldSession, worldId);
			world = worldSession.base?.sim.worldInfo ?? (await worlds.startInfo(worldId));
			if (gone) return;
			if (world) registries = registriesOf(world);
			center = startSpaceCenter({
				canvas,
				client,
				onSnapshot,
				onFrame: (project) => {
					const steady = pinPositions(rows, project, labels);
					if (JSON.stringify(steady) !== JSON.stringify(labels)) labels = steady;
				},
				onClick: (at) => void onClick(at),
				onHover: ghostAt,
				onError: (m) => (problem = m)
			});
		})();
		return () => {
			gone = true;
			center?.dispose();
		};
	});
</script>

<PageMeta
	title="Space Center · {GAME_NAME}"
	description="Your Space Center: buildings, build mode and the way to the Hangar."
/>
<svelte:window onkeydown={onKey} />

<main class="page">
	<canvas bind:this={canvas} data-testid="sc-canvas"></canvas>
	<SpaceCenterOverlay
		{rows}
		{labels}
		{selected}
		onselect={(id) => {
			selected = id;
			frame(id);
		}}
		{labelMode}
		onlabelmode={setLabelMode}
		{hovered}
		onhover={(id) => (hovered = id)}
		onframe={frame}
		{menu}
		{thumbnail}
		build={build
			? {
					kind: build.kind,
					label: buildingRegistry.get(build.kind)?.label ?? build.kind,
					valid: hover?.check.valid ?? false,
					reasons: hover ? hover.check.reasons : ['Point at the ground to place it']
				}
			: null}
		onbuild={setBuild}
		onrotate={() => build && (build = { ...build, rotation: nextRotation(build.rotation) })}
		onremove={(id) => void remove(id)}
		onupgrade={(id) => void upgrade(id)}
		{notes}
		sites={allSites.map((s) => ({
			id: s.id,
			label: s.body === homeId ? s.name : `${s.name} (${s.body.replace(/^stock\./, '')})`
		}))}
		siteId={siteInfo.id}
		onsite={(id) => {
			siteId = id;
			site = undefined;
			selected = null;
			frame(null);
			setBuild(null);
		}}
		{flows}
		market={marketRows(economy, site?.id)}
		onfoundbranch={() => (branchOpen = true)}
	/>
	<BranchPicker
		open={branchOpen}
		ctx={branchCtx}
		onfound={foundBranch}
		onclose={() => (branchOpen = false)}
	/>
	{#if problem}<p class="problem" role="alert" data-testid="sc-problem">{problem}</p>{/if}
	{#if settings.ui.perfOverlay}
		<!-- the performance overlay (plan 294), clear of the bars and the side panels -->
		<div class="perf-at"><PerfOverlay sample={() => center?.perfSample() ?? null} /></div>
	{/if}
</main>

<style>
	.page {
		position: fixed;
		inset: 0;
		background: #000;
		overflow: hidden;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}
	.perf-at {
		position: absolute;
		z-index: 4;
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top, 0px));
		right: calc(var(--margin-hud) + var(--safe-right, 0px));
		pointer-events: none;
	}
	.problem {
		position: absolute;
		top: 4.5rem;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-card, 0.75rem);
		background: var(--surface-solid);
		color: var(--danger);
	}
</style>
