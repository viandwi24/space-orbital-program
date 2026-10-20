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
	import { categoriesOf } from '../../../lib/editor/categories';
	import { loadPlugins } from '@orbital/core';
	import Stock from '@orbital/mod-stock';
	import { activePlugins } from '../../../lib/mods/runtime';
	import { scenarioStart, type ScenarioStart } from '../../../lib/missions/scenario-start';
	import {
		sortPanels,
		type EntityId,
		type MissionDefinition,
		type PanelDefinition,
		type PanelInput
	} from '@orbital/core';
	import MissionsPanel from '../../../lib/missions/MissionsPanel.svelte';
	import { trackerView } from '../../../lib/missions/tracker';
	import Dock from '../../../lib/dock/Dock.svelte';
	import ModPanel from '../../../lib/dock/ModPanel.svelte';
	import PanelLibrary from '../../../lib/dock/PanelLibrary.svelte';
	import { addPanel, railOf, removePanel, togglePanel } from '../../../lib/dock/dock-model';
	import Panel from '../../../lib/ui/Panel.svelte';
	import { takeLaunchChoice } from '../../../lib/launch/launch-model';
	import { loadEphemeris, needsEphemeris } from '../../../lib/ephemeris-asset';
	import type { WorldInfo } from '@orbital/core';
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
	import RegionsLayer from '../../../lib/hud/RegionsLayer.svelte';
	import { loadWorldCatalog } from '../../../lib/worlds/catalog';
	import { WARP_STEPS, warpStepsFor } from '../../../lib/warp';
	import BlackoutBadge from '../../../lib/hud/BlackoutBadge.svelte';
	import RangeBadge from '../../../lib/hud/RangeBadge.svelte';
	import UncontrolledBadge from '../../../lib/hud/UncontrolledBadge.svelte';
	import AeroStrip from '../../../lib/hud/AeroStrip.svelte';
	import LinkBadge from '../../../lib/hud/LinkBadge.svelte';
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
	import MapCardView from '../../../lib/hud/MapCardView.svelte';
	import { mapCardFor, type MapCard } from '../../../lib/hud/map-card';
	import { panelRoom } from '../../../lib/hud/panel-room';
	import DebugPanel from '../../../lib/debug/DebugPanel.svelte';
	import { createDebugApi, flightDebug, type DebugHost } from '../../../lib/debug/api';
	import LessonCard from '../../../lib/hud/LessonCard.svelte';
	import {
		advanceLesson,
		lessonOf,
		lessonStep,
		NEW_LESSON,
		observeLesson,
		runLessonSetup,
		type LessonObservation
	} from '../../../lib/onboarding/lessons';
	import { activeLesson, markLessonReady } from '../../../lib/onboarding/lesson-world';
	import { lessonKeymap, lessonNotice } from '../../../lib/onboarding/lesson-gate.svelte';
	import { listEntries, withFallback } from '../../../lib/vab/library';
	import { indexedDbStore } from '../../../lib/vab/library-idb';
	import ResourcesPanel from '../../../lib/hud/ResourcesPanel.svelte';
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
	import { REGIONS, clampSpan, layoutFor, type SidePanel } from '../../../lib/layout/regions';
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

	let canvas: HTMLCanvasElement;
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
	// the vessel panel (plan 111, ADR 0153)
	let vesselOpen = $state(false);
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
	/** The vessel panel's width, px at 100 % (plan 214), dragged at its left edge. */
	const panelWidth = $derived(
		clampSpan(REGIONS.vessel, settings.ui.panelWidth ?? REGIONS.vessel.default)
	);
	/** The card of a map vessel just clicked (plan 250). */
	let mapCard = $state<MapCard | null>(null);
	/** The dock panel's width, px at 100 % (plan 250), dragged at its free edge. */
	const dockWidth = $derived(
		clampSpan(REGIONS.dock, settings.ui.dockWidth ?? REGIONS.dock.default)
	);
	function startResize(e: PointerEvent): void {
		const grip = e.currentTarget as HTMLElement;
		grip.setPointerCapture(e.pointerId);
		const startX = e.clientX;
		const start = panelWidth;
		const scale = settings.ui.scale;
		const move = (m: PointerEvent): void => {
			const width = clampSpan(REGIONS.vessel, start + (startX - m.clientX) / scale);
			settings.setInterface({ panelWidth: Math.round(width) });
		};
		const up = (): void => {
			grip.removeEventListener('pointermove', move);
			grip.removeEventListener('pointerup', up);
			queueMicrotask(updateInsets);
		};
		grip.addEventListener('pointermove', move);
		grip.addEventListener('pointerup', up);
	}
	// the mission tracker (plan 100, ADR 0151 point 3)
	let missionDefs = $state.raw<MissionDefinition[]>([]);
	let objectiveNames = $state.raw<Record<string, string>>({});
	const tracker = $derived(
		trackerView(missionDefs, panelInput?.snapshot.objectives, (id) => objectiveNames[id] ?? id)
	);
	const HOST: { id: string; title: string; icon: string; order: number }[] = [
		{ id: 'host.orbit', title: 'Orbit', icon: 'orbit', order: 100 },
		{ id: 'host.resources', title: 'Resources', icon: 'tank', order: 200 },
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
	}
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
	const lesson = lessonRun ? (lessonOf(lessonRun.lesson) ?? null) : null;
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
	const ballSize = $derived(tall ? 176 : 144);
	// The toolbar's Staging and Nav buttons (plan 088, ADR 0144 point 5).
	let navOpen = $state(true);
	/** The crew panel at the bottom right (BASE_LAYOUT §3: a panel toggle). */
	let crewOpen = $state(true);
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
		const r = canvas.getBoundingClientRect();
		const part = flight?.partAt(e.clientX - r.left, e.clientY - r.top) ?? null;
		if (part !== null) inspect(part);
	}
	function onCanvasMove(e: PointerEvent): void {
		// the part under the pointer lights its row and itself, 20 times a second at most
		if (!hud?.map && e.buttons === 0 && (vesselOpen || inspected.length > 0)) {
			const now = performance.now();
			if (now - hoverAt > 50) {
				hoverAt = now;
				const r = canvas.getBoundingClientRect();
				const part = flight?.partAt(e.clientX - r.left, e.clientY - r.top) ?? null;
				if (part !== hoverPart) {
					hoverPart = part;
					flight?.highlightPart(part);
				}
			}
		}
		if (!regionsOn || !hud?.map || e.buttons !== 0) {
			regionHover = null;
			return;
		}
		const r = canvas.getBoundingClientRect();
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
		const { registries } = loadPlugins([Stock, ...activePlugins()]);
		const scenario = registries.scenarios.get(record.scenario);
		return scenario ? scenarioStart(scenario, registries.bodies) : null;
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
		const { catalog, content, panels, missions, objectiveLabels, actionGroups, categories } =
			loadContent();
		vesselContent = {
			parts: content.parts,
			modules: content.modules,
			groups: actionGroups
		};
		vesselCategories = categoriesOf(categories);
		modPanels = panels;
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
			} else if (!launch && lesson) {
				// a lesson flies its own vessel; the setup puts it where the lesson starts (plan 229)
				design = lesson.design();
			} else {
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
		const info =
			resume?.sim.worldInfo ??
			worldSession.base?.sim.worldInfo ??
			(await saves.worldStartInfo(activeWorldId()));
		const own = info ? loadContent({ id: info.systemId, variant: info.variant }) : undefined;
		if (gone() || !ready) return undefined;
		return begin(
			own?.catalog ?? catalog,
			own?.content ?? content,
			design,
			resume,
			client,
			attach,
			launch?.placement,
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
		const offSandbox = scriptSandbox.onStatus((s) => (sandbox = s));
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
			canvas,
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
				if (JSON.stringify(net) !== JSON.stringify(mapNetwork)) mapNetwork = net;
				const g = f.ghost ?? null;
				if (JSON.stringify(g) !== JSON.stringify(ghostFrame)) ghostFrame = g;
				targetMarks?.place(f.target ?? null);
				heatBars?.place(f.heat ?? null);
				nodeLayer?.place(f.maneuver ?? null);
			},
			// the player's profile and keys (plan 216; before it the flight read the defaults only)
			keymap: () =>
				lesson
					? lessonKeymap(settings.keymap, lesson, (reason) => lessonNotice.show(reason))
					: settings.keymap,
			cameraMode: loadCameraMode(),
			onLaunchPoint: (sim) => {
				worldSession.revertPoint = { worldId: activeWorldId(), sim };
				launchedHere = true;
			},
			onCameraMode: saveCameraMode,
			onMapPick: (key, at) => (mapCard = mapCardFor(key, model?.targets ?? [], at)),
			onKey: (key) => {
				if (key === 'escape' && uiHidden) uiHidden = false;
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
	const t = $derived(hud?.telemetry ?? null);
	const running = $derived(scriptIsActive(script.status));
	/** The world's warp levels (plan 206). */
	let warpSteps = $state<readonly number[]>(WARP_STEPS);
	const warpUsable = $derived(canWarp(t, hud?.warp ?? 1, running));

	// The Base layout's bars (plan 233, BASE_LAYOUT §3 and the v2 Flight page): this page's actions
	// in the menu bar, its warp and mission time in the time bar, the vessel in the status bar.
	function toggleDock(): void {
		dockShown = !dockShown;
		if (dockShown) {
			lastSide = 'dock';
			// one side panel at a time below 1280 px: the dock closes the vessel panel
			if (narrow) vesselOpen = false;
		}
	}
	function toggleVessel(): void {
		vesselOpen = !vesselOpen;
		if (!vesselOpen) flight?.highlightPart(null);
		else {
			lastSide = 'vessel';
			panelInput = flight?.panelInput() ?? null;
		}
	}
	const flightActions = $derived<PageAction[]>([
		{
			id: 'panels',
			label: 'Panel dock',
			title: 'Panels',
			icon: 'panels',
			on: dockShown,
			onclick: toggleDock
		},
		{
			id: 'vessel',
			label: 'Vessel panel',
			title: 'Vessel info',
			icon: 'vesselInfo',
			on: vesselOpen,
			onclick: toggleVessel
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
			id: 'crew',
			label: 'Crew panel',
			title: touchOn ? 'Crew: hidden while the touch controls are on' : 'Crew',
			icon: 'crew',
			on: crewOpen && !touchOn,
			disabled: touchOn,
			onclick: () => (crewOpen = !crewOpen)
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
	let viewport = $state({ width: 1440, height: 900 });
	/** The status bar's height from the bottom of the window (plan 233): 32 px at 100 %. */
	let statusHeight = $state(32);
	/** The side panel opened last: with room for one, it is the one that stays (plan 215). */
	let lastSide = $state<SidePanel>('vessel');
	/**
	 * The region rules (plan 215, ADR 0205 point 6): widths over the UI scale decide; below 1280 one
	 * side panel, where the dock stands at the right (plan 112); at 1024 and below, drawers.
	 */
	const layout = $derived(
		layoutFor(viewport.width, settings.ui.scale, { dock: dockShown, vessel: vesselOpen }, lastSide)
	);
	const narrow = $derived(layout.mode !== 'two');
	/** The staging stack's box when it stands in the left column (narrow), for the touch throttle. */
	let stagingBox = $state<{ top: number; right: number } | undefined>(undefined);
	/** Top of the crew panel at the bottom right, 0 when hidden: the side column stops above it (plan 214). */
	let crewTop = $state(0);
	let crewEl = $state<HTMLDivElement>();
	$effect(() => {
		// the crew panel grows with its broadcast offers after the first measure: measure again then
		const el = crewEl;
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
		const right = box('.tr');
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
		const crew = box('.ui > .br');
		crewTop = crew && crew.height > 0 ? Math.round(crew.top) : 0;
		const staging = box('.bl');
		stagingBox =
			narrow && staging && staging.height > 0
				? { top: Math.round(staging.top), right: Math.round(staging.right) }
				: undefined;
		// Side panels float over the view and do not move the camera (plan 215, ADR 0205 point 7):
		// only the fixed bars count, unless the player asked to centre the vessel in the free area.
		const insets = viewInsets({
			frame,
			bar,
			deck,
			right,
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
		void hud?.status;
		void settings.ui.centreVessel;
		void settings.ui.scale;
		void vesselOpen;
		void navOpen;
		void model?.crew?.rows.length;
		queueMicrotask(updateInsets);
	});

	/** The first-flight guide: what the player has done so far, as the step machine's input. */
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
				periapsis: model.orbit && !model.orbit.escape ? model.orbit.periapsis : null
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
		if (!lesson || !debugHost) return;
		lessonSetting = true;
		// the clock is held while the scene is set and until Begin, so nothing moves before the player reads
		worldSession.hold('lesson', true);
		const result = await runLessonSetup(lesson, createDebugApi(debugHost));
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
		const v = flight?.panelInput()?.vessel;
		if (!v) return null;
		return observeLesson({
			vessel: v,
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

<svelte:window onresize={updateInsets} />

<div class="stage" class:bare={uiHidden} bind:this={stageEl}>
	<canvas
		bind:this={canvas}
		onpointermove={onCanvasMove}
		onpointerdown={onCanvasDown}
		onpointerup={onCanvasUp}
		onpointerleave={() => {
			regionHover = null;
			if (hoverPart !== null) {
				hoverPart = null;
				flight?.highlightPart(null);
			}
		}}
	></canvas>
	{#if mapCard && hud?.map}
		<MapCardView
			card={mapCard}
			onclose={() => (mapCard = null)}
			onswitch={(id) => {
				mapCard = null;
				void flight?.switchVessel(id).then((r) => {
					if (!r.ok) notice = r.reason;
				});
			}}
		/>
	{/if}
	{#if mapNetwork}<NetworkLayer network={mapNetwork} />{/if}
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
			class:drawer={layout.mode === 'drawer'}
			style:--tl-bottom="{leftStackBottom}px"
			style:--crew-top={crewTop > 0 ? `${crewTop}px` : '100%'}
			style:--deck-h="{deckHeight}px"
			style:--above-deck="{aboveDeckHeight(viewport.height - statusHeight, deckHeight)}px"
			style:--script-w="{scriptPanelWidth(viewport.width)}px"
		>
			<div class="tl">
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
					/>
				{/if}
				{#if tutorialStep}
					<TutorialCard
						step={tutorialStep}
						label={stepLabel(settings.tutorial, 'flight')}
						touch={touchOn}
						onskip={() => settings.setTutorial(skip(settings.tutorial))}
					/>
				{/if}
				{#if !narrow}{@render dock('left')}{/if}
			</div>

			<div class="tc" class:on-bars={hud.map}>
				{#if hud.map}<MapSwitch
						busy={saves.busy}
						onmissioncenter={() => void openMissionCenter()}
					/>
					<RegionsLayer on={regionsOn} ontoggle={toggleRegions} hover={regionHover} />{/if}
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
				{#if model?.link}<LinkBadge link={model.link} />{:else}<BlackoutBadge
						level={model?.blackout ?? 0}
					/>{/if}
				{#if ghostNote}<p class="ghost-note" role="status" data-testid="ghost-note">
						{ghostNote}
					</p>{/if}
				<RangeBadge warning={model?.range ?? null} />
				<UncontrolledBadge reason={model?.uncontrolled ?? null} />
				{#if model?.aero}<AeroStrip aero={model.aero} />{/if}
				<PrecompileBadge progress={graphics} />
			</div>

			{#if vesselOpen && vesselShown}
				<!-- the vessel panel (plan 111, ADR 0153 point 4): top right; below 1280 px in place of the dock -->
				<div class="tr vr" style:width="{panelWidth / 16}rem">
					<!-- drag to resize, 300 to 440 px (plan 214, ADR 0205 point 1) -->
					<div
						class="grip"
						role="separator"
						aria-orientation="vertical"
						aria-label="Resize the vessel panel"
						data-testid="vessel-panel-grip"
						onpointerdown={startResize}
					></div>
					<VesselPanel
						vessel={vesselShown.id}
						name={vesselShown.name ?? designName}
						view={vesselShownView!}
						comms={vesselComms}
						transmitters={vesselTransmitters}
						oncommand={(c) => void flight?.command(c)}
						onhighlight={(part) => flight?.highlightPart(part)}
						oninspect={inspect}
						highlighted={hoverPart}
						totals={vesselShown.resources ?? []}
						transfers={vesselShown.transfers ?? []}
					/>
				</div>
			{:else if narrow}
				<div class="tr">{@render dock('right')}</div>
			{/if}
			{#if inspectView && vesselShown}
				<!-- pinned and open inspectors, left of the vessel panel, never over the vessel (plan 214) -->
				<div class="ins" style:--panel-room={panelRoom(vesselOpen, panelWidth)}>
					{#each inspected as id (id)}
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
								seats={crewSeats(vesselShown, panelInput?.snapshot.crew, vesselContent!.parts, id)}
							/>
						{/if}
					{/each}
				</div>
			{/if}
			{#if model}
				<!-- on narrow screens staging stands in the left column: it steps back while the script panel is open -->
				<div class="bl" class:stowed={scriptOpen && viewport.width <= 1279}>
					<StageStack
						stages={model.stages}
						environment={model.environment}
						throttle={model?.throttle ?? hud.throttle}
						onstage={() => flight?.stage()}
						bodies={model.deltaVBodies}
						view={model.deltaVView}
						onview={(v) => flight?.setDeltaVView(v)}
					/>
				</div>
			{/if}

			<div class="bc" style:--ball-k={ballSize / 176}>
				{#if model && (model.maneuver || hud.map)}
					<div class="mnv">
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
					</div>
				{/if}
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
					/>
				</div>
			</div>

			{#if !touchOn && crewOpen}
				<div class="br" bind:this={crewEl}>
					<CrewPanel
						card={model?.crew ?? null}
						eva={hud.eva}
						broadcasts={hud.broadcasts}
						onbroadcast={(milestone) =>
							void flight?.command({ type: 'comms-broadcast', milestone })}
						oneva={(m) => flight?.eva(m)}
						onwalk={(h) => flight?.walk(h)}
						onflag={() => flight?.plantFlag()}
						onboard={() => flight?.board()}
						onhelmet={() => flight?.helmet()}
						onchute={() => flight?.chute()}
					/>
				</div>
			{/if}

			{#if touchOn && hud.status === 'flying' && !pauseOpen}
				<TouchControls
					anchor={throttleAnchor(
						viewport,
						deckHeight,
						scriptOpen && !narrow,
						leftStackBottom,
						dockRight,
						stagingBox
					)}
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
						{:else if id === 'host.resources'}
							<ResourcesPanel resources={model.resources} />
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
			onpreset={(choice) => flight?.setGraphicsPreset(choice)}
			onautoquality={(on) => flight?.setAutoQuality(on)}
		/>
	{/if}
</div>

<style>
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
	.stage.bare > :not(canvas) {
		display: none;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
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
	.tl {
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top));
		left: calc(var(--margin-hud) + var(--safe-left));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-2);
		/* The script panel and the guide scroll above the instrument deck, never under it (plan 055). */
		max-height: calc(var(--above-deck) - var(--capsule) - var(--panel-gap));
	}
	.br {
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		right: calc(var(--margin-hud) + var(--safe-right));
		width: 13.75rem;
		/* half the box at most, so the side column above keeps room (plan 214) */
		max-height: min(var(--above-deck), calc(50% - var(--margin-hud)));
		overflow-y: auto;
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
	/* the map's Map | Mission Center tabs stand on the bars' row, centred between them (plan 256);
	   where the bars leave no room (under 1280 px) they stay on the row below */
	@media (min-width: 1280px) {
		.tc.on-bars {
			top: calc(var(--margin-hud) + var(--safe-top));
		}
	}
	/* the vessel panel's default width (340 px at 100 %, ADR 0205 point 1; plan 214 adds the resize) */
	/* the vessel panel ends above the crew panel at the bottom right (plan 214: a tall panel ran under it) */
	/* `.tr.vr`: more specific than `.tr` below, whose max-height would win */
	.tr.vr {
		width: 21.25rem;
		/* a block, not the flex of .tr: the panel inside must not shrink and spill, the box scrolls */
		display: block;
		overflow-y: auto;
		max-height: min(
			calc(var(--above-deck) - var(--capsule) - var(--panel-gap)),
			calc(
				var(--crew-top) - var(--margin-hud) - var(--capsule) - var(--panel-gap) * 2 -
					var(--safe-top)
			)
		);
	}
	.grip {
		position: absolute;
		left: -0.375rem;
		top: 0;
		bottom: 0;
		width: 0.75rem;
		cursor: ew-resize;
		pointer-events: auto;
		z-index: 1;
	}
	.ins {
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top));
		right: calc(var(--margin-hud) * 2 + var(--panel-room, 0rem) + var(--safe-right));
		display: flex;
		flex-direction: column;
		gap: var(--panel-gap);
		max-height: calc(var(--above-deck) - var(--capsule) - var(--panel-gap));
		overflow-y: auto;
	}
	.tr {
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top));
		right: calc(var(--margin-hud) + var(--safe-right));
		display: flex;
		/* it starts under the toolbar, so it has the toolbar's height less than the space above the deck */
		max-height: calc(var(--above-deck) - var(--capsule) - var(--panel-gap));
	}
	/* staging: a capped height under the left stack, scrolling inside (plan 215, ADR 0205 point 5) */
	.bl {
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		left: calc(var(--margin-hud) + var(--safe-left));
		width: 13.75rem;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		max-height: calc(100% - var(--tl-bottom, 0px) - var(--margin-hud) * 2 - var(--safe-bottom));
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.ui.narrow .bl {
		bottom: calc(var(--deck-h) + var(--margin-hud) * 2 + var(--safe-bottom));
		max-height: calc(
			100% - var(--deck-h) - var(--tl-bottom, 0px) - var(--margin-hud) * 3 - var(--safe-bottom)
		);
	}
	/* drawers at 1024 px and below: 44 px targets in the side panels (ADR 0205 point 6) */
	.ui.drawer :global(.panel button),
	.ui.drawer :global([role='tab']) {
		min-height: var(--touch-min);
	}
	/* the ball, not the module, is centred (refs): its centre is 154 mock px from the module's left */
	.bc {
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		left: calc(50% - 9.625rem * var(--ball-k, 1));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--panel-gap);
	}
	.mnv {
		width: 22.5rem;
		max-height: var(--above-deck);
		overflow-y: auto;
		margin-left: calc(9.625rem * var(--ball-k, 1) - 11.25rem);
	}
	.bl.stowed {
		visibility: hidden;
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
</style>
