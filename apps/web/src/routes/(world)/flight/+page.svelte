<script lang="ts">
	import { resolve } from '$app/paths';
	import { readReplay } from '@orbital/core';
	import GhostLayer from '../../../lib/replays/GhostLayer.svelte';
	import { ghostTrack, type ScreenGhost } from '../../../lib/replays/ghost-model';
	import { downloadBlob, downloadText, fileNameOf, screenshotName } from '../../../lib/download';
	import VesselPanel from '../../../lib/vessel-panel/VesselPanel.svelte';
	import PartInspector from '../../../lib/inspector/PartInspector.svelte';
	import {
		closePart,
		emptyInspector,
		keepParts,
		openPart,
		shownParts,
		togglePin,
		type InspectorState
	} from '../../../lib/inspector/inspector-model';
	import {
		transmitters,
		vesselView,
		type PanelContent
	} from '../../../lib/vessel-panel/vessel-model';
	import { commsTab, type ScreenNetwork } from '../../../lib/comms/network-model';
	import NetworkLayer from '../../../lib/comms/NetworkLayer.svelte';
	import BodyLabels from '../../../lib/map/BodyLabels.svelte';
	import type { BodyLabel } from '../../../lib/map/body-labels';
	import { categoriesOf } from '../../../lib/editor/categories';
	import { homeBodyOf, loadPlugins } from '@orbital/core';
	import Stock from '@orbital/mod-stock';
	import { activePlugins } from '../../../lib/mods/runtime';
	import {
		scenarioSiteOf,
		scenarioStart,
		type ScenarioStart
	} from '../../../lib/missions/scenario-start';
	import {
		sortPanels,
		type EntityId,
		type MissionDefinition,
		type PanelDefinition,
		type PanelInput
	} from '@orbital/core';
	import MissionsPanel from '../../../lib/missions/MissionsPanel.svelte';
	import { missionWorldOf, trackerView, type MissionWorld } from '../../../lib/missions/tracker';
	import Dock from '../../../lib/dock/Dock.svelte';
	import ModPanel from '../../../lib/dock/ModPanel.svelte';
	import PanelLibrary from '../../../lib/dock/PanelLibrary.svelte';
	import { addPanel, railOf, removePanel, togglePanel } from '../../../lib/dock/dock-model';
	import Panel from '../../../lib/ui/Panel.svelte';
	import { quickLaunchPlacement, takeLaunchChoice } from '../../../lib/launch/launch-model';
	import { loadEphemeris, needsEphemeris } from '../../../lib/ephemeris-asset';
	import type { WorldInfo } from '@orbital/core';
	import {
		defaultLaunchSpot,
		sitesOf,
		type Command,
		type CommandResult,
		type Site,
		type Snapshot
	} from '@orbital/core';
	import { occupiedPrompt, spotOccupants, type OccupiedPrompt } from '../../../lib/fleet-actions';
	import { activeWorldId, setActiveWorld } from '../../../lib/worlds/worlds';
	import { profileStore } from '../../../lib/achievements/store';
	import type { CatchUp } from '../../../lib/worlds/world-model';
	import { GAME_NAME } from '../../../lib/public/about';
	import PageMeta from '../../../lib/ui/PageMeta.svelte';
	import { onMount, untrack } from 'svelte';
	import { pageShell, type PageAction } from '../../../lib/layout/page-actions.svelte';
	import { warpText } from '../../../lib/layout/shell-model';
	import { ascentScript } from '@orbital/scripting/samples/ascent';
	import CrewPanel from '../../../lib/hud/CrewPanel.svelte';
	import RecoverDialog from '../../../lib/hud/RecoverDialog.svelte';
	import MapSwitch from '../../../lib/hud/MapSwitch.svelte';
	import MapFilterBar from '../../../lib/map/MapFilterBar.svelte';
	import { mapFilters } from '../../../lib/map/map-filters.svelte';
	import RegionsLayer from '../../../lib/hud/RegionsLayer.svelte';
	import { loadWorldCatalog } from '../../../lib/worlds/catalog';
	import { WARP_STEPS, warpStepsFor } from '../../../lib/warp';
	import AeroStrip from '../../../lib/hud/AeroStrip.svelte';
	import HelpOverlay from '../../../lib/hud/HelpOverlay.svelte';
	import InstrumentDeck from '../../../lib/hud/InstrumentDeck.svelte';
	import ManeuverLayer from '../../../lib/hud/ManeuverLayer.svelte';
	import ManeuverPanel from '../../../lib/hud/ManeuverPanel.svelte';
	import HeatBars from '../../../lib/hud/HeatBars.svelte';
	import TargetMarkers from '../../../lib/hud/TargetMarkers.svelte';
	import TargetPanel from '../../../lib/hud/TargetPanel.svelte';
	import MapMarkers from '../../../lib/hud/MapMarkers.svelte';
	import type { CameraMode } from '@orbital/renderer';
	import type { PlannedOrbit } from '../../../lib/maneuver-controller';
	import type { NavMark } from '../../../lib/nav-markers';
	import OrbitStrip from '../../../lib/hud/OrbitStrip.svelte';
	import PauseMenu from '../../../lib/hud/PauseMenu.svelte';
	import { dialogOpen } from '../../../lib/flight-modal';
	import { crewSeats } from '../../../lib/inspector/crew-seats';
	import { takeableSample } from '../../../lib/hud/take-sample';
	import { repairOffer } from '../../../lib/hud/repair-offer';
	import MapCardView from '../../../lib/hud/MapCardView.svelte';
	import { mapCardFor, type MapCard } from '../../../lib/hud/map-card';
	import StatusStrip from '../../../lib/hud/StatusStrip.svelte';
	import {
		chipToFlash,
		FLASH_MS,
		statusChips,
		type ChipFix,
		type StatusChip
	} from '../../../lib/hud/status-chips';
	import MapPickList from '../../../lib/hud/MapPickList.svelte';
	import VesselMenuView from '../../../lib/hud/VesselMenu.svelte';
	import {
		refreshVesselMenu,
		runVesselMenuAction,
		vesselMenu,
		vesselTooltip,
		type OpenVesselMenu,
		type VesselMenu,
		type VesselMenuAction
	} from '../../../lib/vessel-menu';
	import {
		stackAt,
		stackEntries,
		type MapStack,
		type StackPoint
	} from '../../../lib/hud/map-stack';
	import type { MapTargetFrame } from '../../../lib/target-view';
	import DebugPanel from '../../../lib/debug/DebugPanel.svelte';
	import PerfOverlay from '../../../lib/perf/PerfOverlay.svelte';
	import { createDebugApi, flightDebug, type DebugHost } from '../../../lib/debug/api';
	import LessonCard from '../../../lib/hud/LessonCard.svelte';
	import GuidePointer from '../../../lib/hud/GuidePointer.svelte';
	import {
		advanceLesson,
		lessonOf,
		lessonStart,
		lessonStep,
		skipStep,
		NEW_LESSON,
		observeLesson,
		runLessonSetup,
		type LessonObservation
	} from '../../../lib/onboarding/lessons';
	import { activeLesson, markLessonReady } from '../../../lib/onboarding/lesson-world';
	import { lessonKeymap, lessonNotice } from '../../../lib/onboarding/lesson-gate.svelte';
	import { listEntries, withFallback } from '../../../lib/vab/library';
	import { indexedDbStore } from '../../../lib/vab/library-idb';
	import ScriptPanel from '../../../lib/hud/ScriptPanel.svelte';
	import StageStack from '../../../lib/hud/StageStack.svelte';
	import StatusCard from '../../../lib/hud/StatusCard.svelte';
	import TouchControls from '../../../lib/hud/TouchControls.svelte';
	import TutorialCard from '../../../lib/hud/TutorialCard.svelte';
	import {
		aboveDeckHeight,
		DECK_FALLBACK,
		scriptPanelWidth,
		throttleAnchor,
		viewInsets
	} from '../../../lib/layout/layout-model';
	import { REGIONS, clampSpan, cornerTop, layoutFor } from '../../../lib/layout/regions';
	import { touchControlsOn } from '../../../lib/touch/touch-model';
	import Button from '../../../lib/ui/Button.svelte';
	import Dialog from '../../../lib/ui/Dialog.svelte';
	import LoadingScreen from '../../../lib/ui/LoadingScreen.svelte';
	import SettingsDialog from '../../../lib/ui/SettingsDialog.svelte';
	import { settings } from '../../../lib/settings/settings.svelte';
	import {
		advance,
		currentStep,
		skip,
		stepLabel,
		type Observation
	} from '../../../lib/onboarding/tutorial';
	import Toasts from '../../../lib/ui/Toasts.svelte';
	import PrecompileBadge from '../../../lib/ui/PrecompileBadge.svelte';
	import type { PrecompileProgress } from '@orbital/renderer/precompile-progress';
	import { loadContent, partLookup } from '../../../lib/catalog';
	import { modKeyRows } from '../../../lib/mod-keys';
	import type { KeybindingDefinition, OverlayDefinition } from '@orbital/core';
	import type { SimSave, VesselDesign, VesselPlacement } from '@orbital/core';
	import { parseDesign } from '../../../lib/design';
	import { startFlight, type Flight, type FlightHud } from '../../../lib/flight-loop';
	import type { FrameData } from '../../../lib/hud-controller';
	import { idleScript, scriptIsActive, type ScriptView } from '../../../lib/script-state';
	import type { SandboxStatus } from '../../../lib/script-sandbox';
	import { startScriptSandbox } from '../../../lib/script-sandbox-web';
	import { createScriptChecker, type ScriptChecker } from '../../../lib/script-checker';
	import { decodeScript, tokenFromHash, type ImportInfo } from '../../../lib/script-share';
	import { loadDraft, loadScript, saveScript } from '../../../lib/storage';
	import { canWarp } from '../../../lib/telemetry';
	import { worldSession } from '../../../lib/world-session';
	import { bootWorld } from '../../../lib/world-boot';
	import type { SimClient } from '../../../lib/sim-client';
	import { beforeNavigate, goto } from '$app/navigation';
	import type { GameSave } from '../../../lib/save/game-save';
	import LoadDialog from '../../../lib/save/LoadDialog.svelte';
	import { bootedMods, modHint } from '../../../lib/save/mods';
	import SaveDialog from '../../../lib/save/SaveDialog.svelte';
	import { SaveController } from '../../../lib/save/save-controller.svelte';

	/** Where the world's shared canvas goes (plan 340, ADR 0290); its pointer events bubble here. */
	let view: HTMLDivElement;
	let hud = $state.raw<FlightHud | null>(null);
	/** Progress of the renderer's background shader compile (plan 038), null until it reports. */
	let graphics = $state.raw<PrecompileProgress | null>(null);
	let problem = $state<string | null>(null);
	/** The problem is a save that would not load, not a missing design. */
	let loadFailed = $state(false);
	let flight: Flight | null = null;
	// The dock (plan 112, ADR 0149): a rail of panels, one open; the script editor is one of them.
	let dockShown = $state(true);
	const scriptOpen = $derived(dockShown && settings.dock.open === 'host.script');
	let libraryOpen = $state(false);
	/** Panels mods registered, read on the main thread with the content. */
	let modPanels = $state.raw<PanelDefinition[]>([]);
	let panelInput = $state.raw<PanelInput | null>(null);
	// the vessel panel (plan 111, ADR 0153), since v3 the dock's Vessel entries (plan 272, ADR 0253)
	const VESSEL_TABS = {
		'host.vessel': 'overview',
		'host.parts': 'parts',
		'host.comms': 'comms',
		'host.resources': 'resources'
	} as const;
	const vesselTab = $derived(
		dockShown ? (VESSEL_TABS[settings.dock.open as keyof typeof VESSEL_TABS] ?? null) : null
	);
	const vesselOpen = $derived(vesselTab !== null);
	let vesselContent = $state.raw<PanelContent | null>(null);
	let vesselCategories = $state.raw<ReturnType<typeof categoriesOf>>([]);
	/** The flown design's stages (design part indices), for the Parts tab's stage filter (plan 214). */
	let vesselStages = $state.raw<number[][]>([]);
	const vesselShown = $derived(panelInput?.vessel ?? null);
	const vesselShownView = $derived(
		vesselShown && vesselContent
			? vesselView(vesselShown, vesselContent, vesselCategories, vesselStages)
			: null
	);
	// the part inspector (plan 214, ADR 0205 point 2): a 3D click or Inspect opens it, Pin keeps it
	let inspector = $state<InspectorState>(emptyInspector());
	const inspected = $derived(shownParts(inspector));
	const inspectView = $derived(
		inspected.length > 0 && vesselShown && vesselContent
			? vesselView(vesselShown, vesselContent, vesselCategories, vesselStages, true)
			: null
	);
	/** The part the pointer is over in the view (two-way highlight with the panel's rows). */
	let hoverPart = $state<EntityId | null>(null);
	let hoverAt = 0;
	let downAt: { x: number; y: number } | null = null;
	/** The vessel menu open at a canvas point, and the hover line over another vessel (plan 310). */
	let vesselMenuAt = $state<OpenVesselMenu | null>(null);
	let vesselHover = $state<{ label: string; x: number; y: number } | null>(null);
	let vesselHoverAt = 0;
	/** The menu for a vessel under a canvas point, or null. */
	function menuAt(x: number, y: number): VesselMenu | null {
		const hit = flight?.vesselAt(x, y);
		const input = flight?.panelInput();
		if (!hit || !input) return null;
		return vesselMenu(input.snapshot, input.vessel?.id ?? null, hit.vessel, hit.part);
	}
	/** Read the open menu again: closed when its vessel is gone or is now the flown one. */
	function rereadVesselMenu(): void {
		const input = flight?.panelInput();
		vesselMenuAt = refreshVesselMenu(
			vesselMenuAt,
			input?.snapshot ?? null,
			input?.vessel?.id ?? null
		);
	}
	/** One menu action on the menu as it is now (a switch or decouple may have closed it). */
	function vesselMenuAction(action: VesselMenuAction): void {
		const open = vesselMenuAt;
		const own = flight?.panelInput()?.vessel?.id ?? null;
		const keep = runVesselMenuAction(open, own, action, {
			switchVessel: (id) =>
				void flight?.switchVessel(Number(id)).then((r) => {
					if (!r.ok) notice = r.reason;
				}),
			command: (command) =>
				void flight?.command(command).then(() => setTimeout(rereadVesselMenu, 150)),
			focusPart: (part) => flight?.focusPart(part === null ? null : Number(part))
		});
		if (!keep) vesselMenuAt = null;
	}
	// the snapshot moves on (a decouple, a docking, a switch): the open menu follows or closes
	$effect(() => {
		void model;
		untrack(rereadVesselMenu);
	});
	/**
	 * A press on the canvas or a map layer (a camera drag, a node or handle drag) is under way: no text
	 * selection may start until it ends, and one left from before is cleared (plan 293). The owner's
	 * drags left the orbit labels and the top bar selected.
	 */
	let mapPress = false;
	function onPressCapture(e: PointerEvent): void {
		const at = e.target instanceof Element ? e.target : null;
		mapPress = at !== null && at.closest('.stage > .view, .stage > .layer') !== null;
		if (mapPress) globalThis.getSelection?.()?.removeAllRanges();
	}
	/** The map's vessel points this frame: the others', and the target's under the key `target` (plan 270). */
	function stackPoints(map: MapTargetFrame | null): StackPoint[] {
		if (!map) return [];
		const out = map.others.map((o) => ({ key: o.key, x: o.point.x, y: o.point.y }));
		if (map.target) out.push({ key: 'target', x: map.target.point.x, y: map.target.point.y });
		return out;
	}

	/** A map click on a vessel: the pick list when icons overlap there, else its card (plan 270). */
	function mapPick(key: string, at: { x: number; y: number }): void {
		const snap = worldSession.snapshot;
		const own = flight?.panelInput()?.vessel;
		const target = own?.target?.kind === 'vessel' ? `vessel:${Number(own.target.id)}` : null;
		const points = mapPoints.flatMap((p) =>
			p.key !== 'target' ? [p] : target ? [{ ...p, key: target }] : []
		);
		const keys = key.startsWith('vessel:') ? stackAt(points, at.x, at.y) : [];
		const entries =
			snap && keys.length > 1
				? stackEntries(keys, snap, {
						bodies: debugHost?.bodies() ?? [],
						active: own ? Number(own.id) : null,
						target
					})
				: [];
		if (entries.length > 1) {
			mapCard = null;
			mapStack = { ...at, entries };
			return;
		}
		mapStack = null;
		mapCard = mapCardFor(key, model?.targets ?? [], at);
	}

	function inspect(part: EntityId): void {
		inspector = openPart(inspector, part);
		panelInput = flight?.panelInput() ?? null;
	}
	$effect(() => {
		// parts that left the vessel (a decoupled stage) close their inspectors
		const v = vesselShown;
		if (!v) return;
		const alive = new Set(v.parts.map((p) => p.id));
		untrack(() => (inspector = keepParts(inspector, alive)));
	});
	/** A sample the suit on EVA can take from a vessel part within reach (plan 260). */
	const takeOffer = $derived(
		hud?.eva && panelInput ? takeableSample(panelInput.snapshot, hud.eva.suit) : null
	);
	/** Failure modes an engineer can mend in the field (plan 130), from the loaded content. */
	let repairableModes = $state.raw<ReadonlySet<string>>(new Set());
	/** A repair the suit on EVA can make now (player-journey audit Q1, J6): an engineer, a failed part near. */
	const repair = $derived(
		hud?.eva && panelInput
			? repairOffer(panelInput.snapshot, hud.eva.suit, (mode) => repairableModes.has(mode))
			: null
	);
	const partLabel = (definition: string): string =>
		vesselContent?.parts.get(definition)?.title ?? definition;
	/** The card of a map vessel just clicked (plan 250). */
	let mapCard = $state<MapCard | null>(null);
	/** The world's sites, for the launch spot (plan 318). */
	let launchSites: readonly Site[] = [];
	/** KSP's "launch site is occupied" (plan 318, ADR 0274): who is there, and the answer. */
	let occupied = $state<{
		prompt: OccupiedPrompt;
		answer: (choice: 'recover' | 'terminate' | 'cancel') => void;
	} | null>(null);
	/** Clear the launch spot before a launch: true goes on, a string stops it (flight-loop's `clearLaunchSite`). */
	async function clearLaunchSite(
		at: VesselPlacement | undefined,
		snap: Snapshot | null,
		dispatch: (command: Command) => Promise<CommandResult>
	): Promise<true | string> {
		if (!snap || at?.kind !== 'site') return true;
		const site = launchSites.find((x) => x.id === at.site);
		const spot =
			at.at ??
			(at.pad === undefined
				? site && siteBuildings && defaultLaunchSpot(site, siteBuildings)
				: site?.pads[at.pad]);
		if (!spot) return true;
		const prompt = occupiedPrompt(spotOccupants(snap, at.site, spot));
		if (!prompt) return true;
		const choice = await new Promise<'recover' | 'terminate' | 'cancel'>(
			(answer) => (occupied = { prompt, answer })
		);
		occupied = null;
		if (choice === 'cancel') {
			void goto(resolve('/(world)/vab'));
			return 'the launch site is occupied';
		}
		for (const vessel of prompt.ids) {
			const type = choice === 'recover' ? 'recover-vessel' : 'terminate-vessel';
			const r = await dispatch({ type, vessel } as Command);
			if (!r.ok) return `the launch site is still occupied: ${r.reason}`;
		}
		return true;
	}
	/** The map card's vessel as the vessel menu reads it (plan 318): Recover and Terminate. */
	const mapCardMenu = $derived.by(() => {
		void model;
		const input = flight?.panelInput();
		if (!mapCard || !input) return null;
		return vesselMenu(input.snapshot, input.vessel?.id ?? null, mapCard.vessel as EntityId);
	});
	function mapCardCommand(type: 'recover-vessel' | 'terminate-vessel'): void {
		const id = mapCard?.vessel;
		mapCard = null;
		if (id === undefined) return;
		void flight?.command({ type, vessel: id as EntityId }); // a refusal shows as a toast
	}
	/** The pick list of vessels stacked under a map click (plan 270), and the map's vessel points. */
	let mapStack = $state<MapStack | null>(null);
	let mapPoints: StackPoint[] = [];
	/** The dock panel's width, px at 100 % (plan 250), dragged at its free edge. */
	const dockWidth = $derived(
		clampSpan(REGIONS.dock, settings.ui.dockWidth ?? REGIONS.dock.default)
	);
	// the mission tracker (plan 100, ADR 0151 point 3)
	let missionDefs = $state.raw<MissionDefinition[]>([]);
	/** The world's names in the mission text, from the sim's catalog (system audit D3). */
	let missionWorld = $state.raw<MissionWorld | null>(null);
	let objectiveNames = $state.raw<Record<string, string>>({});
	const tracker = $derived(
		trackerView(
			missionDefs,
			panelInput?.snapshot.objectives,
			(id) => objectiveNames[id] ?? id,
			missionWorld ?? undefined
		)
	);
	const HOST: { id: string; title: string; icon: string; order: number }[] = [
		{ id: 'host.vessel', title: 'Overview', icon: 'pod', order: 10 },
		{ id: 'host.parts', title: 'Parts', icon: 'parts', order: 20 },
		{ id: 'host.comms', title: 'Comms', icon: 'comms', order: 30 },
		{ id: 'host.crew', title: 'Crew', icon: 'crew', order: 40 },
		{ id: 'host.orbit', title: 'Orbit', icon: 'ellipse', order: 100 },
		{ id: 'host.resources', title: 'Resources', icon: 'drop', order: 200 },
		{ id: 'host.target', title: 'Target', icon: 'navball', order: 300 },
		{ id: 'host.missions', title: 'Missions', icon: 'check', order: 400 },
		{ id: 'host.script', title: 'Script', icon: 'script', order: 500 }
	];
	const allPanels = $derived(
		sortPanels([...HOST, ...modPanels.filter((p) => p.contexts.includes('flight'))])
	);
	const rail = $derived(railOf(allPanels, settings.dock));
	function openPanel(id: string): void {
		dockShown = true;
		settings.setDock(addPanel(settings.dock, id));
		panelInput = flight?.panelInput() ?? null;
	}
	// the programs popover acts here: the vessel menu's Control and the dock (plan 359, ADR 0302)
	$effect(() => {
		pageShell.flight = {
			active: () => flight?.panelInput()?.vessel?.id ?? null,
			switchTo: async (vessel) => {
				const r = await flight?.switchVessel(vessel);
				if (r && !r.ok) notice = r.reason;
			},
			openPanel
		};
		return () => (pageShell.flight = null);
	});
	/** A status chip's fix (V3 §2.2): open the dock panel that holds the cure. */
	const fixChip = (fix: ChipFix): void => openPanel(fix.panel);
	function toggleScript(): void {
		if (scriptOpen) settings.setDock({ ...settings.dock, open: null });
		else openPanel('host.script');
	}
	/** Compiles the script for the editor's syntax check; null before the flight starts. */
	let checker: ScriptChecker | null = null;
	const checkSyntax = (text: string) => checker?.check(text) ?? Promise.resolve(undefined);
	$effect(() => {
		if (!scriptOpen) checker?.close();
	});
	let source = $state('');
	let designName = $state('');
	// the Comms tab (plan 115, ADR 0158)
	const vesselComms = $derived(
		vesselShown && panelInput
			? commsTab(panelInput.snapshot, Number(vesselShown.id), vesselShown.name ?? designName)
			: null
	);
	const vesselTransmitters = $derived(
		vesselShownView && vesselContent ? transmitters(vesselShownView, vesselContent) : []
	);
	let script = $state.raw<ScriptView>(idleScript());
	let sandbox = $state.raw<SandboxStatus>({ state: 'none', reports: [], contained: false });
	/** Follows the active vessel's script sandbox (plan 322); set once the flight starts. */
	let sandboxWatch: ((id: number) => void) | null = null;
	$effect(() => {
		const id = vesselShown?.id;
		if (id !== undefined) sandboxWatch?.(Number(id));
	});
	/** Set while the editor holds text from outside that the player has not confirmed running (plan 030). */
	let imported = $state<ImportInfo | null>(null);
	let backup = $state<string | null>(null);
	let notice = $state<string | null>(null);
	/** The text of the last Run: its error line only means something while the editor still holds it. */
	let ranSource = $state<string | null>(null);
	let pauseOpen = $state(false);
	/** The Debug panel (plan 203, Alt+F12 or the pause menu). */
	let debugOpen = $state(false);
	/** The running flight's debug host (`flight` itself is not reactive). */
	let debugHost = $state.raw<DebugHost | null>(null);
	// a lesson world (plan 229): its lesson, whether its scene is set, and why a setup failed
	const lessonRun = activeLesson();
	// a lesson that opens in Flight (ADR 0293 point 2); the Hangar's and Space Center's run elsewhere
	const lessonFound = lessonRun ? (lessonOf(lessonRun.lesson) ?? null) : null;
	const lesson = lessonFound && lessonStart(lessonFound) === 'flight' ? lessonFound : null;
	/** The content the lesson's vessel and scene are built from. */
	let lessonContent: ReturnType<typeof loadContent>['content'] | null = null;
	let lessonReady = $state(lessonRun?.ready === true);
	let lessonProblem = $state<string | null>(null);
	let lessonSetting = false;
	/** The player pressed Begin: until then the world clock waits on the first card. */
	let lessonBegun = $state(false);
	/** The flight's design and parts, for the panel's "spawn a design" list. */
	let debugDesigns: () => Promise<Array<{ name: string; design: VesselDesign }>> = async () => [];
	let helpOpen = $state(false);
	let settingsOpen = $state(false);
	/** Settings was opened from the pause menu: closing it goes back there. */
	let settingsFromPause = false;
	let deck = $state<InstrumentDeck>();
	let markers = $state<MapMarkers>();
	/** The Network layer in map view (plan 115, ADR 0158). */
	let mapNetwork = $state.raw<ScreenNetwork | null>(null);
	// the serialised forms the paint compares against, so each frame serialises once (plan 396)
	let mapNetworkKey = '';
	let mapBodyLabelsKey = '';
	let ghostFrameKey = '';
	/** The names of the bodies in the map (plan 382). */
	let mapBodyLabels = $state.raw<BodyLabel[] | null>(null);
	/** A replay's ghost over this flight (plan 131, ADR 0159 point 7). */
	let ghostFrame = $state.raw<ScreenGhost | null>(null);
	let ghostInput = $state<HTMLInputElement>();
	let ghostNote = $state<string | null>(null);
	let targetMarks = $state<TargetMarkers>();
	let heatBars = $state<HeatBars>();
	let nodeLayer = $state<ManeuverLayer>();
	/** The map view's maneuver planner, available once the sim has started (plan 045). */
	let planner = $state.raw<Flight['maneuver']>(null);
	// ---- rules the page keeps (plan 230, ADR 0230): revert and quickload ----------------------
	/** This flight was launched here: Revert to the Hangar can restore the world before it. */
	let launchedHere = $state(false);
	const ruleOn = (id: string): boolean => (worldSession.snapshot?.rules?.[id] ?? true) !== false;
	/** Why Revert is not offered, or null when it is. */
	const revertWhy = $derived.by((): string | null => {
		void model?.time; // re-read with the HUD's updates
		if (!ruleOn('stock.allow-revert'))
			return 'This world does not allow revert. Allow it in World settings.';
		if (!launchedHere || !worldSession.revertPoint)
			return 'Only a flight launched from the Hangar can be reverted.';
		return null;
	});
	async function revert(): Promise<void> {
		const point = worldSession.revertPoint;
		if (!point || revertWhy !== null) return;
		pauseOpen = false;
		const ephemeris = await ephemerisFor(point.sim.worldInfo);
		worldSession.restart(point.worldId, { resume: point.sim, ...(ephemeris ? { ephemeris } : {}) });
		worldSession.focus = null;
		void goto(resolve('/(world)/vab'));
	}
	/** F9 and the Load dialog's quickload, unless the world forbids it (stock.allow-quickload). */
	function quickload(): void {
		if (!ruleOn('stock.allow-quickload')) {
			flight?.debug.notice?.({
				kind: 'warning',
				title: 'Quickload is off in this world',
				detail: 'Allow it in World settings.',
				key: 'no-quickload'
			});
			return;
		}
		void saves.quickload();
	}

	/** F2 (plan 226): every interface layer hidden, the canvas alone. */
	let uiHidden = $state(false);
	$effect(() => {
		// the world layout's bars too (WorldShell reads the attribute)
		if (uiHidden) document.documentElement.dataset.uiHidden = '';
		else delete document.documentElement.dataset.uiHidden;
		return () => delete document.documentElement.dataset.uiHidden;
	});
	/** The camera mode is kept per world (plan 226), in this browser only. */
	const cameraKey = (): string => `orbital.camera-mode.${activeWorldId()}`;
	function loadCameraMode(): CameraMode {
		try {
			const v = localStorage.getItem(cameraKey());
			return v === 'auto' || v === 'free' || v === 'orbital' || v === 'locked' ? v : 'free';
		} catch {
			return 'free';
		}
	}
	function saveCameraMode(mode: CameraMode): void {
		try {
			localStorage.setItem(cameraKey(), mode);
		} catch {
			// private mode or blocked storage: the mode lasts for this flight
		}
	}
	/** F10 and the pause menu (plan 226): the canvas as a PNG download named by world and MET. */
	async function screenshot(): Promise<void> {
		const blob = await flight?.capture();
		if (blob) downloadBlob(blob, screenshotName(world.name, model?.met ?? 0));
	}

	/** The node the map selected and the orbit after the node the panel shows (plan 224). */
	let nodeSelected = $state<number | null>(null);
	let nodePlanned = $state.raw<PlannedOrbit | null>(null);
	let nodePlannedKey = '';

	/** A map marker's warp: the sim's margin before apsides (plan 206), the same for the rest. */
	const MARK_MARGIN = 15;
	function warpToMark(mark: NavMark): void {
		if (!flight) return;
		if (!mark.planned && (mark.kind === 'apoapsis' || mark.kind === 'periapsis')) {
			flight.warpToApsis(mark.kind);
			return;
		}
		flight.warpTo({ time: Math.max(mark.time - MARK_MARGIN, (model?.time ?? 0) + 1) });
	}
	function alarmAtMark(mark: NavMark): void {
		if (!flight) return;
		if (!mark.planned && (mark.kind === 'apoapsis' || mark.kind === 'periapsis')) {
			void flight.addAlarm({ kind: mark.kind });
			return;
		}
		void flight.addAlarm({ kind: 'time', name: mark.label, time: mark.time, lead: MARK_MARGIN });
	}
	function alarmAtNode(id: number): void {
		const node = model?.maneuver?.nodes.find((n) => n.id === id);
		if (!flight || !node) return;
		const index = (model?.maneuver?.nodes.indexOf(node) ?? 0) + 1;
		void flight.addAlarm({
			kind: 'time',
			name: `Maneuver node ${index}`,
			time: node.time,
			lead: 30
		});
	}
	let tall = $state(true);
	// the navball module's size (V3 §2.4; compact by default since plan 377, Settings → Interface)
	const compactBall = $derived(settings.ui.navball !== 'normal');
	const ballSize = $derived(compactBall ? (tall ? 144 : 128) : tall ? 180 : 144);
	// The toolbar's Staging and Nav buttons (plan 088, ADR 0144 point 5).
	let navOpen = $state(true);
	/** The staging box at the bottom right (V3 §2.3: a menu-bar toggle). */
	let stagingOpen = $state(true);
	/** The world capsule: the active world's name, mode and system (ADR 0144 point 7). */
	let world = $state({ name: 'Legacy world', mode: 'Sandbox', system: 'Stock system' });
	/** The primary pointer is a finger (plan 053): the on-screen controls show for Automatic. */
	let coarse = $state(false);
	const touchOn = $derived(touchControlsOn(settings.touch, coarse));

	// Save and load (plan 043). A load reloads the page with `?load=<id>`: a fresh Worker and renderer.
	const saves = new SaveController({
		loadedMods: bootedMods,
		modHint,
		collect: () => {
			if (!flight) throw new Error('There is no flight to save yet.');
			return flight.collectSave();
		},
		// a load replaces the world's sim in place (plan 204, ADR 0201): no page reload
		startLoad: (id) => restartWith(id),
		// the Load dialog and F9 stay in the world being flown (plan 087)
		world: activeWorldId
	});
	/** "Catch up to now" (plan 087): refreshed every second. */
	let catchUp = $state<CatchUp>({ kind: 'none' });
	/** The map's switch (plan 113): the Mission Center runs on the same sim (plan 204, ADR 0201). */
	function openMissionCenter(): void {
		void goto(resolve('/(world)/mission-center'));
	}
	/** Draw a replay file's vessel over this flight (plan 131, ADR 0159 point 7). */
	async function loadGhost(file: File): Promise<void> {
		pauseOpen = false;
		const read = readReplay(await file.text());
		const track = read.ok ? ghostTrack(read.replay) : null;
		ghostNote = track ? null : read.ok ? 'This replay has no vessel to show.' : read.reason;
		flight?.setGhost(track);
	}

	/** Download the flight recorded since boot as a replay file (plan 131, ADR 0159). */
	async function exportReplay(): Promise<void> {
		const name = model?.name ?? designName ?? 'Flight';
		const replay = await flight?.replay(name);
		if (!replay) return;
		downloadText(JSON.stringify(replay), fileNameOf(name, 'orbital-replay.json'));
	}

	/** The Regions layer of map view (plan 192): the tint and the region under the cursor. */
	let regionsOn = $state(false);
	// the map's filters reach the renderer through the flight (plan 258)
	$effect(() => {
		flight?.setMapFilters(mapFilters.filters);
	});
	let regionHover = $state<{ label: string; x: number; y: number } | null>(null);
	function toggleRegions(): void {
		regionsOn = !regionsOn;
		flight?.setRegions(regionsOn);
		if (!regionsOn) regionHover = null;
	}
	function onCanvasDown(e: PointerEvent): void {
		downAt = { x: e.clientX, y: e.clientY };
	}
	/** A click (not a camera drag) on a part of the flown vessel opens its inspector (plan 214). */
	function onCanvasUp(e: PointerEvent): void {
		const from = downAt;
		downAt = null;
		if (!from || hud?.map || Math.hypot(e.clientX - from.x, e.clientY - from.y) > 4) return;
		const r = view.getBoundingClientRect();
		const part = flight?.partAt(e.clientX - r.left, e.clientY - r.top) ?? null;
		if (part !== null) {
			inspect(part);
			return;
		}
		// another vessel: its menu (plan 310)
		const menu = menuAt(e.clientX - r.left, e.clientY - r.top);
		vesselMenuAt = menu ? { menu, x: e.clientX - r.left, y: e.clientY - r.top } : null;
		vesselHover = null;
	}
	function onCanvasMove(e: PointerEvent): void {
		// the part under the pointer lights its row and itself, 20 times a second at most
		if (!hud?.map && e.buttons === 0 && (vesselOpen || inspected.length > 0)) {
			const now = performance.now();
			if (now - hoverAt > 50) {
				hoverAt = now;
				const r = view.getBoundingClientRect();
				const part = flight?.partAt(e.clientX - r.left, e.clientY - r.top) ?? null;
				if (part !== hoverPart) {
					hoverPart = part;
					flight?.highlightPart(part);
				}
			}
		}
		// the hover line over another vessel, 10 times a second at most (plan 310)
		if (!hud?.map && e.buttons === 0 && !vesselMenuAt) {
			const now = performance.now();
			if (now - vesselHoverAt > 100) {
				vesselHoverAt = now;
				const r = view.getBoundingClientRect();
				const menu = menuAt(e.clientX - r.left, e.clientY - r.top);
				vesselHover = menu ? { label: vesselTooltip(menu), x: e.clientX, y: e.clientY } : null;
			}
		} else vesselHover = null;
		if (!regionsOn || !hud?.map || e.buttons !== 0) {
			regionHover = null;
			return;
		}
		const r = view.getBoundingClientRect();
		const label = flight?.regionLabelAt(e.clientX - r.left, e.clientY - r.top) ?? null;
		regionHover = label ? { label, x: e.clientX, y: e.clientY } : null;
	}

	/** Recover the landed vessel (plan 132, ADR 0113 point 6): credit the funds, save, back to the Hangar. */
	let recoverOpen = $state(false);
	async function recover(): Promise<void> {
		recoverOpen = false;
		const r = await flight?.recover();
		if (!r?.ok) {
			saves.note = r ? r.reason : null;
			return;
		}
		worldSession.focus = null;
		if (await saves.autosave()) worldSession.saved();
		void goto(resolve('/(world)/vab'));
	}

	async function quicksave(): Promise<void> {
		if (await saves.quicksave()) worldSession.saved();
	}

	// A short confirmation ("Quicksaved.") while no dialog shows the note.
	let flashTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		if (saves.note === null || saves.loadOpen || saves.saveOpen) return;
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (saves.note = null), 3500);
		return () => clearTimeout(flashTimer);
	});

	// Saves on a stage and on touching down, besides the timer (the autosaver spaces them out).
	let lastStages = 0;
	let wasLanded = false;
	$effect(() => {
		const stages = model?.stagesFired ?? 0;
		if (stages > lastStages) worldSession.requestSave('stage');
		lastStages = stages;
		const landed = model?.phase === 'landed';
		if (landed && !wasLanded) worldSession.requestSave('landed');
		wasLanded = landed;
	});

	// Leaving an active flight asks first (plan 205, ADR 0201 point 9): in the air, under thrust or
	// in physics. The vessel keeps flying in the world's sim either way.
	let leaveTo = $state<URL | null>(null);
	let dontAsk = $state(false);
	let leaving = false;
	const activeFlight = (): boolean => {
		const v = flight?.debug.vessel();
		const s = worldSession.snapshot?.vessels.find((x) => x.id === v);
		if (!s || s.mode !== 'flight') return false;
		return model?.phase !== 'landed' || (model?.throttle ?? 0) > 0;
	};
	beforeNavigate((nav) => {
		if (leaving || nav.willUnload || !nav.to || !settings.time.askLeaveFlight) return;
		if (nav.to.url.pathname === location.pathname || !activeFlight()) return;
		nav.cancel();
		leaveTo = nav.to.url;
	});
	function leaveAnyway(): void {
		const to = leaveTo;
		leaveTo = null;
		if (dontAsk) settings.setTime({ askLeaveFlight: false });
		if (!to) return;
		leaving = true;
		void goto(to);
	}

	/** The start of a world made from a scenario, while it has no save yet (plan 100). */
	async function scenarioOfWorld(): Promise<ScenarioStart | null> {
		const w = await saves.worldsService();
		const record = await w.get(activeWorldId());
		if (!record?.scenario || record.summary.saves > 0) return null;
		const { registries } = loadPlugins(
			[Stock, ...activePlugins()],
			record.world
				? { system: { id: record.world.systemId, variant: record.world.variant } }
				: undefined
		);
		const scenario = registries.scenarios.get(record.scenario);
		return scenario
			? scenarioStart(scenario, registries.bodies, scenarioSiteOf(record.world))
			: null;
	}

	onMount(() => {
		void saves.worldsService().then(async (w) => {
			const record = await w.get(activeWorldId());
			if (!record) return;
			const presets = loadWorldCatalog().presets;
			const preset =
				presets.find((p) => p.id === record.preset) ??
				presets.find((p) => p.id === `stock.${record.preset}`);
			world = { name: record.name, mode: preset?.label ?? record.preset, system: 'Stock system' };
		});
		const {
			catalog,
			content,
			panels,
			keybindings,
			overlays,
			missions,
			objectiveLabels,
			actionGroups,
			categories,
			failureModes,
			world: worldContent
		} = loadContent();
		repairableModes = new Set(failureModes.filter((m) => m.repairable).map((m) => m.id));
		modKeybindings = keybindings;
		modOverlays = overlays;
		siteBuildings = worldContent.buildings;
		vesselContent = {
			parts: content.parts,
			modules: content.modules,
			groups: actionGroups
		};
		vesselCategories = categoriesOf(categories);
		modPanels = panels;
		// `?panel=` from the programs popover on another page (plan 359): open it once here
		const wanted = new URLSearchParams(location.search).get('panel');
		if (wanted) {
			history.replaceState(history.state, '', location.pathname);
			openPanel(wanted);
		}
		missionDefs = missions;
		objectiveNames = objectiveLabels;
		const timer = setInterval(() => {
			if (flight) catchUp = flight.catchUp(Date.now());
		}, 1000);
		bootFlight = (loadId) => {
			stop?.();
			stop = undefined;
			const run = ++boots;
			void startFlightOf(loadId, catalog, content, () => run !== boots).then((s) => {
				if (run === boots) stop = s;
				else s?.();
			});
		};
		bootFlight(new URLSearchParams(location.search).get('load'));
		return () => {
			boots += 1;
			clearInterval(timer);
			stop?.();
			worldSession.collect = null;
		};
	});

	/** The running flight's cleanup, and a counter that drops a boot a newer one replaced. */
	let stop: (() => void) | undefined;
	let boots = 0;
	let bootFlight: (loadId: string | null) => void = () => {};

	/** A load from the dialog or F9: the world's sim restarts from the save, the page stays (plan 204). */
	function restartWith(id: string): void {
		history.replaceState(history.state, '', resolve('/(world)/flight'));
		problem = null;
		loadFailed = false;
		bootFlight(id);
	}

	/**
	 * Start the flight on the world's one sim (plan 204, ADR 0201): a save restarts it, a launch adds
	 * the design to the running world, and coming back without either takes up the focus vessel.
	 */
	/** The world's buildings, so the launch site draws what the player built (ADR 0117). */
	let siteBuildings: ReturnType<typeof loadContent>['world']['buildings'] | undefined;
	/** Mod keybindings of the loaded content (plan 343). */
	let modKeybindings: KeybindingDefinition[] = [];
	/** Mod overlays of the loaded content (plan 347). */
	let modOverlays: OverlayDefinition[] = [];

	async function startFlightOf(
		loadId: string | null,
		catalog: ReturnType<typeof loadContent>['catalog'],
		content: ReturnType<typeof loadContent>['content'],
		gone: () => boolean
	): Promise<(() => void) | undefined> {
		let design: VesselDesign;
		let resume: GameSave | undefined;
		let start: ScenarioStart | null = null;
		let attach: { vessel: number } | undefined;
		const launch = loadId === null ? takeLaunchChoice() : null;
		// the Hangar's draft without a Launch screen choice (a quick launch): the primary site's pad
		let quick = false;
		let client: SimClient;
		if (loadId !== null) {
			try {
				resume = await saves.read(loadId);
			} catch (e) {
				loadFailed = true;
				problem = e instanceof Error ? e.message : String(e);
				return undefined;
			}
			design = resume.design;
			// a save is flown in its own world (plan 087, ADR 0143); the world rolls back with it
			const worldId = resume.worldId ?? 'legacy';
			setActiveWorld(worldId);
			const ephemeris = await ephemerisFor(resume.sim.worldInfo);
			if (gone()) return undefined;
			client = worldSession.restart(worldId, {
				resume: resume.sim,
				...(ephemeris ? { ephemeris } : {})
			});
			worldSession.base = resume;
			worldSession.focus = null;
		} else {
			client = await bootWorld(worldSession, activeWorldId());
			if (gone()) return undefined;
			const focus = worldSession.focus ?? baseFocus();
			if (!launch && focus) {
				// back in Flight: the vessel that was flying, still in the running world
				design = focus.design;
				attach = { vessel: focus.vessel };
			} else if (!launch && !worldSession.base && (start = await scenarioOfWorld())) {
				// a world made from a scenario starts its first flight from it (plan 100, ADR 0151)
				design = start.design;
			} else if (!launch && lesson?.design) {
				// a lesson flies its own vessel; the setup puts it where the lesson starts (plan 229)
				design = lesson.design(content);
				lessonContent = content;
			} else {
				quick = true;
				const text = loadDraft();
				if (text === null) {
					problem = 'No vessel to launch yet.';
					return undefined;
				}
				const parsed = parseDesign(text, partLookup(catalog));
				if (!parsed.ok) {
					problem = `The saved design is invalid: ${parsed.errors.join('; ')}`;
					return undefined;
				}
				design = parsed.design;
			}
		}
		if (gone()) return undefined;
		// the HUD's bodies and calendar are the world's own system's (plan 124, ADR 0184)
		const ready = await client.ready.catch(() => null);
		if (ready) warpSteps = warpStepsFor(ready.systemId);
		if (ready) missionWorld = missionWorldOf(ready.bodies, ready.home);
		const info =
			resume?.sim.worldInfo ??
			worldSession.base?.sim.worldInfo ??
			(await saves.worldStartInfo(activeWorldId()));
		const own = info ? loadContent({ id: info.systemId, variant: info.variant }) : undefined;
		if (own) siteBuildings = own.world.buildings;
		// the guide's orbit line is the world's own air (plan 380): 70 km at Home, 100 km on the Earth
		airTop = homeBodyOf((own?.catalog ?? catalog).bodies, info)?.atmosphere?.height;
		if (info) launchSites = sitesOf(info);
		if (gone() || !ready) return undefined;
		return begin(
			own?.catalog ?? catalog,
			own?.content ?? content,
			design,
			resume,
			client,
			attach,
			launch?.placement ??
				(quick && siteBuildings
					? quickLaunchPlacement(
							launchSites,
							siteBuildings,
							design.aircraft === true,
							worldSession.snapshot?.sites
						)
					: undefined),
			start,
			launch?.crew
		);
	}

	/** The boot save's focus vessel while it is still in the world. */
	function baseFocus(): { vessel: number; design: VesselDesign } | null {
		const base = worldSession.base;
		if (!base || base.focus === null) return null;
		const alive = worldSession.snapshot?.vessels.some((v) => v.id === base.focus) ?? true;
		return alive ? { vessel: base.focus, design: base.design } : null;
	}

	/** JPL's DE440 for an n-body Sol world (plan 125, ADR 0122), with a note while it loads. */
	async function ephemerisFor(info: WorldInfo | undefined): Promise<ArrayBuffer | undefined> {
		if (!needsEphemeris(info)) return undefined;
		notice = "Loading JPL's DE440 ephemeris (7.5 MB, once)…";
		try {
			const e = await loadEphemeris();
			notice = null;
			return e;
		} catch (e) {
			notice = `The planets keep their own paths: ${e instanceof Error ? e.message : String(e)}.`;
			return undefined;
		}
	}

	/** Start the flight and return its cleanup. */
	function begin(
		catalog: ReturnType<typeof loadContent>['catalog'],
		content: ReturnType<typeof loadContent>['content'],
		design: VesselDesign,
		resume: GameSave | undefined,
		client: SimClient,
		attach: { vessel: number } | undefined,
		placement?: VesselPlacement,
		start: ScenarioStart | null = null,
		crew?: { member: string; part: number }[]
	): () => void {
		designName = design.name;
		source = loadScript(designName) ?? '';
		// the world's sandbox (plan 239): a script keeps running when this page goes
		const scriptSandbox = worldSession.scriptSandbox() ?? startScriptSandbox();
		// each vessel's script has a sandbox of its own (plan 322); the panel shows the active vessel's
		let offSandbox = (): void => {};
		const watchSandbox = (id: number): void => {
			offSandbox();
			const box = worldSession.scriptSandbox(id) ?? scriptSandbox;
			offSandbox = box.onStatus((s) => (sandbox = s));
		};
		sandboxWatch = watchSandbox;
		watchSandbox(-1);
		// The syntax check uses a sandbox of its own, opened on the first check (plan 058, ADR 0085).
		const checkSandbox = startScriptSandbox();
		checker = createScriptChecker({
			open: () => checkSandbox.open(),
			close: () => checkSandbox.close()
		});
		// A shared link (`/flight#script=...`) opens the panel with the script shown, not run. It
		// is read on load and when the fragment changes in this tab.
		const importFromHash = (): void => {
			const token = tokenFromHash(location.hash);
			if (token === null) return;
			history.replaceState(null, '', location.pathname + location.search);
			openPanel('host.script');
			void decodeScript(token).then((decoded) => {
				if (decoded.ok) importScript(decoded.source, { from: 'link' });
				else notice = `The link was not imported: ${decoded.reason}.`;
			});
		};
		importFromHash();
		window.addEventListener('hashchange', importFromHash);
		const pointer = matchMedia('(pointer: coarse)');
		const syncPointer = (): void => void (coarse = pointer.matches);
		syncPointer();
		pointer.addEventListener('change', syncPointer);
		const small = matchMedia('(max-height: 800px)');
		const sync = (): void => void (tall = !small.matches);
		sync();
		small.addEventListener('change', sync);
		const started: Flight = startFlight({
			host: view,
			design,
			client,
			...(resume ? { resume } : {}),
			...(attach ? { attach } : {}),
			...(start
				? {
						placement: start.placement,
						scenario: { others: start.others, missions: start.missions }
					}
				: placement
					? { placement }
					: {}),
			...(crew?.length ? { crew } : {}),
			content,
			...(siteBuildings ? { buildings: siteBuildings } : {}),
			sites: launchSites,
			profile: profileStore(),
			onHud: (h) => {
				hud = h;
				if (h.status === 'flying' && lesson && !lessonReady && !lessonSetting)
					void setLessonScene();
				// the vessel in focus, for coming back to Flight and for the world's autosave (plan 204)
				const v = h.status === 'flying' ? flight?.debug.vessel() : null;
				if (v != null && worldSession.focus?.vessel !== Number(v))
					worldSession.focus = { vessel: Number(v), design: flight?.design ?? design };
				// dock panels read the same 10 Hz update (ADR 0149 point 2)
				if (dockShown || vesselOpen || inspected.length > 0)
					panelInput = flight?.panelInput() ?? null;
				const stages = flight?.design.stages;
				if (stages && stages !== vesselStages) vesselStages = stages as number[][];
			},
			onScript: (v) => (script = v),
			onGraphics: (p) => (graphics = p),
			sandbox: scriptSandbox,
			sandboxFor: (id) => worldSession.scriptSandbox(id),
			onFrame: (f: FrameData) => {
				deck?.paint(f.navball);
				markers?.place(f.map, f.maneuver?.apsides ?? []);
				if (planner) {
					const sel = planner.selected;
					if (sel !== nodeSelected) nodeSelected = sel;
					const shown = sel ?? model?.maneuver?.id ?? null;
					const p = shown === null ? null : planner.planned(shown);
					const k = p
						? `${Math.round(p.apoapsis ?? -1)}|${Math.round(p.periapsis)}|${p.body}|${p.period === null ? '' : Math.round(p.period)}`
						: '';
					if (k !== nodePlannedKey) {
						nodePlannedKey = k;
						nodePlanned = p;
					}
				}
				const net = f.network ?? null;
				const netKey = net === null ? '' : JSON.stringify(net);
				if (netKey !== mapNetworkKey) {
					mapNetworkKey = netKey;
					mapNetwork = net;
				}
				const bl = f.bodyLabels ?? null;
				const blKey = bl === null ? '' : JSON.stringify(bl);
				if (blKey !== mapBodyLabelsKey) {
					mapBodyLabelsKey = blKey;
					mapBodyLabels = bl;
				}
				const g = f.ghost ?? null;
				const ghostKey = g === null ? '' : JSON.stringify(g);
				if (ghostKey !== ghostFrameKey) {
					ghostFrameKey = ghostKey;
					ghostFrame = g;
				}
				targetMarks?.place(f.target ?? null);
				mapPoints = stackPoints(f.target?.map ?? null);
				heatBars?.place(f.heat ?? null);
				nodeLayer?.place(f.maneuver ?? null);
			},
			// the player's profile and keys (plan 216; before it the flight read the defaults only)
			keymap: () =>
				lesson
					? lessonKeymap(settings.keymap, lesson, (reason) => lessonNotice.show(reason))
					: settings.keymap,
			// mod keys with the player's overrides (plan 343, ADR 0292 point 6)
			modKeys: () => modKeyRows(modKeybindings, settings.modKeys, settings.keymap),
			// mod overlays and the player's toggles (plan 347, ADR 0296)
			overlays: () => ({ defs: modOverlays, toggles: settings.overlays }),
			cameraMode: loadCameraMode(),
			...(start
				? {}
				: { clearLaunchSite: (snap, dispatch) => clearLaunchSite(placement, snap, dispatch) }),
			onLaunchPoint: (sim) => {
				worldSession.revertPoint = { worldId: activeWorldId(), sim };
				launchedHere = true;
			},
			onCameraMode: saveCameraMode,
			onMapPick: mapPick,
			onKey: (key) => {
				if (key === 'escape' && mapStack) mapStack = null;
				else if (key === 'escape' && vesselMenuAt) vesselMenuAt = null;
				else if (key === 'escape' && uiHidden) uiHidden = false;
				else if (key === 'escape') pauseOpen = true;
				else if (key === 'hideUi') uiHidden = !uiHidden;
				else if (key === 'screenshot') void screenshot();
				else if (key === 'quicksave') void quicksave();
				else if (key === 'quickload') quickload();
				else if (key === 'debug') debugOpen = true;
				else helpOpen = true;
			}
		});
		flight = started;
		// the player's map filters, remembered from before (plan 258)
		started.setMapFilters(mapFilters.filters);
		worldSession.collect = () => started.collectSave();
		// the debug panel's host (plan 203; `window.__orbitalDebug` is the world layout's since plan
		// 205), the log of uncaught errors, Debug mode from Settings, and the world's "used cheats" mark
		debugHost = started.debug;
		flightDebug.current = started.debug;
		let modeSent: boolean | null = null;
		let marked = false;
		const offDebugWatch = started.debug.onSnapshot((s) => {
			const d = s.debug;
			if (!d) return;
			if (d.access === 'opt-in' && d.mode !== settings.debug && modeSent !== settings.debug) {
				modeSent = settings.debug;
				void started.debug.send({ type: 'debug-mode', on: settings.debug });
			}
			if (d.usedCheats && !marked) {
				marked = true;
				void saves.worldsService().then((w) => w.markUsedCheats(activeWorldId()));
			}
		});
		debugDesigns = async () => {
			const own = [{ name: design.name, design }];
			try {
				const store = withFallback(indexedDbStore());
				const entries = await listEntries(store, content.parts, 'vessel');
				return [
					...own,
					...entries.flatMap((e) =>
						e.ok && e.record.name !== design.name ? [{ name: e.record.name, design: e.design }] : []
					)
				];
			} catch {
				return own;
			}
		};
		const waitForPlanner = setInterval(() => {
			if (started.maneuver) {
				planner = started.maneuver;
				clearInterval(waitForPlanner);
			}
		}, 100);
		return () => {
			clearInterval(waitForPlanner);
			offDebugWatch();
			debugHost = null;
			flightDebug.current = null;
			offSandbox();
			checker?.close();
			checker = null;
			window.removeEventListener('hashchange', importFromHash);
			small.removeEventListener('change', sync);
			pointer.removeEventListener('change', syncPointer);
			flight = null;
			worldSession.collect = null;
			worldSession.hold('flight-menu', false);
			started.dispose();
		};
	}

	// The sim freezes and the flight keys go quiet while a dialog is open.
	$effect(() => {
		// the Debug panel pauses like the menu (plan 257; it let the sim run in plan 203)
		const modal = dialogOpen({
			pause: pauseOpen,
			help: helpOpen,
			settings: settingsOpen,
			load: saves.loadOpen,
			save: saves.saveOpen,
			debug: debugOpen
		});
		flight?.setPaused(modal);
		// the world clock pauses for a menu as the player's "Menu" place says (plan 205)
		worldSession.hold('flight-menu', modal);
		flight?.setModal(modal);
	});

	/** Edits and "Load sample" both go through here so the text is saved per design. */
	function setSource(text: string): void {
		source = text;
		if (designName) saveScript(designName, text);
	}

	/** Text from a file, a link or the clipboard replaces the editor; it must be confirmed before it runs. */
	function importScript(text: string, info: ImportInfo): void {
		if (imported === null) backup = source;
		imported = info;
		notice = null;
		setSource(text);
	}
	function undoImport(): void {
		setSource(backup ?? '');
		imported = null;
		backup = null;
	}
	function loadSample(): void {
		imported = null;
		backup = null;
		setSource(ascentScript);
	}

	const shown = $derived(
		script.errorLine !== null && source !== ranSource ? { ...script, errorLine: null } : script
	);
	const model = $derived(hud?.model ?? null);
	/** The status strip under the navball (V3 §2.2, ADR 0253 point 7). */
	const chips = $derived(
		statusChips({
			uncontrolled: model?.uncontrolled ?? null,
			link: model?.link ?? null,
			blackout: model?.blackout ?? 0,
			range: model?.range ?? null,
			sas: model?.sas ?? null,
			drive: hud?.drive ?? false
		})
	);
	// a failed action flashes the chip that explains it (V3 §2.2, plan 274)
	let flashChip = $state<StatusChip['id'] | null>(null);
	let flashedToast = 0;
	let chipFlashTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const newest = model?.toasts.at(-1);
		if (!newest || newest.id === flashedToast) return;
		flashedToast = newest.id;
		const id = untrack(() => chipToFlash(newest, chips));
		if (!id) return;
		flashChip = id;
		clearTimeout(chipFlashTimer);
		chipFlashTimer = setTimeout(() => (flashChip = null), FLASH_MS);
	});
	// the EVA controls live in the dock's Crew entry since v3: it opens when a suit steps out (ADR 0253 point 5)
	const onEva = $derived(!!hud?.eva);
	$effect(() => {
		if (onEva) untrack(() => openPanel('host.crew'));
	});
	const t = $derived(hud?.telemetry ?? null);
	const running = $derived(scriptIsActive(script.status));
	/** The world's warp levels (plan 206). */
	let warpSteps = $state<readonly number[]>(WARP_STEPS);
	const warpUsable = $derived(canWarp(t, hud?.warp ?? 1, running));

	// The Base layout's bars (plan 233, BASE_LAYOUT §3 and the v2 Flight page): this page's actions
	// in the menu bar, its warp and mission time in the time bar, the vessel in the status bar.
	// V3 §2.3 (plan 272): Panels · Navball · Staging · Camera; white when shown, gray when hidden
	const flightActions = $derived<PageAction[]>([
		{
			id: 'panels',
			label: 'Panel dock',
			title: 'Panels',
			icon: 'panels',
			on: dockShown,
			onclick: () => {
				dockShown = !dockShown;
				if (dockShown) panelInput = flight?.panelInput() ?? null;
				else flight?.highlightPart(null);
			}
		},
		{
			id: 'navball',
			label: 'Navball',
			title: 'Navball and instruments',
			icon: 'navball',
			on: navOpen,
			onclick: () => (navOpen = !navOpen)
		},
		{
			id: 'staging',
			label: 'Staging',
			title: 'Staging',
			icon: 'staging',
			on: stagingOpen,
			onclick: () => (stagingOpen = !stagingOpen)
		},
		{
			// a one-press action without a dot (BASE_LAYOUT.md; plan 226, ADR 0226)
			id: 'camera',
			label: 'Change camera',
			title: `Change camera (${settings.keymap.label('cameraMode') || 'no key'})`,
			icon: 'camera',
			testid: 'tb-camera',
			onclick: () => flight?.cycleCameraMode()
		}
	]);
	$effect(() => {
		pageShell.actions = flightActions;
	});
	// The bars take new values only when what they show changes, not on every HUD frame: T+ in
	// whole seconds, the warp level, its limit and the vessel's situation.
	const shellTime = $derived.by(() => {
		const steps = warpSteps;
		const warp = hud?.warp ?? 1;
		const limit = hud?.warpLimit ?? null;
		const clamp = hud?.warpClamp ?? null;
		const index = steps.reduce((at, step, i) => (step <= warp ? i : at), 0);
		const limited = limit?.reason && limit.max < steps[steps.length - 1]!;
		return JSON.stringify({
			steps,
			index,
			limit: limit?.max ?? null,
			reason: clamp ?? (limited ? `Max ${warpText(limit.max)} — ${limit.reason}` : ''),
			elapsed: Math.floor(model ? (model.prelaunch ? model.time : model.met) : 0),
			date: model?.date ?? '',
			usable: warpUsable
		});
	});
	$effect(() => {
		const t = JSON.parse(shellTime) as {
			steps: number[];
			index: number;
			limit: number | null;
			reason: string;
			elapsed: number;
			date: string;
			usable: boolean;
		};
		pageShell.time = {
			...t,
			onpick: (i) => {
				if (i > t.index && !t.usable) return;
				flight?.stepWarp(i - t.index);
			},
			catchUp,
			oncatchup: () =>
				void flight?.acceptCatchUp(Date.now()).then((r) => {
					if (r && !r.ok) notice = `Catch up was refused: ${r.reason}`;
				})
		};
	});
	const shellPlace = $derived(model ? JSON.stringify([model.name, model.situation]) : '');
	$effect(() => {
		const place = shellPlace ? (JSON.parse(shellPlace) as [string, string]) : null;
		pageShell.location = place ? { icon: 'vessel', text: place[0], situation: place[1] } : null;
	});
	const mapOn = $derived(hud?.map ?? false);
	$effect(() => {
		const on = mapOn;
		pageShell.map = { on, toggle: () => flight?.toggleMap() };
		pageShell.menu = () => (pauseOpen = true);
	});
	$effect(() => () => pageShell.reset());
	// User Timing mark for the release measurements (plan 023): time from navigation start to the
	// first HUD model, i.e. the vessel is on the pad and the player can act.
	let booted = false;
	let marked = false;
	$effect(() => {
		// `flight-booted`: the sim Worker has loaded the vessel (no GPU work needed to know that).
		if (!booted && hud?.status === 'flying') {
			booted = true;
			performance.mark('orbital:flight-booted');
		}
		if (marked || model === null) return;
		marked = true;
		performance.mark('orbital:flight-playable');
	});

	// The camera draws the vessel in the middle of what the panels leave free: the instrument deck at
	// the bottom no longer hides the lower half of the rocket (plan 023, journal 021).
	let lastInsets = '';
	// The measured height of the instrument deck (plan 055): columns above it limit themselves to
	// what it leaves, and the touch throttle centres in the same space (`layout-model.ts`).
	let deckHeight = $state(DECK_FALLBACK);
	let leftStackBottom = $state(0);
	/** Right edge of the open dock panel, 0 when none is open (plan 112). */
	let dockRight = $state(0);
	/** Where the guide card stands (plan 344): px from the left, and from the bottom when it must clear the navball module. */
	let guideLeft = $state<number | null>(null);
	let guideBottom = $state<number | null>(null);
	let guideEl = $state<HTMLDivElement>();
	$effect(() => {
		// the card changes size with its step, the dock with its panel: measure again then
		const el = guideEl;
		const tl = document.querySelector('.ui > .tl');
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => queueMicrotask(updateInsets));
		ro.observe(el);
		if (tl) ro.observe(tl);
		return () => ro.disconnect();
	});
	/** The open dock panel reaches the navball module's left edge (a wide dock or a narrow window). */
	let dockMeetsDeck = $state(false);
	let viewport = $state({ width: 1440, height: 900 });
	/** The status bar's height from the bottom of the window (plan 233): 32 px at 100 %. */
	let statusHeight = $state(32);
	/**
	 * The region rules (plan 215, ADR 0205 point 6, revised by ADR 0253 point 8): widths over the UI
	 * scale decide; below 1280 staging and the dock stop above the navball module; at 1024 and below,
	 * drawers with 44 px targets.
	 */
	const layout = $derived(layoutFor(viewport.width, settings.ui.scale));
	const narrow = $derived(layout.mode !== 'two');
	/** Top of the staging box at the bottom right, 0 when hidden: the part inspectors stop above it. */
	let stagingTop = $state(0);
	/** How much the right column's top stands under the safe area's, clear of the map toolbar (ADR 0267). */
	let brCap = $state(0);
	let stagingEl = $state<HTMLDivElement>();
	$effect(() => {
		// staging grows and shrinks with its stages: measure again then
		const el = stagingEl;
		if (!el || typeof ResizeObserver === 'undefined') return;
		const ro = new ResizeObserver(() => queueMicrotask(updateInsets));
		ro.observe(el);
		return () => ro.disconnect();
	});
	/** The flight's own box (inside the world layout's bars since plan 204): every measure is relative to it. */
	let stageEl = $state<HTMLDivElement>();
	function updateInsets(): void {
		const frame = stageEl?.getBoundingClientRect() ?? {
			left: 0,
			top: 0,
			width: innerWidth,
			height: innerHeight
		};
		viewport = { width: frame.width, height: frame.height };
		const box = (sel: string) => {
			const r = document.querySelector(sel)?.getBoundingClientRect();
			if (!r) return undefined;
			return {
				left: r.left - frame.left,
				right: r.right - frame.left,
				top: r.top - frame.top,
				bottom: r.bottom - frame.top,
				width: r.width,
				height: r.height
			};
		};
		const deck = box('.bc .deck');
		// the time bar is the top of the view (plan 233); the status bar is under the bottom panels
		const bar = box('[data-testid="time-bar"]');
		const status = box('[data-testid="status-bar"]');
		statusHeight = status ? Math.round(frame.height - status.top) : 0;
		if (deck && deck.height > 0) deckHeight = Math.round(deck.height);
		const left = box('.tl');
		leftStackBottom = left ? Math.round(left.bottom) : 0;
		const open = box('.tl .dock .open');
		// beside the whole left stack: the capsules can be wider than the open panel
		dockRight = open && open.width > 0 && left ? Math.round(Math.max(open.right, left.right)) : 0;
		// a wide dock would run under the module: it stops above it then (ADR 0253 point 8)
		dockMeetsDeck = !!deck && deck.height > 0 && dockRight > deck.left - 8;
		// the guide card (plan 344): bottom left, beside the dock's rail or open panel, lifted above
		// the navball module where the two would meet
		const rail = box('.tl .dock');
		const besideDock = Math.max(dockRight, rail && rail.width > 0 ? rail.right : 0);
		const guide = box('.ui > .guide');
		const gap = 12;
		// in the corner under a short dock; beside it when the dock reaches down to the card
		const guideTop = frame.height - statusHeight - 24 - (guide?.height ?? 200);
		const dockBottom = rail && rail.height > 0 ? rail.bottom : 0;
		guideLeft = besideDock > 0 && dockBottom > guideTop - gap ? Math.round(besideDock + gap) : null;
		const from = guideLeft ?? 24;
		guideBottom =
			deck && deck.height > 0 && from + (guide?.width ?? 272) + gap > deck.left
				? Math.round(frame.height - deck.top + gap)
				: null;
		const staging = box('.ui > .br');
		stagingTop = staging && staging.height > 0 ? Math.round(staging.top) : 0;
		const top = box('.tl')?.top;
		brCap = staging && top !== undefined ? cornerTop(top, staging, box('.tc .maptools')) - top : 0;
		// Side panels float over the view and do not move the camera (plan 215, ADR 0205 point 7):
		// only the fixed bars count, unless the player asked to centre the vessel in the free area.
		const insets = viewInsets({
			frame,
			bar,
			deck,
			dockRight,
			centre: settings.ui.centreVessel
		});
		const key = [insets.top, insets.right, insets.bottom, insets.left].map(Math.round).join(',');
		if (key === lastInsets) return;
		const first = lastInsets === '';
		lastInsets = key;
		const still = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
		flight?.setViewInsets(insets, { animate: !first && !still });
	}
	$effect(() => {
		void model?.name;
		void tall;
		void scriptOpen;
		void settings.dock.open;
		void dockShown;
		void tutorialStep;
		void lessonShown;
		void hud?.status;
		void settings.ui.centreVessel;
		void settings.ui.scale;
		void navOpen;
		void stagingOpen;
		void hud?.map;
		void !!model?.maneuver;
		queueMicrotask(updateInsets);
	});

	/** The first-flight guide: what the player has done so far, as the step machine's input. */
	/** Top of the world's home air, m (plan 380): the first-flight guide's orbit line. */
	let airTop = $state<number | undefined>(undefined);
	const observation = $derived.by((): Observation | null => {
		if (!hud || hud.status !== 'flying' || !model) return null;
		return {
			scene: 'flight',
			flight: {
				throttle: model.throttle,
				stagesFired: model.stagesFired,
				altitude: model.altitude,
				sasOn: model.sas !== undefined && model.sas.mode !== 'off',
				sasMode: model.sas?.mode ?? 'off',
				map: hud.map,
				apoapsis: model.orbit?.apoapsis ?? null,
				periapsis: model.orbit && !model.orbit.escape ? model.orbit.periapsis : null,
				...(airTop === undefined ? {} : { airTop })
			}
		};
	});
	$effect(() => {
		// a lesson world teaches its own lesson, not the first flight (plan 229)
		if (observation === null || lesson) return;
		const next = advance(settings.tutorial, observation);
		if (next !== settings.tutorial) settings.setTutorial(next);
	});
	const tutorialStep = $derived(
		hud?.status === 'flying' && !pauseOpen && !lesson
			? currentStep(settings.tutorial, 'flight')
			: null
	);

	// ---- lessons (plan 229) ----------------------------------------------------------------------
	/** Sets the lesson's scene through the debug API, once per lesson world. */
	async function setLessonScene(): Promise<void> {
		if (!lesson || !debugHost || !lessonContent) return;
		lessonSetting = true;
		// the clock is held while the scene is set and until Begin, so nothing moves before the player reads
		worldSession.hold('lesson', true);
		const result = await runLessonSetup(lesson, createDebugApi(debugHost), lessonContent);
		lessonSetting = false;
		if (!result.ok) {
			lessonProblem = `The lesson could not set its scene (${result.reason}).`;
			return;
		}
		lessonProblem = null;
		markLessonReady();
		lessonReady = true;
		settings.setLesson(lesson.id, { status: 'active', step: 0 });
	}
	function beginLesson(): void {
		lessonBegun = true;
		worldSession.hold('lesson', false);
	}
	$effect(() => {
		// the clock waits while the player reads the first card (a lesson often starts mid-fall)
		if (lesson && lessonReady && !lessonBegun) worldSession.hold('lesson', true);
		return () => worldSession.hold('lesson', false);
	});
	const lessonObservation = $derived.by((): LessonObservation | null => {
		if (!lesson || !lessonReady || !lessonBegun) return null;
		if (!hud || hud.status !== 'flying' || !model || !debugHost) return null;
		const input = flight?.panelInput();
		const v = input?.vessel;
		if (!v) return null;
		return observeLesson({
			vessel: v,
			snapshot: input.snapshot,
			stagesFired: model.stagesFired,
			panels: settings.dock.panels,
			openPanel: settings.dock.open,
			eva: hud.eva,
			drive: hud.drive === true,
			bodies: debugHost.bodies(),
			throttle: model.throttle,
			altitude: model.altitude,
			sasMode: model.sas?.mode ?? 'off',
			rcs: model.rcs === 'on',
			map: hud.map,
			warp: hud.warp,
			apoapsis: model.orbit?.apoapsis ?? null,
			periapsis: model.orbit && !model.orbit.escape ? model.orbit.periapsis : null,
			nodes: model.maneuver?.nodes ?? [],
			target: model.target
				? {
						key: model.target.key,
						distance: model.target.distance,
						relativeSpeed: model.target.relativeSpeed
					}
				: null
		});
	});
	const lessonProgress = $derived(
		lesson ? (settings.lessons[lesson.id] ?? NEW_LESSON) : NEW_LESSON
	);
	$effect(() => {
		// a blocked control's reason stays until the lesson moves on
		void lessonProgress.step;
		void lessonProgress.status;
		lessonNotice.clear();
	});
	$effect(() => {
		if (!lesson || lessonObservation === null) return;
		const next = advanceLesson(lesson, lessonProgress, lessonObservation);
		if (next !== lessonProgress) settings.setLesson(lesson.id, next);
	});
	const lessonShown = $derived(
		lesson && hud?.status === 'flying' && !pauseOpen && (lessonReady || lessonProblem !== null)
			? lesson
			: null
	);
	/**
	 * Leave the lesson: out to the Lessons page, without the "leave an active flight?" question (the
	 * lesson world goes away). Leaving the world saves it first, into the lesson world; the Lessons
	 * page then ends the session, brings the player's world back and removes the lesson world.
	 */
	function leaveLessonToList(): void {
		leaving = true;
		lessonNotice.clear();
		// the save on the way out needs a running clock: a lesson left before Begin lets it go
		lessonBegun = true;
		worldSession.hold('lesson', false);
		void goto(resolve('/lessons'));
	}
	const canRun = $derived(hud?.status === 'flying' && source.trim() !== '' && !running);
