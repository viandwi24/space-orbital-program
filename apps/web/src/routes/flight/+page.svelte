<script lang="ts">
	import { onMount } from 'svelte';
	import { ascentScript } from '@orbital/scripting/samples/ascent';
	import AppBar from '../../lib/hud/AppBar.svelte';
	import HelpOverlay from '../../lib/hud/HelpOverlay.svelte';
	import InstrumentDeck from '../../lib/hud/InstrumentDeck.svelte';
	import MapMarkers from '../../lib/hud/MapMarkers.svelte';
	import OrbitStrip from '../../lib/hud/OrbitStrip.svelte';
	import PauseMenu from '../../lib/hud/PauseMenu.svelte';
	import ResourcesPanel from '../../lib/hud/ResourcesPanel.svelte';
	import ScriptPanel from '../../lib/hud/ScriptPanel.svelte';
	import SituationBar from '../../lib/hud/SituationBar.svelte';
	import StageStack from '../../lib/hud/StageStack.svelte';
	import StatusCard from '../../lib/hud/StatusCard.svelte';
	import WarpControl from '../../lib/hud/WarpControl.svelte';
	import Button from '../../lib/ui/Button.svelte';
	import Toasts from '../../lib/ui/Toasts.svelte';
	import { loadContent, partLookup } from '../../lib/catalog';
	import { parseDesign } from '../../lib/design';
	import { startFlight, type Flight, type FlightHud } from '../../lib/flight-loop';
	import type { FrameData } from '../../lib/hud-controller';
	import { idleScript, scriptIsActive, type ScriptView } from '../../lib/script-state';
	import type { SandboxStatus } from '../../lib/script-sandbox';
	import { startScriptSandbox } from '../../lib/script-sandbox-web';
	import { decodeScript, tokenFromHash, type ImportInfo } from '../../lib/script-share';
	import { loadDraft, loadScript, saveScript } from '../../lib/storage';
	import { canWarp } from '../../lib/telemetry';

	let canvas: HTMLCanvasElement;
	let hud = $state.raw<FlightHud | null>(null);
	let problem = $state<string | null>(null);
	let flight: Flight | null = null;
	let scriptOpen = $state(false);
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
	let autoQuality = $state(true);
	let helpOpen = $state(false);
	let deck = $state<InstrumentDeck>();
	let markers = $state<MapMarkers>();
	let tall = $state(true);

	onMount(() => {
		const { catalog, content } = loadContent();
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
		designName = parsed.design.name;
		source = loadScript(designName) ?? '';
		const scriptSandbox = startScriptSandbox();
		const offSandbox = scriptSandbox.onStatus((s) => (sandbox = s));
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
		const small = matchMedia('(max-height: 800px)');
		const sync = (): void => void (tall = !small.matches);
		sync();
		small.addEventListener('change', sync);
		const started: Flight = startFlight({
			canvas,
			design: parsed.design,
			content,
			onHud: (h) => (hud = h),
			onScript: (v) => (script = v),
			sandbox: scriptSandbox,
			onFrame: (f: FrameData) => {
				deck?.paint(f.navball);
				markers?.place(f.map);
			},
			onKey: (key) => {
				if (key === 'escape') pauseOpen = true;
				else helpOpen = true;
			}
		});
		flight = started;
		autoQuality = started.autoQuality;
		return () => {
			offSandbox();
			window.removeEventListener('hashchange', importFromHash);
			small.removeEventListener('change', sync);
			flight = null;
			started.dispose();
		};
	});

	// The sim freezes and the flight keys go quiet while a dialog is open.
	$effect(() => {
		flight?.setPaused(pauseOpen || helpOpen);
		flight?.setModal(pauseOpen || helpOpen);
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
	const canRun = $derived(hud?.status === 'flying' && source.trim() !== '' && !running);
</script>

<svelte:head><title>Flight · Orbital</title></svelte:head>

<div class="stage">
	<canvas bind:this={canvas}></canvas>
	<MapMarkers bind:this={markers} orbit={model?.orbit ?? null} />

	{#if problem}
		<div class="center">
			<StatusCard tone="warning" title="Nothing to fly">
				<p>{problem} Build a vessel in the VAB, then launch it from there.</p>
				{#snippet actions()}
					<a class="cta" href="/vab">Open the VAB</a>
				{/snippet}
			</StatusCard>
		</div>
	{:else if hud}
		{#if hud.status === 'booting'}
			<div class="center">
				<StatusCard title="Starting the simulation" busy>
					<p>Loading the sim and the stock parts.</p>
				</StatusCard>
			</div>
		{:else if hud.status === 'error'}
			<div class="center">
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

		<div class="ui">
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
				</div>
				<div class="bl">
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

			{#if hud.autopilot}<p class="dev num">Dev autopilot: {hud.autopilot}</p>{/if}
		</div>

		<PauseMenu
			open={pauseOpen}
			name={model?.name ?? ''}
			met={model?.met ?? 0}
			onresume={() => (pauseOpen = false)}
			oncontrols={() => (helpOpen = true)}
			{autoQuality}
			onautoquality={(on) => {
				autoQuality = on;
				flight?.setAutoQuality(on);
			}}
		/>
		<HelpOverlay open={helpOpen} onclose={() => (helpOpen = false)} />
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
		top: var(--s-3);
		left: var(--s-3);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--s-2);
		max-height: calc(100% - 200px);
	}
	.script {
		width: min(420px, 46vw);
		overflow: auto;
	}
	.tc {
		top: var(--s-3);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--s-3);
		pointer-events: none;
	}
	.tr {
		top: var(--s-3);
		right: var(--s-3);
		width: 264px;
		display: flex;
		flex-direction: column;
		gap: var(--s-2);
		max-height: calc(100% - 24px);
		overflow: auto;
	}
	.bl {
		bottom: var(--s-3);
		left: var(--s-3);
	}
	.bc {
		bottom: var(--s-3);
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
		bottom: var(--s-3);
		right: var(--s-3);
		margin: 0;
		padding: var(--s-1) var(--s-2);
		font-size: var(--t-xs);
		color: var(--text-dim);
		background: var(--panel);
		border: 1px solid var(--line);
		border-radius: var(--r-control);
	}
</style>
