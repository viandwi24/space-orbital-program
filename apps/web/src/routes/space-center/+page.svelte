<script lang="ts">
	/**
	 * The Space Center (plan 091, ADR 0117): the active world's first site in 3D from its building
	 * list, the overlay, and build mode. Buildings are checked with core's `canPlace` here and placed
	 * by the sim's `place-building`; the site list is then written into the world record.
	 */
	import {
		homeBodyOf,
		LEGACY_WORLD_ID,
		loadPlugins,
		sitesOf,
		upkeepOf,
		type Rotation,
		type Snapshot,
		type WorldInfo
	} from '@orbital/core';
	import { BUILTIN_PLUGINS, STOCK_CHOICE } from '../../lib/builtins';
	import { onMount } from 'svelte';
	import { GAME_NAME } from '../../lib/public/about';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import type { GameSave } from '../../lib/save/game-save';
	import { activePlugins } from '../../lib/mods/runtime';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import SpaceCenterOverlay from '../../lib/space-center/SpaceCenterOverlay.svelte';
	import {
		buildingRows,
		checkGhost,
		confirmPlacement,
		ghostCell,
		nextRotation,
		siteViews,
		spreadLabels,
		steadyLabels,
		upkeepWarning,
		flowRows,
		firstFreeCell,
		kindsFor,
		marketRows,
		productionNote,
		type GhostCheck,
		type SiteState
	} from '../../lib/space-center/model';
	import { startSpaceCenter, type SpaceCenter } from '../../lib/space-center/space-center-loop';
	import { activeWorldId } from '../../lib/worlds/worlds';

	/** The world's newest save: the Space Center runs it and writes it back after a change (plan 096). */
	let base: GameSave | null = null;
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => location.assign(`/flight?load=${encodeURIComponent(id)}`),
		world: () => worldId,
		collect: async () => {
			if (!center || !base) throw new Error('This world has no save to write back to.');
			return {
				sim: await center.save(),
				focus: base.focus,
				design: base.design,
				thumbnail: null,
				bodyRadius: homeBodyOf(registries.bodies.list())?.radius ?? 600_000
			};
		}
	});
	const { registries } = loadPlugins([...BUILTIN_PLUGINS, ...activePlugins()], {
		system: STOCK_CHOICE
	});
	const buildingRegistry = registries.buildings;
	const homeId = homeBodyOf(registries.bodies.list())?.id;
	/** The site shown in the overlay (plan 128): the primary site, or a base on another body. */
	let siteId = $state<string | null>(null);

	let canvas: HTMLCanvasElement;
	let center: SpaceCenter | null = null;
	let worldId = activeWorldId();
	let worldName = $state('Space Center');
	let world: WorldInfo | undefined;
	let site = $state.raw<SiteState | undefined>(undefined);
	let selected = $state<string | null>(null);
	let labels = $state.raw<Record<string, { x: number; y: number } | null>>({});
	let problem = $state<string | null>(null);
	let build = $state<{ kind: string; rotation: Rotation } | null>(null);
	let hover = $state.raw<{ cell: { i: number; j: number }; check: GhostCheck } | null>(null);

	let today = $state<number | undefined>(undefined);
	let funds = $state<number | undefined>(undefined);
	let economy = $state.raw<Snapshot['economy']>(undefined);
	/** Building kinds that run a recipe (plan 097). */
	const producers = new Set(registries.recipes.list().map((r) => r.building));
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
	const buildKinds = $derived(
		kindsFor(buildingRegistry.list(), homeSelected).map((b) => ({ id: b.id, label: b.label }))
	);
	let vessels = $state.raw<Snapshot['vessels']>([]);
	const label = (id: string): string =>
		(registries.commodities.get(id)?.label ?? allSites.find((s) => s.id === id)?.name ?? id).toLowerCase();
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
		if (s.vessels.length !== vessels.length || s.sites?.some((x) => x.members?.length)) vessels = s.vessels;
		// the 3D view is the primary site's (ADR 0125 point 7); the overlay shows the chosen site
		const primary = s.sites?.[0];
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
		const check = checkGhost(siteInfo, site, buildingRegistry, build.kind, cell, build.rotation, homeSelected);
		hover = { cell, check };
		center?.setGhost({ size: def.size, cell, rotation: build.rotation, valid: check.valid });
	}

	/** After an accepted change: the world's save at once, the record once the snapshot has it. */
	function changed(): void {
		// the funds and construction live in the world's save; a launch continues it (ADR 0123, 0152)
		if (base) void saves.autosave();
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
		// a base has no 3D view yet: the building goes on the first free cell near its centre (ADR 0125 point 7)
		if (kind && !homeSelected) {
			const cell = firstFreeCell(siteInfo, site, buildingRegistry, kind, false);
			if (!cell) {
				problem = 'No free cell at this base for that building';
				return;
			}
			void center
				?.dispatch({ type: 'place-building', site: siteInfo.id, kind, cell, rotation: 0, id: crypto.randomUUID() })
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

	onMount(() => {
		let gone = false;
		void (async () => {
			const worlds = await saves.worldsService();
			worldId = activeWorldId();
			const record = await worlds.get(worldId);
			worldName = record?.name ?? (worldId === LEGACY_WORLD_ID ? 'Legacy world' : 'Space Center');
			world = await worlds.startInfo(worldId);
			await saves.refresh();
			const newest = saves.entries.find((e) => e.ok);
			if (newest?.ok) {
				try {
					base = await saves.read(newest.meta.id);
					world = base.sim.worldInfo;
				} catch {
					base = null;
				}
			}
			if (gone) return;
			center = startSpaceCenter({
				canvas,
				...(world ? { world } : {}),
				...(base ? { resume: base.sim } : {}),
				onSnapshot,
				onFrame: (project) => {
					const next: Record<string, { x: number; y: number } | null> = {};
					for (const r of rows) next[r.id] = project(r.anchor);
					const steady = steadyLabels(spreadLabels(next), labels);
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
		{worldName}
		{rows}
		{labels}
		{selected}
		onselect={(id) => (selected = id)}
		{buildKinds}
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
		sites={allSites.map((s) => ({ id: s.id, label: s.body === homeId ? s.name : `${s.name} (${s.body.replace(/^stock\./, '')})` }))}
		siteId={siteInfo.id}
		onsite={(id) => {
			siteId = id;
			site = undefined;
			selected = null;
			setBuild(null);
		}}
		{flows}
		market={marketRows(economy, site?.id)}
	/>
	{#if problem}<p class="problem" role="alert" data-testid="sc-problem">{problem}</p>{/if}
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