</script>

<PageMeta
	title="Flight · {GAME_NAME}"
	description="Fly your rocket: throttle, stage, hold attitude with SAS, plan maneuvers on the map and reach orbit."
/>

<svelte:window
	onresize={updateInsets}
	onpointerdowncapture={onPressCapture}
	onpointerupcapture={() => (mapPress = false)}
	onpointercancelcapture={() => (mapPress = false)}
/>
<svelte:document
	onselectstart={(e) => {
		if (mapPress) e.preventDefault();
	}}
/>

<div class="stage" class:bare={uiHidden} bind:this={stageEl}>
	<div
		class="view"
		role="application"
		aria-label="Flight view"
		bind:this={view}
		onpointermove={onCanvasMove}
		onpointerdown={onCanvasDown}
		onpointerup={onCanvasUp}
		onpointerleave={() => {
			regionHover = null;
			vesselHover = null;
			if (hoverPart !== null) {
				hoverPart = null;
				flight?.highlightPart(null);
			}
		}}
	></div>
	{#if vesselMenuAt && !hud?.map}
		<VesselMenuView
			menu={vesselMenuAt.menu}
			x={vesselMenuAt.x}
			y={vesselMenuAt.y}
			onclose={() => (vesselMenuAt = null)}
			oncontrol={() => vesselMenuAction({ kind: 'control' })}
			ontarget={() => vesselMenuAction({ kind: 'target' })}
			onport={(part) => vesselMenuAction({ kind: 'port', part })}
			onfocus={() => vesselMenuAction({ kind: 'focus' })}
			onrename={(name) => vesselMenuAction({ kind: 'rename', name })}
			onrecover={() => vesselMenuAction({ kind: 'recover' })}
			onterminate={() => vesselMenuAction({ kind: 'terminate' })}
		/>
	{/if}
	{#if vesselHover && !vesselMenuAt && !hud?.map}
		<div
			class="vessel-hover"
			data-testid="vessel-hover"
			style:left="{vesselHover.x + 14}px"
			style:top="{vesselHover.y + 14}px"
		>
			{vesselHover.label}
		</div>
	{/if}
	{#if mapStack && hud?.map}
		<MapPickList
			stack={mapStack}
			onclose={() => (mapStack = null)}
			onpick={(entry) => {
				const at = { x: mapStack?.x ?? 0, y: mapStack?.y ?? 0 };
				mapStack = null;
				flight?.setTarget(entry.key);
				mapCard = mapCardFor(entry.key, model?.targets ?? [], at);
			}}
		/>
	{/if}
	<Dialog
		open={occupied !== null}
		title={occupied?.prompt.title ?? ''}
		onclose={() => occupied?.answer('cancel')}
	>
		{#if occupied}
			{@const p = occupied.prompt}
			<p class="occupied-why" data-testid="launch-occupied">
				The launch site is occupied by {p.names}. Clear it to launch.
				{#if p.crewWarning}<br />{p.crewWarning}{/if}
			</p>
			<div class="occupied-acts">
				{#if p.canRecover}
					<Button
						variant="primary"
						onclick={() => occupied?.answer('recover')}
						data-testid="launch-occupied-recover"
						>Recover {p.ids.length === 1 ? 'it' : 'them'}{p.credit ? ` · ${p.credit}` : ''}</Button
					>
				{/if}
				<Button
					variant={p.canRecover ? 'ghost' : 'primary'}
					onclick={() => occupied?.answer('terminate')}
					data-testid="launch-occupied-terminate"
					>Terminate {p.ids.length === 1 ? 'it' : 'them'}</Button
				>
				<Button
					variant="ghost"
					onclick={() => occupied?.answer('cancel')}
					data-testid="launch-occupied-cancel">Cancel</Button
				>
			</div>
		{/if}
	</Dialog>
	{#if mapCard && hud?.map}
		<MapCardView
			card={mapCard}
			menu={mapCardMenu}
			onrecover={() => mapCardCommand('recover-vessel')}
			onterminate={() => mapCardCommand('terminate-vessel')}
			onclose={() => (mapCard = null)}
			onswitch={(id) => {
				mapCard = null;
				void flight?.switchVessel(id).then((r) => {
					if (!r.ok) notice = r.reason;
				});
			}}
		/>
	{/if}
	{#if mapNetwork && (mapFilters.filters.links || mapFilters.filters.stations)}<NetworkLayer
			network={{
				lines: mapFilters.filters.links ? mapNetwork.lines : [],
				stations: mapFilters.filters.stations ? mapNetwork.stations : []
			}}
		/>{/if}
	{#if mapBodyLabels && mapFilters.filters.labels}<BodyLabels labels={mapBodyLabels} />{/if}
	{#if ghostFrame}<GhostLayer ghost={ghostFrame} />{/if}
	<input
		bind:this={ghostInput}
		type="file"
		accept=".json,application/json"
		hidden
		data-testid="ghost-file"
		onchange={(e) => {
			const file = e.currentTarget.files?.[0];
			if (file) void loadGhost(file);
			e.currentTarget.value = '';
		}}
	/>
	<MapMarkers
		bind:this={markers}
		orbit={model?.orbit ?? null}
		now={model?.time ?? 0}
		onwarp={warpToMark}
		onalarm={alarmAtMark}
		labels={mapFilters.filters.labels}
	/>
	<TargetMarkers bind:this={targetMarks} />
	<HeatBars bind:this={heatBars} />
	<ManeuverLayer bind:this={nodeLayer} controller={planner} />

	{#if problem}
		<div class="center cover">
			{#if loadFailed}
				<StatusCard tone="danger" title="That flight could not be loaded">
					<p>{problem}</p>
					{#snippet actions()}
						<a class="cta" href={resolve('/')}>Main menu</a>
						<a class="cta quiet" href={resolve('/(world)/vab')}>Open the VAB</a>
					{/snippet}
				</StatusCard>
			{:else}
				<StatusCard tone="warning" title="Nothing to fly">
					<p>{problem} Build a vessel in the VAB, then launch it from there.</p>
					{#snippet actions()}
						<a class="cta" href={resolve('/(world)/vab')}>Open the VAB</a>
					{/snippet}
				</StatusCard>
			{/if}
		</div>
	{:else if hud}
		{#if hud.status === 'booting'}
			<LoadingScreen overlay step="Starting the simulation and loading the parts" />
		{:else if hud.status === 'error'}
			<div class="center cover">
				<StatusCard tone="danger" title="The simulation stopped">
					<p>{hud.message}</p>
					{#snippet actions()}
						<Button variant="primary" onclick={() => location.reload()}>Reload</Button>
						<a class="cta quiet" href={resolve('/(world)/vab')}>Back to the VAB</a>
					{/snippet}
				</StatusCard>
			</div>
		{:else if hud.status === 'refused'}
			<div class="center cover">
				<StatusCard tone="warning" title="Launch refused">
					<p>{hud.message}.</p>
					{#snippet actions()}
						<a class="cta" href={resolve('/(world)/vab')}>Back to the VAB</a>
						<a class="cta quiet" href={resolve('/(world)/mission-center')}>Mission Center</a>
					{/snippet}
				</StatusCard>
			</div>
		{:else if hud.status === 'lost'}
			<div class="center">
				<StatusCard tone="danger" title="Vessel lost">
					<p>{hud.message}. Revert to the VAB to adjust the design and launch again.</p>
					{#snippet actions()}
						<a class="cta" href={resolve('/(world)/vab')}>Back to the VAB</a>
					{/snippet}
				</StatusCard>
			</div>
		{/if}

		<div
			class="ui"
			class:narrow
			class:dock-meets-deck={dockMeetsDeck}
			class:drawer={layout.mode === 'drawer'}
			style:--tl-bottom="{leftStackBottom}px"
			style:--staging-top={stagingTop > 0 ? `${stagingTop}px` : '100%'}
			style:--deck-h="{deckHeight}px"
			style:--above-deck="{aboveDeckHeight(viewport.height - statusHeight, deckHeight)}px"
			style:--script-w="{scriptPanelWidth(viewport.width)}px"
		>
			<div class="tl">
				{@render dock('left')}
			</div>

			{#if lessonShown || tutorialStep}
				<!-- the guide (plan 344, owner 2026-10-22): the bottom-left corner, beside the dock,
				     above the navball module where they would meet; it points at what it talks about -->
				<div
					class="guide"
					bind:this={guideEl}
					style:left={guideLeft === null ? null : `${guideLeft}px`}
					style:bottom={guideBottom === null ? null : `${guideBottom}px`}
				>
					{#if lessonShown}
						<LessonCard
							lesson={lessonShown}
							step={lessonStep(lessonShown, lessonProgress)}
							progress={lessonProgress}
							keymap={settings.keymap}
							touch={touchOn}
							notice={lessonProblem ?? lessonNotice.reason}
							waiting={lessonReady && !lessonBegun}
							onbegin={beginLesson}
							onleave={leaveLessonToList}
							onskip={() =>
								lesson && settings.setLesson(lesson.id, skipStep(lesson, lessonProgress))}
						/>
					{/if}
					{#if tutorialStep}
						<TutorialCard
							step={tutorialStep}
							label={stepLabel(settings.tutorial, 'flight')}
							touch={touchOn}
							air={airTop}
							onskip={() => settings.setTutorial(skip(settings.tutorial))}
						/>
					{/if}
				</div>
				<GuidePointer
					testid={lessonShown
						? (lessonStep(lessonShown, lessonProgress)?.point ?? null)
						: (tutorialStep?.point ?? null)}
				/>
			{/if}

			<div class="tc" class:on-bars={hud.map}>
				{#if hud.map}
					<!-- the switch, then one row of filters with Regions in it (plan 292, ADR 0267) -->
					<div class="maptools">
						<MapSwitch busy={saves.busy} onmissioncenter={() => void openMissionCenter()} />
						<MapFilterBar regions={{ on: regionsOn, ontoggle: toggleRegions }} />
					</div>
					<RegionsLayer on={regionsOn} hover={regionHover} />{/if}
				{#if hud?.recovery}
					<!-- the funds and Recover sit here, not in the capsule row: that row sets the top-left stack's width, which the touch throttle must clear (plan 132) -->
					<Button variant="primary" onclick={() => (recoverOpen = true)} data-testid="hud-recover"
						>Recover</Button
					>
				{/if}
				<Toasts toasts={model?.toasts ?? []} />
				{#if hud?.recovery}
					<RecoverDialog
						open={recoverOpen}
						quote={hud.recovery}
						onrecover={() => void recover()}
						onclose={() => (recoverOpen = false)}
					/>
				{/if}
				{#if ghostNote}<p class="ghost-note" role="status" data-testid="ghost-note">
						{ghostNote}
					</p>{/if}
				{#if model?.aero}<AeroStrip aero={model.aero} />{/if}
				<PrecompileBadge progress={graphics} />
			</div>

			{#if (inspectView && vesselShown) || settings.ui.perfOverlay}
				<!-- pinned and open inspectors at the top right, above staging (ADR 0253 point 3); the
				     performance overlay (plan 294) heads the column so it never covers an inspector -->
				<div class="ins">
					{#if settings.ui.perfOverlay}<PerfOverlay
							sample={() => flight?.perfSample() ?? null}
						/>{/if}
					{#if inspectView && vesselShown}{#each inspected as id (id)}
							{@const row = inspectView.parts.find((p) => p.entity === id)}
							{#if row}
								<PartInspector
									vessel={vesselShown.id}
									part={row}
									pinned={inspector.pinned.includes(id)}
									oncommand={(c) => void flight?.command(c)}
									onpin={() => (inspector = togglePin(inspector, id))}
									onclose={() => (inspector = closePart(inspector, id))}
									onhighlight={(part) => flight?.highlightPart(part)}
									onfocus={(part) => flight?.focusPart(Number(part))}
									seats={crewSeats(
										vesselShown,
										panelInput?.snapshot.crew,
										vesselContent!.parts,
										id
									)}
								/>
							{/if}
						{/each}{/if}
				</div>
			{/if}
			{#if model && (stagingOpen || model.maneuver || hud.map)}
				<!-- the right column (V3 §2.5, ADR 0267): the maneuver card over staging at the bottom right,
				     growing up; on narrow screens above the deck. Staging's queue scrolls when they meet. -->
				<div class="br" bind:this={stagingEl} style:--br-cap={brCap > 0 ? `${brCap}px` : null}>
					{#if model.maneuver || hud.map}
						<ManeuverPanel
							maneuver={model.maneuver}
							map={hud.map}
							{warpUsable}
							selected={nodeSelected}
							planned={nodePlanned}
							onwarp={(id) => planner?.warpToNode(id)}
							onpoint={() => flight?.setSas('maneuver')}
							onremove={(id) => planner?.remove(id)}
							onselect={(id) => {
								planner?.select(id);
								nodeSelected = id;
							}}
							onedit={(id, change) => planner?.edit(id, change)}
							onshift={(id, by) => planner?.shift(id, by)}
							onalarm={alarmAtNode}
						/>
					{/if}
					{#if stagingOpen}
						<StageStack
							stages={model.stages}
							environment={model.environment}
							throttle={model?.throttle ?? hud.throttle}
							onstage={() => flight?.stage()}
							bodies={model.deltaVBodies}
							view={model.deltaVView}
							onview={(v) => flight?.setDeltaVView(v)}
						/>
					{/if}
				</div>
			{/if}

			<div class="bc" style:--ball-k={ballSize / 180}>
				<div class="navmodule" class:hidden={!navOpen}>
					<InstrumentDeck
						bind:this={deck}
						{model}
						throttle={model?.throttle ?? hud.throttle}
						{ballSize}
						oncyclespeed={() => flight?.cycleSpeedMode()}
						sas={model?.sas}
						controllable={model?.controllable ?? true}
						onsas={(mode) => flight?.setSas(mode)}
						onrcs={() => flight?.toggleRcs()}
						{chips}
						onfix={fixChip}
						flash={flashChip}
					/>
				</div>
				{#if !navOpen}
					<!-- the conditions stay when the navball is hidden (ADR 0253 point 7) -->
					<div class="strip-alone"><StatusStrip {chips} onfix={fixChip} flash={flashChip} /></div>
				{/if}
			</div>

			{#if touchOn && hud.status === 'flying' && !pauseOpen}
				<TouchControls
					anchor={throttleAnchor(viewport, deckHeight, scriptOpen, leftStackBottom, dockRight)}
					throttle={model?.throttle ?? hud.throttle}
					onthrottle={(v) => flight?.setThrottle(v)}
					onattitude={(a) => flight?.setTouchAttitude(a)}
					onstage={() => flight?.stage()}
				/>
			{/if}

			{#if hud.autopilot}<p class="dev num">Dev autopilot: {hud.autopilot}</p>{/if}
		</div>

		{#snippet dock(side: 'left' | 'right')}
			{#if dockShown}
				<Dock
					{side}
					entries={rail}
					open={settings.dock.open}
					ontoggle={(id) => settings.setDock(togglePanel(settings.dock, id))}
					onlibrary={() => (libraryOpen = true)}
					width={dockWidth}
					onresize={(w) => settings.setInterface({ dockWidth: Math.round(w) })}
				>
					{#snippet body(id: string)}
						{#if id === 'host.script'}
							<div class="script">
								<ScriptPanel
									{source}
									script={shown}
									{canRun}
									{imported}
									{sandbox}
									{notice}
									vesselName={designName}
									check={checkSyntax}
									onchange={setSource}
									onrun={() => {
										ranSource = source;
										flight?.runScript(source);
									}}
									onstop={() => flight?.stopScript()}
									onsample={loadSample}
									onimport={importScript}
									onundo={undoImport}
									onconfirmed={() => {
										imported = null;
										backup = null;
									}}
								/>
							</div>
						{:else if !model}
							<!-- the HUD has not started yet -->
						{:else if id === 'host.crew'}
							<CrewPanel
								card={model?.crew ?? null}
								eva={hud?.eva ?? null}
								broadcasts={hud?.broadcasts ?? []}
								onbroadcast={(milestone) =>
									void flight?.command({ type: 'comms-broadcast', milestone })}
								oneva={(m) => flight?.eva(m)}
								onwalk={(h) => flight?.walk(h)}
								onflag={() => flight?.plantFlag()}
								onboard={() => flight?.board()}
								onhelmet={() => flight?.helmet()}
								repair={repair
									? { label: `${partLabel(repair.definition)} (${repair.failure})` }
									: null}
								onrepair={() =>
									repair &&
									hud?.eva &&
									void flight?.command({
										type: 'repair',
										suit: hud.eva.suit as EntityId,
										vessel: repair.vessel,
										part: repair.part
									})}
								sample={takeOffer ? { label: partLabel(takeOffer.definition) } : null}
								ontake={() =>
									takeOffer &&
									hud?.eva &&
									void flight?.command({
										type: 'crew-take',
										suit: hud.eva.suit as EntityId,
										vessel: takeOffer.vessel,
										part: takeOffer.part
									})}
								onchute={() => flight?.chute()}
							/>
						{:else if id in VESSEL_TABS}
							{#if vesselShown && vesselShownView}
								<VesselPanel
									bare
									tab={VESSEL_TABS[id as keyof typeof VESSEL_TABS]}
									vessel={vesselShown.id}
									name={vesselShown.name ?? designName}
									view={vesselShownView}
									comms={vesselComms}
									transmitters={vesselTransmitters}
									oncommand={(c) => void flight?.command(c)}
									onhighlight={(part) => flight?.highlightPart(part)}
									oninspect={inspect}
									highlighted={hoverPart}
									totals={vesselShown.resources ?? []}
									transfers={vesselShown.transfers ?? []}
								/>
							{/if}
						{:else if id === 'host.missions'}
							<MissionsPanel
								view={tracker}
								onstart={(mission) =>
									void flight?.command({
										type: 'objective-start',
										source: { kind: 'mission', id: mission }
									})}
							/>
						{:else if id === 'host.orbit'}
							<OrbitStrip
								orbit={model.orbit}
								phase={model.phase}
								prelaunch={model.prelaunch}
								onwarp={(to) => flight?.warpToApsis(to)}
							/>
						{:else if id === 'host.target'}
							<TargetPanel
								target={model.target}
								choices={model.targets}
								controllable={model.controllable}
								rendezvous={model.rendezvous}
								dossier={model.dossier}
								onselect={(key) => flight?.setTarget(key)}
								onplan={(aid) => flight?.planAid(aid)}
								oncommand={(c) => void flight?.command(c)}
								onswitch={(id) =>
									void flight?.switchVessel(id).then((r) => {
										if (!r.ok) notice = r.reason;
									})}
							/>
						{:else}
							{@const panel = modPanels.find((p) => p.id === id)}
							{#if panel}
								<Panel title={panel.title}>
									<ModPanel {panel} input={panelInput} oncommand={(c) => void flight?.command(c)} />
								</Panel>
							{/if}
						{/if}
					{/snippet}
				</Dock>
			{/if}
		{/snippet}

		<PanelLibrary
			open={libraryOpen}
			panels={allPanels.map((p) => ({
				id: p.id,
				title: p.title,
				icon: p.icon,
				by: p.id.startsWith('host.') ? 'The game' : p.id.slice(0, p.id.indexOf('.'))
			}))}
			chosen={settings.dock.panels}
			onset={(id, on) =>
				settings.setDock(on ? addPanel(settings.dock, id) : removePanel(settings.dock, id))}
			onclose={() => (libraryOpen = false)}
		/>
		<PauseMenu
			open={pauseOpen}
			name={model?.name ?? ''}
			met={model?.met ?? 0}
			onresume={() => (pauseOpen = false)}
			oncontrols={() => (helpOpen = true)}
			onsettings={() => {
				pauseOpen = false;
				settingsFromPause = true;
				settingsOpen = true;
			}}
			onsave={() => {
				pauseOpen = false;
				saves.showSave();
			}}
			onreplay={() => void exportReplay()}
			onghost={() => ghostInput?.click()}
			onrevert={() => void revert()}
			onworldsettings={() => {
				pauseOpen = false;
				worldSession.openWorldSettings();
			}}
			{revertWhy}
			onhideui={() => {
				pauseOpen = false;
				uiHidden = true;
			}}
			onscreenshot={() => {
				pauseOpen = false;
				// a frame later, so the menu's own close is not in the way of the draw
				requestAnimationFrame(() => void screenshot());
			}}
			onload={() => {
				pauseOpen = false;
				void saves.showLoad();
			}}
			ondebug={() => {
				pauseOpen = false;
				debugOpen = true;
			}}
		/>
		<DebugPanel
			open={debugOpen}
			onclose={() => (debugOpen = false)}
			host={debugHost}
			info={() => flight?.debugInfo() ?? null}
			resetFrames={() => flight?.resetFrameStats()}
			world={world.name}
			designs={() => debugDesigns()}
		/>
		<SaveDialog {saves} suggestion={model?.name ?? 'Saved flight'} />
		<LoadDialog {saves} />
		{#if saves.note && !saves.loadOpen && !saves.saveOpen}
			<p class="savenote" class:error={saves.noteIsError} role="status">{saves.note}</p>
		{/if}
		<HelpOverlay open={helpOpen} onclose={() => (helpOpen = false)} />
		<Dialog open={leaveTo !== null} title="Leave this flight?" onclose={() => (leaveTo = null)}>
			<p class="leave" data-testid="leave-flight">
				The vessel is still flying. It keeps flying in the world, with its SAS and scripts, while
				you are away.
			</p>
			<label class="leave"
				><input type="checkbox" bind:checked={dontAsk} data-testid="leave-dont-ask" /> Don't ask again</label
			>
			<div class="leave-actions">
				<Button onclick={() => (leaveTo = null)} data-testid="leave-stay">Stay here</Button>
				<Button variant="primary" onclick={leaveAnyway} data-testid="leave-anyway"
					>Leave anyway</Button
				>
			</div>
		</Dialog>
		<SettingsDialog
			open={settingsOpen}
			onclose={() => {
				settingsOpen = false;
				if (settingsFromPause) pauseOpen = true;
				settingsFromPause = false;
			}}
		/>
	{/if}
</div>

<style>
	.occupied-why {
		margin: 0 0 1rem;
		color: var(--text-body);
	}
	.occupied-acts {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.leave {
		display: block;
		margin: 0 0 var(--s-3);
		max-width: 40ch;
		color: var(--text-muted);
	}
	.leave-actions {
		display: flex;
		gap: var(--s-2);
		justify-content: flex-end;
	}
	.stage {
		position: fixed;
		inset: 0;
		overflow: hidden;
	}
	/* F2 (plan 226): the canvas alone */
	.stage.bare > :not(.view) {
		display: none;
	}
	.view {
		width: 100%;
		height: 100%;
		touch-action: none;
	}
	/*
	 * A drag on the map (the camera, a node handle) must not select page text: a selection that starts
	 * on the canvas or on a map label runs over the labels and the top bar (plan 293).
	 */
	.view,
	.stage > :global(.layer) {
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
	}
	.ui {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.ui > * {
		position: absolute;
	}
	.ui :global(button),
	.ui :global(a),
	.ui :global(textarea),
	.ui :global(.panel),
	.ui :global(.deck),
	.ui :global(.warp),
	.ui :global(.world),
	.ui :global(nav) {
		pointer-events: auto;
	}
	/* the v2 Flight page on the Base layout (plan 233, BASE_LAYOUT §1 and §5): the content's safe area
	   is top 80 (under the time and menu bars), sides 24 and bottom 56 (over the 32 px status bar) */
	.ui {
		--safe-bottom: calc(env(safe-area-inset-bottom, 0px) + 2rem);
	}
	/* the dock (V3 §2.3): top 80, left 24; it reaches down to the safe area (bottom 56), or stops
	   above the navball module where they would meet (narrow screens, a wide dock) */
	.tl {
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top));
		left: calc(var(--margin-hud) + var(--safe-left));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-2);
		max-height: calc(
			100% - var(--margin-hud) * 2 - var(--capsule) - var(--panel-gap) - var(--safe-top) -
				var(--safe-bottom)
		);
	}
	/* the guide (plan 344): bottom left over the status bar, beside the dock (its left and, near the
	   navball module, its bottom are measured) */
	.guide {
		left: calc(var(--margin-hud) + var(--safe-left));
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-2);
		z-index: 2;
	}
	.ui.narrow .tl,
	.ui.dock-meets-deck .tl {
		/* The script panel and the guide scroll above the instrument deck, never under it (plan 055). */
		max-height: calc(var(--above-deck) - var(--capsule) - var(--panel-gap));
	}
	/* staging (V3 §2.5): right 24, bottom 56, 260 wide; it grows up to the top of the safe area and
	   its queue scrolls inside. On narrow screens it stands above the navball module (ADR 0253 point 5).
	   The maneuver card stands on it, and the column stops under the map toolbar (ADR 0267). */
	.br {
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		right: calc(var(--margin-hud) + var(--safe-right));
		width: 16.25rem;
		display: flex;
		flex-direction: column;
		gap: var(--panel-gap);
		max-height: calc(
			100% - var(--margin-hud) * 2 - var(--capsule) - var(--panel-gap) - var(--safe-top) -
				var(--safe-bottom) - var(--br-cap, 0px)
		);
	}
	.ui.narrow .br {
		bottom: calc(var(--deck-h) + var(--margin-hud) * 2 + var(--safe-bottom));
		max-height: calc(var(--above-deck) - var(--capsule) - var(--panel-gap) - var(--br-cap, 0px));
	}
	.br > :global(.panel) {
		min-height: 0;
	}
	.script {
		width: var(--script-w, min(420px, 46vw));
		overflow: auto;
	}
	.savenote {
		position: absolute;
		z-index: 5;
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap));
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: var(--s-2) var(--s-4);
		font-size: var(--t-sm);
		background: var(--panel-solid);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-panel);
		pointer-events: none;
	}
	.savenote.error {
		border-color: var(--c-danger);
	}
	.tc {
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-3);
		pointer-events: none;
	}
	.maptools {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-3);
	}
	/* the map's Map | Mission Center tabs stand on the bars' row, centred between them (plan 256);
	   where the bars leave no room (under 1280 px) they stay on the row below */
	@media (min-width: 1280px) {
		.tc.on-bars {
			top: calc(var(--margin-hud) + var(--safe-top));
		}
	}
	/* the part inspectors at the top right, above staging (ADR 0253 point 3) */
	.ins {
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top));
		right: calc(var(--margin-hud) + var(--safe-right));
		display: flex;
		flex-direction: column;
		gap: var(--panel-gap);
		max-height: min(
			calc(var(--above-deck) - var(--capsule) - var(--panel-gap)),
			calc(
				var(--staging-top) - var(--margin-hud) - var(--capsule) - var(--panel-gap) * 2 -
					var(--safe-top)
			)
		);
		overflow-y: auto;
	}
	/* drawers at 1024 px and below: 44 px targets in the side panels (ADR 0205 point 6) */
	.ui.drawer :global(.panel button),
	.ui.drawer :global([role='tab']) {
		min-height: var(--touch-min);
	}
	/* the ball, not the module, is centred (V3 §2.4): its centre is 280 design px from the module's left */
	.bc {
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		left: calc(50% - 17.5rem * var(--ball-k, 1));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--panel-gap);
	}
	.strip-alone {
		position: relative;
		width: calc(34.5rem * var(--ball-k, 1));
	}
	.navmodule.hidden {
		display: none;
	}
	.center {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		pointer-events: none;
	}
	/* No canvas worth showing behind a failure card: the loading screen's backdrop instead of black. */
	.center.cover {
		background: radial-gradient(
			ellipse at 50% 42%,
			color-mix(in srgb, var(--accent) 14%, var(--bg-void)) 0%,
			var(--bg-void) 70%
		);
	}
	.center :global(.card) {
		pointer-events: auto;
	}
	.center p {
		margin: 0;
	}
	.cta {
		display: inline-flex;
		align-items: center;
		min-height: 32px;
		padding: 0 var(--s-4);
		font-size: var(--t-sm);
		font-weight: 600;
		color: var(--c-ink);
		text-decoration: none;
		background: var(--c-accent);
		border-radius: var(--r-control);
	}
	.cta.quiet {
		color: var(--text);
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		font-weight: 500;
	}
	.dev {
		bottom: calc(var(--s-3) + var(--safe-bottom));
		right: calc(var(--s-3) + var(--safe-right));
		margin: 0;
		padding: var(--s-1) var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-dim);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
	.ghost-note {
		margin: 0;
		padding: 3px var(--s-4);
		background: var(--panel);
		border-radius: 999px;
		font-size: var(--t-sm);
		color: var(--c-warning);
	}
	.vessel-hover {
		position: fixed;
		z-index: 6;
		padding: 0.25rem 0.5rem;
		font-family: var(--font-num);
		font-size: var(--t-xs);
		color: var(--text-primary);
		white-space: nowrap;
		pointer-events: none;
		background: var(--surface-glass);
		border: 1px solid var(--border-subtle);
		border-radius: 6px;
	}
</style>
