<script lang="ts">
	/**
	 * The Mission Center (plan 113, ADR 0118): the whole system of the world's save in map view,
	 * Tracking, Upcoming with warp-to, the selected object's card with Fly, and the layers. Its sim
	 * runs from the save given in `?load=`, or the world's newest save, or the world's start info.
	 */
	import {
		calendarOf,
		formatDate,
		homeBodyOf,
		type BodyDefinition,
		type Epoch,
		type Snapshot,
		type Vec3
	} from '@orbital/core';
	import { objectiveLabel } from '../../lib/administration/contracts-model';
	import { onMount } from 'svelte';
	import { formatFunds } from '../../lib/format';
	import { bodyNodes } from '../../lib/map-path';
	import { pickTarget, type PickCandidate } from '../../lib/map-pick';
	import MissionCenterOverlay, {
		type Layers
	} from '../../lib/mission-center/MissionCenterOverlay.svelte';
	import {
		clusterLabels,
		fly,
		objectCard,
		trackingRows,
		upcomingEvents,
		warpToCommand,
		type MapLabel,
		type TrackFilter,
		type UpcomingEvent
	} from '../../lib/mission-center/model';
	import {
		startMissionCenter,
		type MissionCenter
	} from '../../lib/mission-center/mission-center-loop';
	import { GAME_NAME } from '../../lib/public/about';
	import type { GameSave } from '../../lib/save/game-save';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import { SaveController } from '../../lib/save/save-controller.svelte';
	import { spreadLabels } from '../../lib/space-center/model';
	import { projectNetwork, type ScreenNetwork } from '../../lib/comms/network-model';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import { activeWorldId, setActiveWorld } from '../../lib/worlds/worlds';

	let canvas: HTMLCanvasElement;
	let mc: MissionCenter | null = null;
	let loaded: GameSave | undefined;
	let bodies = $state.raw<BodyDefinition[]>([]);
	let epoch: Epoch | undefined;
	let snapshot = $state.raw<Snapshot | null>(null);
	let warp = $state(1);
	let worldName = $state('Mission Center');
	let focus = $state<number | null>(null);
	let filter = $state<TrackFilter>('all');
	let selected = $state<string | null>(null);
	let layers = $state<Layers>({ orbits: true, network: true, labels: true });
	let upcoming = $state.raw<UpcomingEvent[]>([]);
	let labels = $state.raw<MapLabel[]>([]);
	let network = $state.raw<ScreenNetwork>({ lines: [], stations: [] });
	let note = $state<string | null>(null);
	let upcomingAt = -Infinity;

	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		startLoad: (id) => location.assign(`/flight?load=${encodeURIComponent(id)}`),
		world: () => activeWorldId(),
		collect: async () => {
			if (!mc || !loaded) throw new Error('There is no flight to save.');
			return {
				sim: await mc.save(),
				focus: loaded.focus,
				design: loaded.design,
				thumbnail: null,
				bodyRadius: homeBodyOf(bodies, loaded.sim.worldInfo)?.radius ?? 0
			};
		}
	});

	const rows = $derived(trackingRows(snapshot, bodies, filter));
	const card = $derived(objectCard(selected, snapshot, bodies, focus));
	const clock = $derived(
		snapshot && epoch && bodies.length ? formatDate(calendarOf(bodies), epoch, snapshot.t).text : ''
	);
	const agency = $derived(
		snapshot?.economy?.enabled
			? {
					funds: formatFunds(snapshot.economy.funds),
					science: snapshot.economy.science.toFixed(1),
					reputation: snapshot.economy.reputation.toFixed(0)
				}
			: null
	);
	const crew = $derived(
		(snapshot?.crew ?? []).map((c) => ({
			id: c.id,
			name: c.name,
			sub: `${c.profession} · ${c.status}`
		}))
	);
	const contracts = $derived(
		(snapshot?.objectives ?? [])
			.filter((o) => o.status === 'active')
			.map((o) => ({
				id: o.id,
				label: objectiveLabel(snapshot, o.source),
				progress: o.progress,
				status: o.source.kind
			}))
	);

	/** System-frame position of a Tracking key. */
	function worldOf(s: Snapshot, key: string): Vec3 | null {
		const id = key.slice(key.indexOf(':') + 1);
		if (key.startsWith('body:')) return s.bodies.find((b) => String(b.id) === id)?.position ?? null;
		const v = s.vessels.find((x) => String(x.id) === id);
		const base = v && s.bodies.find((b) => b.id === v.soi)?.position;
		return v && base
			? { x: base.x + v.position.x, y: base.y + v.position.y, z: base.z + v.position.z }
			: null;
	}

	function onSnapshot(s: Snapshot, w?: number): void {
		snapshot = s;
		if (w !== undefined) warp = w;
		// the prediction walks every vessel's conics: once a second of wall time is enough
		const now = performance.now();
		if (now - upcomingAt > 1000 && bodies.length) {
			upcomingAt = now;
			upcoming = upcomingEvents(s, bodies, bodyNodes(bodies));
		}
	}

	function onFrame(project: (w: Vec3) => { x: number; y: number; hidden: boolean } | null): void {
		const s = snapshot;
		if (!s) return;
		const all = trackingRows(s, bodies, 'all');
		const points: Record<string, { x: number; y: number } | null> = {};
		for (const r of all) {
			const w = worldOf(s, r.key);
			const p = w && project(w);
			// a body hides its own centre; a vessel behind a body has no label
			points[r.key] = p && (r.kind === 'body' || !p.hidden) ? p : null;
		}
		// a fleet close together shares one label; the rest stack upwards (the Space Center's rule)
		const raw: MapLabel[] = [];
		for (const r of all) {
			const p = points[r.key];
			if (p) raw.push({ key: r.key, label: r.label, kind: r.kind, x: p.x, y: p.y });
		}
		const grouped = clusterLabels(raw);
		const spread = spreadLabels(Object.fromEntries(grouped.map((l) => [l.key, l])), 96, 26);
		const nextLabels: MapLabel[] = grouped.map((l) => ({
			...l,
			x: Math.round(spread[l.key]!.x),
			y: Math.round(spread[l.key]!.y)
		}));
		// the Network layer (plan 115, ADR 0158): every link, coloured by its state, and the stations
		const nextNetwork = projectNetwork(s, (w) => project(w));
		if (JSON.stringify(nextLabels) !== JSON.stringify(labels)) labels = nextLabels;
		if (JSON.stringify(nextNetwork) !== JSON.stringify(network)) network = nextNetwork;
	}

	function onClick(x: number, y: number): void {
		const candidates: PickCandidate[] = labels.map((l) => ({
			key: l.members?.[0] ?? l.key,
			marks: [{ x: l.x, y: l.y, radius: l.kind === 'body' ? 22 : 14 }],
			lines: []
		}));
		select(pickTarget(candidates, x, y, 0));
	}

	function select(key: string | null): void {
		selected = key;
		mc?.renderer?.setMapHighlight(key);
	}

	function setLayers(next: Layers): void {
		layers = next;
		mc?.renderer?.setMapLayers({ orbits: next.orbits });
	}

	async function warpTo(e: UpcomingEvent): Promise<void> {
		const r = await mc?.dispatch(warpToCommand(e));
		note = r && !r.ok ? r.reason : null;
	}

	async function flyNow(): Promise<void> {
		note = await fly({ autosave: () => saves.autosaveId(), go: (href) => location.assign(href) });
		if (note === null) return;
		if (saves.note && saves.noteIsError) note = saves.note;
	}

	async function savedFlight(): Promise<GameSave | undefined> {
		const loadId = new URLSearchParams(location.search).get('load');
		if (loadId !== null) return saves.read(loadId);
		await saves.refresh();
		const newest = saves.entries.find((e) => e.ok);
		return newest?.ok ? saves.read(newest.meta.id) : undefined;
	}

	onMount(() => {
		let gone = false;
		void (async () => {
			try {
				loaded = await savedFlight();
			} catch (e) {
				note = e instanceof Error ? e.message : String(e);
			}
			if (loaded) setActiveWorld(loaded.worldId ?? 'legacy');
			const worldId = activeWorldId();
			const worlds = await saves.worldsService();
			worldName = (await worlds.get(worldId))?.name ?? 'Legacy world';
			const world = loaded ? undefined : await saves.worldStartInfo(worldId);
			if (gone) return;
			focus = loaded?.focus ?? null;
			mc = startMissionCenter({
				canvas,
				...(loaded ? { resume: loaded.sim } : world ? { world } : {}),
				focus,
				onReady: (c) => {
					bodies = c.bodies;
					epoch = c.epoch;
				},
				onSnapshot,
				onFrame,
				onClick,
				onError: (m) => (note = m)
			});
		})();
		return () => {
			gone = true;
			mc?.dispose();
		};
	});
</script>

<PageMeta
	title="Mission Center · {GAME_NAME}"
	description="The whole system: every vessel and body, what happens next, and the way back to the flight."
/>
<svelte:window onkeydown={(e) => e.key === 'Escape' && select(null)} />

<main class="page">
	<canvas bind:this={canvas} data-testid="mc-canvas"></canvas>
	<MissionCenterOverlay
		{worldName}
		{clock}
		{warp}
		now={snapshot?.t ?? 0}
		{filter}
		onfilter={(f) => (filter = f)}
		{rows}
		{selected}
		onselect={select}
		{upcoming}
		onwarp={(e) => void warpTo(e)}
		{contracts}
		{crew}
		{agency}
		{card}
		onfly={() => void flyNow()}
		canFly={focus !== null && snapshot?.vessels.some((v) => Number(v.id) === focus) === true}
		{layers}
		onlayers={setLayers}
		{labels}
		{network}
		{note}
	/>
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
</style>
