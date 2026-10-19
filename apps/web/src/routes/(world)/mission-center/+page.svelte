<script lang="ts">
	import { resolve } from '$app/paths';
	/**
	 * The Mission Center (plan 113, ADR 0118): the whole system of the world's save in map view,
	 * Tracking, Upcoming with warp-to, the selected object's card with Fly, and the layers. It shows
	 * the world's one sim (plan 204, ADR 0201).
	 */
	import {
		calendarOf,
		entityId,
		type Command,
		type VesselType,
		formatDate,
		type BodyDefinition,
		type PartDefinition,
		type Epoch,
		type Snapshot,
		type Vec3
	} from '@orbital/core';
	import { newsRows, rivalRows } from '../../../lib/mission-center/agencies-model';
	import { objectiveLabel } from '../../../lib/administration/contracts-model';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { worldSession } from '../../../lib/world-session';
	import { bootWorld } from '../../../lib/world-boot';
	import { formatFunds } from '../../../lib/format';
	import { bodyNodes } from '../../../lib/map-path';
	import { nextWindow, windowDestinations as windowDestinations_ } from '../../../lib/editor/trip';
	import { bodyMu } from '../../../lib/orbit-info';
	import { bodyLabel } from '../../../lib/hud-model';
	import type { AlarmDraft } from '../../../lib/mission-center/AlarmTools.svelte';
	import { pickTarget, type PickCandidate } from '../../../lib/map-pick';
	import MissionCenterOverlay, {
		type Layers
	} from '../../../lib/mission-center/MissionCenterOverlay.svelte';
	import {
		clusterLabels,
		fly,
		objectCard,
		trackingRows,
		typeCounts,
		upcomingEvents,
		warpToCommand,
		alarmCommand,
		type MapLabel,
		type TrackFilter,
		type UpcomingEvent
	} from '../../../lib/mission-center/model';
	import {
		startMissionCenter,
		type MissionCenter
	} from '../../../lib/mission-center/mission-center-loop';
	import { GAME_NAME } from '../../../lib/public/about';
	import { bootedMods, modHint } from '../../../lib/save/mods';
	import { SaveController } from '../../../lib/save/save-controller.svelte';
	import { spreadLabels } from '../../../lib/space-center/model';
	import { projectNetwork, type ScreenNetwork } from '../../../lib/comms/network-model';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import CommsPlanningPanel from '../../../lib/comms-planning/CommsPlanningPanel.svelte';
	import type { Antenna } from '../../../lib/comms-planning/planning-model';
	import { activeWorldId } from '../../../lib/worlds/worlds';
	import { siteRows } from '../../../lib/space-center/branch-model';
	import { sitesOf, type Site } from '@orbital/core';

	let canvas: HTMLCanvasElement;
	let mc: MissionCenter | null = null;
	let bodies = $state.raw<BodyDefinition[]>([]);
	let parts = $state.raw<PartDefinition[]>([]);
	let antennas = $state.raw<Antenna[]>([]);
	let planningOpen = $state(false);
	let epoch: Epoch | undefined;
	let snapshot = $state.raw<Snapshot | null>(null);
	let warp = $state(1);
	let worldName = $state('Mission Center');
	/** The world's sites (plan 236, ADR 0229): the HQ, branches and bases, with their ground stations. */
	let worldSites = $state.raw<readonly Site[]>([]);
	const sites = $derived(siteRows(worldSites, snapshot?.network?.stations, bodyLabel));
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
		startLoad: (id) => goto(resolve(`/(world)/flight?load=${encodeURIComponent(id)}`)),
		world: () => activeWorldId()
	});

	// the fleet list (plan 223): one type, a search, the order by name or distance
	let trackType = $state<VesselType | null>(null);
	let search = $state('');
	let sort = $state<'name' | 'distance'>('name');
	const counts = $derived(typeCounts(snapshot));
	const listFrom = $derived.by(() => {
		if (!snapshot) return null;
		const v = focus === null ? undefined : snapshot.vessels.find((x) => Number(x.id) === focus);
		return v ? worldOf(snapshot, `vessel:${v.id}`) : (snapshot.bodies[0]?.position ?? null);
	});
	const rows = $derived(
		trackingRows(snapshot, bodies, filter, { type: trackType, search, sort, from: listFrom })
	);

	/** Fleet actions (plan 223): each is one command; a rename or a new type is saved at once. */
	async function fleetCommand(command: Command, save = false): Promise<void> {
		const r = await mc?.dispatch(command);
		note = r && !r.ok ? r.reason : null;
		if (r?.ok && save) await worldSession.saveNow();
	}
	const card = $derived(objectCard(selected, snapshot, bodies, focus));
	const clock = $derived(
		snapshot && epoch && bodies.length ? formatDate(calendarOf(bodies), epoch, snapshot.t).text : ''
	);
	// rival agencies and their news (plan 126, ADR 0190)
	const rivals = $derived(rivalRows(snapshot));
	const dayLength = $derived.by(() => {
		if (!bodies.length) return 86_400;
		const c = calendarOf(bodies);
		return c.kind === 'fictional' ? c.dayLength : 86_400;
	});
	const news = $derived(newsRows(snapshot, dayLength));
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

	// alarms and the next transfer window (plan 224)
	async function saveAlarm(d: AlarmDraft): Promise<void> {
		const command = alarmCommand(d, snapshot?.t ?? 0);
		if (typeof command === 'string') {
			note = command;
			return;
		}
		const r = await mc?.dispatch(command);
		note = r && !r.ok ? r.reason : null;
		upcomingAt = -Infinity;
	}
	async function removeAlarm(id: string): Promise<void> {
		const r = await mc?.dispatch({ type: 'remove-alarm', id });
		note = r && !r.ok ? r.reason : null;
		upcomingAt = -Infinity;
	}
	let windowDestination = $state<string | null>(null);
	/** The vessel windows start from: the selected one, else the focus. */
	const windowVessel = $derived.by(() => {
		const id = selected?.startsWith('vessel:') ? Number(selected.slice('vessel:'.length)) : focus;
		const v = snapshot?.vessels.find((x) => Number(x.id) === id);
		return v && !v.surface && v.orbit ? v : null;
	});
	const windowDestinations = $derived(
		windowVessel
			? windowDestinations_(String(windowVessel.soi), bodies).map((id) => ({
					id,
					label: bodyLabel(id)
				}))
			: []
	);
	const windowBodies = $derived(bodies.map((b) => ({ ...b, mu: bodyMu(b) })));
	const transferWindow = $derived.by(() => {
		const v = windowVessel;
		if (!v || !windowDestination || !snapshot || !epoch) return null;
		const w = nextWindow(
			{ r: v.position, v: v.velocity },
			String(v.soi),
			windowDestination,
			windowBodies,
			snapshot.t
		);
		if (typeof w === 'string') return w;
		return {
			date: formatDate(calendarOf(bodies), epoch, w.time).text,
			wait: w.wait,
			dv: w.dv,
			time: w.time
		};
	});
	async function windowAlarm(): Promise<void> {
		const w = transferWindow;
		const v = windowVessel;
		if (!w || typeof w === 'string' || !v || !windowDestination) return;
		const r = await mc?.dispatch({
			type: 'add-alarm',
			kind: 'transfer',
			name: `Window to ${bodyLabel(windowDestination)}`,
			time: w.time,
			vessel: v.id,
			body: windowDestination
		});
		note = r && !r.ok ? r.reason : null;
		upcomingAt = -Infinity;
	}

	async function warpTo(e: UpcomingEvent): Promise<void> {
		const r = await mc?.dispatch(warpToCommand(e));
		note = r && !r.ok ? r.reason : null;
	}

	/** Fly (plan 221, ADR 0208): the selected vessel becomes the focus; Flight takes it up in the same sim. */
	async function flyNow(): Promise<void> {
		const id = selected?.startsWith('vessel:') ? Number(selected.slice('vessel:'.length)) : focus;
		const record = id === null ? null : await worldSession.client?.designOf(id);
		if (id !== null && record) {
			const name = snapshot?.vessels.find((v) => Number(v.id) === id)?.name;
			worldSession.focus = {
				vessel: id,
				design: { ...record.design, name: name ?? record.design.name }
			};
		}
		note = fly({ focus: () => id !== null && record != null, go: (href) => void goto(href) });
	}

	onMount(() => {
		let gone = false;
		void (async () => {
			const worldId = activeWorldId();
			const worlds = await saves.worldsService();
			worldName = (await worlds.get(worldId))?.name ?? 'Legacy world';
			const client = await bootWorld(worldSession, worldId);
			worldSites = sitesOf(
				worldSession.base?.sim.worldInfo ?? (await worlds.startInfo(worldId)) ?? { sites: [] }
			);
			if (gone) return;
			// the vessel last flown in this world, or the boot save's (the map's active vessel)
			focus = worldSession.focus?.vessel ?? worldSession.base?.focus ?? null;
			mc = startMissionCenter({
				canvas,
				client,
				focus,
				onReady: (c) => {
					bodies = c.bodies;
					parts = c.parts;
					antennas = c.antennas ?? [];
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
		{counts}
		{trackType}
		ontracktype={(t) => (trackType = t)}
		{search}
		onsearch={(t) => (search = t)}
		{sort}
		onsort={(s) => (sort = s)}
		onrecover={(id) => void fleetCommand({ type: 'recover-vessel', vessel: entityId(id) }, true)}
		onterminate={(id) => {
			void fleetCommand({ type: 'terminate-vessel', vessel: entityId(id) }, true);
			select(null);
		}}
		onrename={(id, name) =>
			void fleetCommand({ type: 'rename-vessel', vessel: entityId(id), name }, true)}
		onsettype={(id, vesselType) =>
			void fleetCommand({ type: 'set-vessel-type', vessel: entityId(id), vesselType }, true)}
		onalarmsave={(d) => void saveAlarm(d)}
		onalarmremove={(id) => void removeAlarm(id)}
		{windowDestinations}
		{windowDestination}
		onwindowdestination={(id) => (windowDestination = id)}
		{transferWindow}
		onwindowalarm={() => void windowAlarm()}
		{contracts}
		{rivals}
		{news}
		{crew}
		{agency}
		{card}
		onfly={() => void flyNow()}
		canFly={focus !== null && snapshot?.vessels.some((v) => Number(v.id) === focus) === true}
		{layers}
		onlayers={setLayers}
		{labels}
		{network}
		{sites}
		{note}
		{planningOpen}
		onplanning={snapshot?.network ? () => (planningOpen = !planningOpen) : undefined}
	>
		{#snippet planning()}
			<CommsPlanningPanel
				{snapshot}
				{bodies}
				{parts}
				{antennas}
				onclose={() => (planningOpen = false)}
			/>
		{/snippet}
	</MissionCenterOverlay>
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
