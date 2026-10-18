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
	const buildKinds = buildingRegistry.list().map((b) => ({ id: b.id, label: b.label }));

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
	/** Construction finished while the page is open (plan 096, ADR 0123 point 6). */
	let finished = $state.raw<string[]>([]);
	const rows = $derived(buildingRows(site, buildingRegistry, today));
	const notes = $derived.by(() => {
		const upkeep = upkeepOf(site ? [site] : [], buildingRegistry).reduce((t, u) => t + u.amount, 0);
		const warning = upkeepWarning(funds, upkeep, today);
		return [...finished, ...(warning ? [warning] : [])];
	});
	const siteInfo = $derived(sitesOf(world ?? { sites: [] })[0]!);

	function onSnapshot(s: Snapshot): void {
		today = s.day;
		funds = s.economy?.enabled ? s.economy.funds : undefined;
		const next = s.sites?.[0];
		for (const b of next?.buildings ?? []) {
			const was = site?.buildings.find((x) => x.id === b.id);
			if (was && was.state !== 'active' && was.state !== 'planned' && b.state === 'active') {
				const label = buildingRegistry.get(b.kind)?.label ?? b.kind;
				finished = [...finished, `${label} is ready (level ${b.level + 1})`];
			}
		}
		if (JSON.stringify(next) === JSON.stringify(site)) return;
		site = next;
		center?.setBuildings(siteViews(next, buildingRegistry), next?.roads ?? []);
	}

	function ghostAt(at: { east: number; north: number } | null): void {
		if (!build || !at) {
			hover = null;
			center?.setGhost(null);
			return;
		}
		const def = buildingRegistry.get(build.kind)!;
		const cell = ghostCell(at, def, build.rotation);
		const check = checkGhost(siteInfo, site, buildingRegistry, build.kind, cell, build.rotation);
		hover = { cell, check };
		center?.setGhost({ size: def.size, cell, rotation: build.rotation, valid: check.valid });
	}

	async function persist(): Promise<void> {
		if (!site) return;
		// the funds and construction live in the world's save; a launch continues it (ADR 0123, 0152)
		if (base) await saves.autosave();
		const sites = sitesOf(world ?? { sites: [] }).map((s, i) =>
			i === 0 ? { ...s, buildings: site!.buildings, roads: site!.roads } : s
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
			// the next snapshot carries the new building; write the record once it has
			setTimeout(() => void persist(), 300);
		}
	}

	async function upgrade(id: string): Promise<void> {
		const r = await center?.dispatch({ type: 'upgrade-building', site: siteInfo.id, id });
		if (r && !r.ok) problem = r.reason;
		else {
			problem = null;
			setTimeout(() => void persist(), 300);
		}
	}

	async function remove(id: string): Promise<void> {
		const r = await center?.dispatch({ type: 'remove-building', site: siteInfo.id, id });
		if (r && !r.ok) problem = r.reason;
		else {
			selected = null;
			setTimeout(() => void persist(), 300);
		}
	}

	function onKey(e: KeyboardEvent): void {
		if (!build) return;
		if (e.key === 'r' || e.key === 'R')
			build = { ...build, rotation: nextRotation(build.rotation) };
		if (e.key === 'Escape') setBuild(null);
	}

	function setBuild(kind: string | null): void {
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
