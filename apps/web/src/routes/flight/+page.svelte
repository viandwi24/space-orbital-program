<script lang="ts">
	import { readReplay } from '@orbital/core';
	import GhostLayer from '../../lib/replays/GhostLayer.svelte';
	import { ghostTrack, type ScreenGhost } from '../../lib/replays/ghost-model';
	import { downloadText, fileNameOf } from '../../lib/download';
	import VesselPanel from '../../lib/vessel-panel/VesselPanel.svelte';
	import { transmitters, vesselView, type PanelContent } from '../../lib/vessel-panel/vessel-model';
	import { commsTab, type ScreenNetwork } from '../../lib/comms/network-model';
	import NetworkLayer from '../../lib/comms/NetworkLayer.svelte';
	import { categoriesOf } from '../../lib/editor/categories';
	import { loadPlugins } from '@orbital/core';
	import Stock from '@orbital/mod-stock';
	import { activePlugins } from '../../lib/mods/runtime';
	import { scenarioStart, type ScenarioStart } from '../../lib/missions/scenario-start';
	import {
		sortPanels,
		type MissionDefinition,
		type PanelDefinition,
		type PanelInput
	} from '@orbital/core';
	import MissionsPanel from '../../lib/missions/MissionsPanel.svelte';
	import { trackerView } from '../../lib/missions/tracker';
	import Dock from '../../lib/dock/Dock.svelte';
	import ModPanel from '../../lib/dock/ModPanel.svelte';
	import PanelLibrary from '../../lib/dock/PanelLibrary.svelte';
	import { addPanel, railOf, removePanel, togglePanel } from '../../lib/dock/dock-model';
	import Panel from '../../lib/ui/Panel.svelte';
	import { takeLaunchChoice } from '../../lib/launch/launch-model';
	import { loadEphemeris, needsEphemeris } from '../../lib/ephemeris-asset';
	import type { WorldInfo } from '@orbital/core';
	import { activeWorldId, setActiveWorld } from '../../lib/worlds/worlds';
	import { profileStore } from '../../lib/achievements/store';
	import type { CatchUp } from '../../lib/worlds/world-model';
	import { GAME_NAME } from '../../lib/public/about';
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import { onMount } from 'svelte';
	import { ascentScript } from '@orbital/scripting/samples/ascent';
	import AppBar from '../../lib/hud/AppBar.svelte';
	import CrewPanel from '../../lib/hud/CrewPanel.svelte';
	import WorldCapsule from '../../lib/hud/WorldCapsule.svelte';
	import MapSwitch from '../../lib/hud/MapSwitch.svelte';
	import { loadWorldCatalog } from '../../lib/worlds/catalog';
	import BlackoutBadge from '../../lib/hud/BlackoutBadge.svelte';
	import RangeBadge from '../../lib/hud/RangeBadge.svelte';
	import AeroStrip from '../../lib/hud/AeroStrip.svelte';
	import LinkBadge from '../../lib/hud/LinkBadge.svelte';
	import HelpOverlay from '../../lib/hud/HelpOverlay.svelte';
	import InstrumentDeck from '../../lib/hud/InstrumentDeck.svelte';
	import ManeuverLayer from '../../lib/hud/ManeuverLayer.svelte';
	import ManeuverPanel from '../../lib/hud/ManeuverPanel.svelte';
	import TargetMarkers from '../../lib/hud/TargetMarkers.svelte';
	import TargetPanel from '../../lib/hud/TargetPanel.svelte';
	import MapMarkers from '../../lib/hud/MapMarkers.svelte';
	import OrbitStrip from '../../lib/hud/OrbitStrip.svelte';
	import PauseMenu from '../../lib/hud/PauseMenu.svelte';
	import ResourcesPanel from '../../lib/hud/ResourcesPanel.svelte';
	import ScriptPanel from '../../lib/hud/ScriptPanel.svelte';
	import SituationBar from '../../lib/hud/SituationBar.svelte';
	import StageStack from '../../lib/hud/StageStack.svelte';
	import StatusCard from '../../lib/hud/StatusCard.svelte';
	import WarpControl from '../../lib/hud/WarpControl.svelte';
	import TouchControls from '../../lib/hud/TouchControls.svelte';
	import TutorialCard from '../../lib/hud/TutorialCard.svelte';
	import {
		aboveDeckHeight,
		DECK_FALLBACK,
		scriptPanelWidth,
		throttleAnchor
	} from '../../lib/layout/layout-model';
	import { touchControlsOn } from '../../lib/touch/touch-model';
	import Button from '../../lib/ui/Button.svelte';
	import LoadingScreen from '../../lib/ui/LoadingScreen.svelte';
	import SettingsDialog from '../../lib/ui/SettingsDialog.svelte';
	import { settings } from '../../lib/settings/settings.svelte';
	import {
		advance,
		currentStep,
		skip,
		stepLabel,
		type Observation
	} from '../../lib/onboarding/tutorial';
	import Toasts from '../../lib/ui/Toasts.svelte';
	import PrecompileBadge from '../../lib/ui/PrecompileBadge.svelte';
	import type { PrecompileProgress } from '@orbital/renderer/precompile-progress';
	import { loadContent, partLookup } from '../../lib/catalog';
	import type { SimSave, VesselDesign, VesselPlacement } from '@orbital/core';
	import { parseDesign } from '../../lib/design';
	import { startFlight, type Flight, type FlightHud } from '../../lib/flight-loop';
	import type { FrameData } from '../../lib/hud-controller';
	import { idleScript, scriptIsActive, type ScriptView } from '../../lib/script-state';
	import type { SandboxStatus } from '../../lib/script-sandbox';
	import { startScriptSandbox } from '../../lib/script-sandbox-web';
	import { createScriptChecker, type ScriptChecker } from '../../lib/script-checker';
	import { decodeScript, tokenFromHash, type ImportInfo } from '../../lib/script-share';
	import { loadDraft, loadScript, saveScript } from '../../lib/storage';
	import { canWarp } from '../../lib/telemetry';
	import { createAutosaver } from '../../lib/save/autosave';
	import type { GameSave } from '../../lib/save/game-save';
	import LoadDialog from '../../lib/save/LoadDialog.svelte';
	import { bootedMods, modHint } from '../../lib/save/mods';
	import SaveDialog from '../../lib/save/SaveDialog.svelte';
	import { SaveController } from '../../lib/save/save-controller.svelte';

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
	const vesselShown = $derived(panelInput?.vessel ?? null);
	const vesselShownView = $derived(
		vesselShown && vesselContent ? vesselView(vesselShown, vesselContent, vesselCategories) : null
	);
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
	let nodeLayer = $state<ManeuverLayer>();
	/** The map view's maneuver planner, available once the sim has started (plan 045). */
	let planner = $state.raw<Flight['maneuver']>(null);
	let tall = $state(true);
	const ballSize = $derived(tall ? 176 : 144);
	// The toolbar's Staging and Nav buttons (plan 088, ADR 0144 point 5).
	let stagingOpen = $state(true);
	let navOpen = $state(true);
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
		startLoad: (id) => location.assign(`/flight?load=${encodeURIComponent(id)}`),
		// the Load dialog and F9 stay in the world being flown (plan 087)
		world: activeWorldId
	});
	/** "Catch up to now" (plan 087): refreshed with the autosave timer. */
	let catchUp = $state<CatchUp>({ kind: 'none' });
	const autosaver = createAutosaver(() => performance.now());
	const saveState = () => ({
		flying: hud?.status === 'flying',
		paused: pauseOpen || helpOpen || settingsOpen || saves.loadOpen || saves.saveOpen,
		busy: saves.busy
	});
	/** The map's switch (plan 113, ADR 0118 point 6): save the flight, then open it in the Mission Center. */
	async function openMissionCenter(): Promise<void> {
		const id = await saves.autosaveId();
		if (id) location.assign(`/mission-center?load=${encodeURIComponent(id)}`);
	}
	async function autosave(reason: ReturnType<typeof autosaver.tick>): Promise<void> {
		if (reason === null) return;
		if (await saves.autosave()) autosaver.saved();
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

	async function quicksave(): Promise<void> {
		if (await saves.quicksave()) autosaver.saved();
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
		if (stages > lastStages) void autosave(autosaver.request('stage', saveState()));
		lastStages = stages;
		const landed = model?.phase === 'landed';
		if (landed && !wasLanded) void autosave(autosaver.request('landed', saveState()));
		wasLanded = landed;
	});

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
			void autosave(autosaver.tick(saveState()));
			if (flight) catchUp = flight.catchUp(Date.now());
		}, 1000);
		const onHidden = (): void => {
			if (document.visibilityState === 'hidden')
				void autosave(autosaver.request('hidden', saveState()));
		};
		document.addEventListener('visibilitychange', onHidden);
		let stop: (() => void) | undefined;
		let gone = false;
		const loadId = new URLSearchParams(location.search).get('load');
		void (async () => {
			let design: VesselDesign;
			let resume: GameSave | undefined;
			let start: ScenarioStart | null = null;
			if (loadId !== null) {
				try {
					resume = await saves.read(loadId);
				} catch (e) {
					loadFailed = true;
					problem = e instanceof Error ? e.message : String(e);
					return;
				}
				design = resume.design;
				// a save is flown in its own world (plan 087, ADR 0143)
				setActiveWorld(resume.worldId ?? 'legacy');
			} else if ((start = await scenarioOfWorld())) {
				// a world made from a scenario starts its first flight from it (plan 100, ADR 0151)
				design = start.design;
			} else {
				const text = loadDraft();
				if (text === null) {
					problem = 'No vessel to launch yet.';
					return;
				}
				const parsed = parseDesign(text, partLookup(catalog));
				if (!parsed.ok) {
					problem = `The saved design is invalid: ${parsed.errors.join('; ')}`;
					return;
				}
				design = parsed.design;
			}
			// a new flight in a world without saves starts with the world's own info (ADR 0143 point 1)
			const world = resume ? undefined : await saves.worldStartInfo(activeWorldId());
			// the Launch screen's facility, once (plan 094, ADR 0150 point 4)
			const launch = resume ? null : takeLaunchChoice();
			// a launch into a world with a save flies in that save (plan 108, ADR 0152 point 1)
			let into: SimSave | undefined;
			if (launch) {
				await saves.refresh();
				const newest = saves.entries.find((e) => e.ok);
				if (newest?.ok) into = (await saves.read(newest.meta.id)).sim;
			}
			if (gone) return;
			// the HUD's bodies and calendar are the world's own system's (plan 124, ADR 0184)
			const info = resume?.sim.worldInfo ?? into?.worldInfo ?? world;
			const own = info ? loadContent({ id: info.systemId, variant: info.variant }) : undefined;
			// an n-body world of the 1:1 Sol system follows JPL's DE440, fetched once (plan 125, ADR 0122)
			let ephemeris: ArrayBuffer | undefined;
			if (needsEphemeris(info)) {
				notice = "Loading JPL's DE440 ephemeris (7.5 MB, once)…";
				try {
					ephemeris = await loadEphemeris();
					notice = null;
				} catch (e) {
					notice = `The planets keep their own paths: ${e instanceof Error ? e.message : String(e)}.`;
				}
			}
			if (gone) return;
			stop = begin(
				own?.catalog ?? catalog,
				own?.content ?? content,
				design,
				resume,
				world,
				launch?.placement,
				start,
				into,
				launch?.crew,
				ephemeris
			);
		})();
		return () => {
			gone = true;
			clearInterval(timer);
			document.removeEventListener('visibilitychange', onHidden);
			stop?.();
		};
	});

	/** Start the flight and return its cleanup. */
	function begin(
		catalog: ReturnType<typeof loadContent>['catalog'],
		content: ReturnType<typeof loadContent>['content'],
		design: VesselDesign,
		resume: GameSave | undefined,
		world: WorldInfo | undefined,
		placement?: VesselPlacement,
		start: ScenarioStart | null = null,
		into?: SimSave,
		crew?: { member: string; part: number }[],
		ephemeris?: ArrayBuffer
	): () => void {
		designName = design.name;
		source = loadScript(designName) ?? '';
		const scriptSandbox = startScriptSandbox();
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
			...(resume ? { resume } : {}),
			...(world ? { world } : {}),
			...(start
				? {
						placement: start.placement,
						scenario: { others: start.others, missions: start.missions }
					}
				: placement
					? { placement }
					: {}),
			...(into ? { into } : {}),
			...(crew?.length ? { crew } : {}),
			...(ephemeris ? { ephemeris } : {}),
			content,
			profile: profileStore(),
			onHud: (h) => {
				hud = h;
				// dock panels read the same 10 Hz update (ADR 0149 point 2)
				if (dockShown || vesselOpen) panelInput = flight?.panelInput() ?? null;
			},
			onScript: (v) => (script = v),
			onGraphics: (p) => (graphics = p),
			sandbox: scriptSandbox,
			onFrame: (f: FrameData) => {
				deck?.paint(f.navball);
				markers?.place(f.map);
				const net = f.network ?? null;
				if (JSON.stringify(net) !== JSON.stringify(mapNetwork)) mapNetwork = net;
				const g = f.ghost ?? null;
				if (JSON.stringify(g) !== JSON.stringify(ghostFrame)) ghostFrame = g;
				targetMarks?.place(f.target ?? null);
				nodeLayer?.place(f.maneuver ?? null);
			},
			onKey: (key) => {
				if (key === 'escape') pauseOpen = true;
				else if (key === 'quicksave') void quicksave();
				else if (key === 'quickload') void saves.quickload();
				else helpOpen = true;
			}
		});
		flight = started;
		const waitForPlanner = setInterval(() => {
			if (started.maneuver) {
				planner = started.maneuver;
				clearInterval(waitForPlanner);
			}
		}, 100);
		return () => {
			clearInterval(waitForPlanner);
			offSandbox();
			checker?.close();
			checker = null;
			window.removeEventListener('hashchange', importFromHash);
			small.removeEventListener('change', sync);
			pointer.removeEventListener('change', syncPointer);
			flight = null;
			started.dispose();
		};
	}

	// The sim freezes and the flight keys go quiet while a dialog is open.
	$effect(() => {
		const modal = pauseOpen || helpOpen || settingsOpen || saves.loadOpen || saves.saveOpen;
		flight?.setPaused(modal);
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
	const warpUsable = $derived(canWarp(t, hud?.warp ?? 1, running));
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
	/** Below 1280 px the dock stands at the right, where the left stack has no room (plan 112). */
	const narrow = $derived(viewport.width <= 1279);
	function updateInsets(): void {
		viewport = { width: innerWidth, height: innerHeight };
		const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const deck = box('.bc .deck');
		const right = box('.tr');
		const bar = box('.tc header');
		if (deck && deck.height > 0) deckHeight = Math.round(deck.height);
		const left = box('.tl');
		leftStackBottom = left ? Math.round(left.bottom) : 0;
		const open = box('.tl .dock .open');
		// beside the whole left stack: the capsules can be wider than the open panel
		dockRight = open && open.width > 0 && left ? Math.round(Math.max(open.right, left.right)) : 0;
		const top = bar ? bar.bottom + 8 : 0;
		const bottom = deck ? Math.max(0, innerHeight - deck.top + 8) : 0;
		const side = right && right.width > 0 ? Math.max(0, innerWidth - right.left + 8) : 0;
		const key = [top, side, bottom, dockRight].map(Math.round).join(',');
		if (key === lastInsets) return;
		lastInsets = key;
		flight?.setViewInsets({ top, right: side, bottom, left: dockRight });
	}
	$effect(() => {
		void model?.name;
		void tall;
		void scriptOpen;
		void settings.dock.open;
		void dockShown;
		void tutorialStep;
		void hud?.status;
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
		if (observation === null) return;
		const next = advance(settings.tutorial, observation);
		if (next !== settings.tutorial) settings.setTutorial(next);
	});
	const tutorialStep = $derived(
		hud?.status === 'flying' && !pauseOpen ? currentStep(settings.tutorial, 'flight') : null
	);
	const canRun = $derived(hud?.status === 'flying' && source.trim() !== '' && !running);
</script>

<PageMeta
	title="Flight · {GAME_NAME}"
	description="Fly your rocket: throttle, stage, hold attitude with SAS, plan maneuvers on the map and reach orbit."
/>

<svelte:window onresize={updateInsets} />

<div class="stage">
	<canvas bind:this={canvas}></canvas>
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
	<MapMarkers bind:this={markers} orbit={model?.orbit ?? null} />
	<TargetMarkers bind:this={targetMarks} />
	<ManeuverLayer bind:this={nodeLayer} controller={planner} />

	{#if problem}
		<div class="center cover">
			{#if loadFailed}
				<StatusCard tone="danger" title="That flight could not be loaded">
					<p>{problem}</p>
					{#snippet actions()}
						<a class="cta" href="/">Main menu</a>
						<a class="cta quiet" href="/vab">Open the VAB</a>
					{/snippet}
				</StatusCard>
			{:else}
				<StatusCard tone="warning" title="Nothing to fly">
					<p>{problem} Build a vessel in the VAB, then launch it from there.</p>
					{#snippet actions()}
						<a class="cta" href="/vab">Open the VAB</a>
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
						<a class="cta quiet" href="/vab">Back to the VAB</a>
					{/snippet}
				</StatusCard>
			</div>
		{:else if hud.status === 'lost'}
			<div class="center">
				<StatusCard tone="danger" title="Vessel lost">
					<p>{hud.message}. Revert to the VAB to adjust the design and launch again.</p>
					{#snippet actions()}
						<a class="cta" href="/vab">Back to the VAB</a>
					{/snippet}
				</StatusCard>
			</div>
		{/if}

		<div
			class="ui"
			style:--deck-h="{deckHeight}px"
			style:--above-deck="{aboveDeckHeight(viewport.height, deckHeight)}px"
			style:--script-w="{scriptPanelWidth(viewport.width)}px"
		>
			<div class="tl">
				<div class="capsules">
					<WorldCapsule name={world.name} mode={world.mode} system={world.system} />
					<WarpControl
						warp={hud.warp}
						usable={warpUsable}
						met={model?.met ?? 0}
						date={model?.date ?? ''}
						{catchUp}
						oncatchup={() =>
							void flight?.acceptCatchUp(Date.now()).then((r) => {
								if (r && !r.ok) notice = `Catch up was refused: ${r.reason}`;
							})}
						onpause={() => (pauseOpen = true)}
						onslower={() => flight?.stepWarp(-1)}
						onfaster={() => flight?.stepWarp(1)}
					/>
				</div>
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

			<div class="tc">
				{#if hud.map}<MapSwitch
						busy={saves.busy}
						onmissioncenter={() => void openMissionCenter()}
					/>{/if}
				{#if model}<SituationBar name={model.name} situation={model.situation} />{/if}
				<Toasts toasts={model?.toasts ?? []} />
				{#if model?.link}<LinkBadge link={model.link} />{:else}<BlackoutBadge
						level={model?.blackout ?? 0}
					/>{/if}
				<BlackoutBadge level={model?.blackout ?? 0} />
				{#if ghostNote}<p class="ghost-note" role="status" data-testid="ghost-note">
						{ghostNote}
					</p>{/if}
				<RangeBadge warning={model?.range ?? null} />
				{#if model?.aero}<AeroStrip aero={model.aero} />{/if}
				<PrecompileBadge progress={graphics} />
			</div>

			<div class="tb">
				<AppBar
					map={hud.map}
					script={scriptOpen}
					scriptRunning={running}
					staging={stagingOpen}
					nav={navOpen}
					onmenu={() => (pauseOpen = true)}
					onmap={() => flight?.toggleMap()}
					onscript={toggleScript}
					dock={dockShown}
					ondock={() => (dockShown = !dockShown)}
					vessel={vesselOpen}
					onvessel={() => {
						vesselOpen = !vesselOpen;
						if (!vesselOpen) flight?.highlightPart(null);
						else panelInput = flight?.panelInput() ?? null;
					}}
					onhelp={() => (helpOpen = true)}
					onstaging={() => (stagingOpen = !stagingOpen)}
					onnav={() => (navOpen = !navOpen)}
				/>
			</div>
			{#if vesselOpen && vesselShown}
				<!-- the vessel panel (plan 111, ADR 0153 point 4): top right; below 1280 px in place of the dock -->
				<div class="tr vr">
					<VesselPanel
						vessel={vesselShown.id}
						name={vesselShown.name ?? designName}
						view={vesselShownView!}
						comms={vesselComms}
						transmitters={vesselTransmitters}
						oncommand={(c) => void flight?.command(c)}
						onhighlight={(part) => flight?.highlightPart(part)}
					/>
				</div>
			{:else if narrow}
				<div class="tr">{@render dock('right')}</div>
			{/if}
			{#if model && stagingOpen}
				<!-- on narrow screens staging stands in the left column: it steps back while the script panel is open -->
				<div class="bl" class:stowed={scriptOpen && viewport.width <= 1279}>
					<StageStack
						stages={model.stages}
						environment={model.environment}
						throttle={model?.throttle ?? hud.throttle}
						onstage={() => flight?.stage()}
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
							onwarp={() => flight?.warpToNode()}
							onpoint={() => flight?.setSas('maneuver')}
							onremove={() => flight?.removeNode()}
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
					/>
				</div>
			</div>

			{#if !touchOn}
				<div class="br">
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
						dockRight
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
							<OrbitStrip orbit={model.orbit} phase={model.phase} />
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
			onload={() => {
				pauseOpen = false;
				void saves.showLoad();
			}}
		/>
		<SaveDialog {saves} suggestion={model?.name ?? 'Saved flight'} />
		<LoadDialog {saves} />
		{#if saves.note && !saves.loadOpen && !saves.saveOpen}
			<p class="savenote" class:error={saves.noteIsError} role="status">{saves.note}</p>
		{/if}
		<HelpOverlay open={helpOpen} onclose={() => (helpOpen = false)} />
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
	.stage {
		position: fixed;
		inset: 0;
		overflow: hidden;
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
	/* refs layout (plan 088, ADR 0144): 24 px margins, capsules top left, toolbar top right */
	.tl {
		top: calc(var(--margin-hud) + var(--safe-top));
		left: calc(var(--margin-hud) + var(--safe-left));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-2);
		/* The script panel and the guide scroll above the instrument deck, never under it (plan 055). */
		max-height: var(--above-deck, calc(100% - 200px));
	}
	.capsules {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.5rem;
	}
	@media (max-width: 1279px) {
		.capsules {
			flex-direction: column;
		}
		/* the capsules stack: the vessel's name goes below both (more specific than the base rule below) */
		.ui > .tc {
			top: calc(
				var(--margin-hud) + var(--capsule) * 2 + var(--panel-gap) + 0.5rem + var(--safe-top)
			);
		}
	}
	.tb {
		top: calc(var(--margin-hud) + var(--safe-top));
		right: calc(var(--margin-hud) + var(--safe-right));
	}
	.br {
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		right: calc(var(--margin-hud) + var(--safe-right));
		width: 13.75rem;
	}
	.script {
		width: var(--script-w, min(420px, 46vw));
		overflow: auto;
	}
	.savenote {
		position: absolute;
		z-index: 5;
		top: 64px;
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
	.vr {
		width: 18.75rem;
		overflow-y: auto;
	}
	.tr {
		top: calc(var(--margin-hud) + var(--capsule) + var(--panel-gap) + var(--safe-top));
		right: calc(var(--margin-hud) + var(--safe-right));
		display: flex;
		/* it starts under the toolbar, so it has the toolbar's height less than the space above the deck */
		max-height: calc(var(--above-deck, calc(100% - 290px)) - var(--capsule) - var(--panel-gap));
	}
	.bl {
		bottom: calc(var(--margin-hud) + var(--safe-bottom));
		left: calc(var(--margin-hud) + var(--safe-left));
		width: 13.75rem;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	@media (max-width: 1279px) {
		.bl {
			bottom: calc(var(--deck-h, 262px) + var(--margin-hud) * 2 + var(--safe-bottom));
		}
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
		background: radial-gradient(ellipse at 50% 42%, #10243a 0%, var(--bg-void) 70%);
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
