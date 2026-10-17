<script lang="ts">
	import PageMeta from '../../lib/ui/PageMeta.svelte';
	import { onMount } from 'svelte';
	import { ascentScript } from '@orbital/scripting/samples/ascent';
	import AppBar from '../../lib/hud/AppBar.svelte';
	import BlackoutBadge from '../../lib/hud/BlackoutBadge.svelte';
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
	import type { VesselDesign } from '@orbital/core';
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
	let scriptOpen = $state(false);
	/** Compiles the script for the editor's syntax check; null before the flight starts. */
	let checker: ScriptChecker | null = null;
	const checkSyntax = (text: string) => checker?.check(text) ?? Promise.resolve(undefined);
	$effect(() => {
		if (!scriptOpen) checker?.close();
	});
	let source = $state('');
	let designName = $state('');
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
	let targetMarks = $state<TargetMarkers>();
	let nodeLayer = $state<ManeuverLayer>();
	/** The map view's maneuver planner, available once the sim has started (plan 045). */
	let planner = $state.raw<Flight['maneuver']>(null);
	let tall = $state(true);
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
		startLoad: (id) => location.assign(`/flight?load=${encodeURIComponent(id)}`)
	});
	const autosaver = createAutosaver(() => performance.now());
	const saveState = () => ({
		flying: hud?.status === 'flying',
		paused: pauseOpen || helpOpen || settingsOpen || saves.loadOpen || saves.saveOpen,
		busy: saves.busy
	});
	async function autosave(reason: ReturnType<typeof autosaver.tick>): Promise<void> {
		if (reason === null) return;
		if (await saves.autosave()) autosaver.saved();
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

	onMount(() => {
		const { catalog, content } = loadContent();
		const timer = setInterval(() => void autosave(autosaver.tick(saveState())), 1000);
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
			if (loadId !== null) {
				try {
					resume = await saves.read(loadId);
				} catch (e) {
					loadFailed = true;
					problem = e instanceof Error ? e.message : String(e);
					return;
				}
				design = resume.design;
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
			if (gone) return;
			stop = begin(catalog, content, design, resume);
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
		resume: GameSave | undefined
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
			scriptOpen = true;
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
			content,
			onHud: (h) => (hud = h),
			onScript: (v) => (script = v),
			onGraphics: (p) => (graphics = p),
			sandbox: scriptSandbox,
			onFrame: (f: FrameData) => {
				deck?.paint(f.navball);
				markers?.place(f.map);
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
	let viewport = $state({ width: 1440, height: 900 });
	function updateInsets(): void {
		viewport = { width: innerWidth, height: innerHeight };
		const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
		const deck = box('.bc .deck');
		const right = box('.tr');
		const bar = box('.tc header');
		if (deck && deck.height > 0) deckHeight = Math.round(deck.height);
		const left = box('.tl');
		leftStackBottom = left ? Math.round(left.bottom) : 0;
		const top = bar ? bar.bottom + 8 : 0;
		const bottom = deck ? Math.max(0, innerHeight - deck.top + 8) : 0;
		const side = right && right.width > 0 ? Math.max(0, innerWidth - right.left + 8) : 0;
		const key = [top, side, bottom].map(Math.round).join(',');
		if (key === lastInsets) return;
		lastInsets = key;
		flight?.setViewInsets({ top, right: side, bottom, left: 0 });
	}
	$effect(() => {
		void model?.name;
		void tall;
		void scriptOpen;
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
	title="Flight · Orbital"
	description="Fly your rocket: throttle, stage, hold attitude with SAS, plan maneuvers on the map and reach orbit."
/>

<svelte:window onresize={updateInsets} />

<div class="stage">
	<canvas bind:this={canvas}></canvas>
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
				<AppBar
					map={hud.map}
					script={scriptOpen}
					scriptRunning={running}
					onmenu={() => (pauseOpen = true)}
					onmap={() => flight?.toggleMap()}
					onscript={() => (scriptOpen = !scriptOpen)}
					onhelp={() => (helpOpen = true)}
				/>
				{#if tutorialStep}
					<TutorialCard
						step={tutorialStep}
						label={stepLabel(settings.tutorial, 'flight')}
						touch={touchOn}
						onskip={() => settings.setTutorial(skip(settings.tutorial))}
					/>
				{/if}
				{#if scriptOpen}
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
				{/if}
			</div>

			<div class="tc">
				{#if model}<SituationBar name={model.name} situation={model.situation} />{/if}
				<Toasts toasts={model?.toasts ?? []} />
				<BlackoutBadge level={model?.blackout ?? 0} />
				<PrecompileBadge progress={graphics} />
			</div>

			{#if model}
				<div class="tr">
					<ResourcesPanel resources={model.resources} />
					<StageStack
						stages={model.stages}
						environment={model.environment}
						throttle={model?.throttle ?? hud.throttle}
						onstage={() => flight?.stage()}
					/>
					<TargetPanel
						target={model.target}
						choices={model.targets}
						controllable={model.controllable}
						rendezvous={model.rendezvous}
						onselect={(key) => flight?.setTarget(key)}
						onplan={(id) => flight?.planAid(id)}
					/>
				</div>
				<div class="bl">
					<ManeuverPanel
						maneuver={model.maneuver}
						map={hud.map}
						{warpUsable}
						onwarp={() => flight?.warpToNode()}
						onpoint={() => flight?.setSas('maneuver')}
						onremove={() => flight?.removeNode()}
					/>
					<OrbitStrip orbit={model.orbit} phase={model.phase} />
				</div>
			{/if}

			<div class="bc">
				<WarpControl
					warp={hud.warp}
					usable={warpUsable}
					met={model?.met ?? 0}
					onslower={() => flight?.stepWarp(-1)}
					onfaster={() => flight?.stepWarp(1)}
				/>
				<InstrumentDeck
					bind:this={deck}
					{model}
					throttle={model?.throttle ?? hud.throttle}
					ballSize={tall ? 176 : 144}
					oncyclespeed={() => flight?.cycleSpeedMode()}
					sas={model?.sas}
					controllable={model?.controllable ?? true}
					onsas={(mode) => flight?.setSas(mode)}
				/>
			</div>

			{#if touchOn && hud.status === 'flying' && !pauseOpen}
				<TouchControls
					anchor={throttleAnchor(viewport, deckHeight, scriptOpen, leftStackBottom)}
					throttle={model?.throttle ?? hud.throttle}
					onthrottle={(v) => flight?.setThrottle(v)}
					onattitude={(a) => flight?.setTouchAttitude(a)}
					onstage={() => flight?.stage()}
				/>
			{/if}

			{#if hud.autopilot}<p class="dev num">Dev autopilot: {hud.autopilot}</p>{/if}
		</div>

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
	.ui :global(nav) {
		pointer-events: auto;
	}
	.tl {
		top: calc(var(--s-3) + var(--safe-top));
		left: calc(var(--s-3) + var(--safe-left));
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-2);
		/* The script panel and the guide scroll above the instrument deck, never under it (plan 055). */
		max-height: var(--above-deck, calc(100% - 200px));
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
		top: calc(var(--s-3) + var(--safe-top));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-3);
		pointer-events: none;
	}
	.tr {
		top: calc(var(--s-3) + var(--safe-top));
		right: calc(var(--s-3) + var(--safe-right));
		width: 264px;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		max-height: calc(100% - 24px);
		overflow: auto;
		overscroll-behavior: contain;
	}
	/* Below this width the instrument deck reaches under the side columns (plan 035 added a target
	   card to it): the right column scrolls above the measured deck, and the maneuver and orbit
	   strip stand on top of it, instead of sliding under it (plan 055). */
	@media (max-width: 1279px) {
		.tr {
			max-height: var(--above-deck, calc(100% - 24px - 290px));
		}
	}
	.bl {
		bottom: calc(var(--s-3) + var(--safe-bottom));
		left: calc(var(--s-3) + var(--safe-left));
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
	}
	@media (max-width: 1279px) {
		.bl {
			bottom: calc(var(--deck-h, 262px) + var(--s-3) * 2 + var(--safe-bottom));
		}
	}
	.bc {
		bottom: calc(var(--s-3) + var(--safe-bottom));
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-2);
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
</style>
