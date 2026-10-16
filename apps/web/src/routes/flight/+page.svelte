<script lang="ts">
	import { onMount } from 'svelte';
	import { formatDistance, formatSpeed } from '../../lib/format';
	import { startFlight, type Flight, type FlightHud } from '../../lib/flight-loop';
	import { loadCatalog, partLookup } from '../../lib/catalog';
	import { parseDesign } from '../../lib/design';
	import { loadDraft, loadScript, saveScript } from '../../lib/storage';
	import { canWarp } from '../../lib/telemetry';
	import { ascentScript } from '@orbital/scripting/samples/ascent';
	import { idleScript, scriptIsActive, type ScriptView } from '../../lib/script-state';

	let canvas: HTMLCanvasElement;
	let hud = $state.raw<FlightHud | null>(null);
	let problem = $state<string | null>(null);
	let flight: Flight | null = null;
	let panelOpen = $state(false);
	let source = $state('');
	let designName = '';
	let script = $state.raw<ScriptView>(idleScript());
	let logEl = $state<HTMLPreElement>();

	const clock = (t: number): string => {
		const s = Math.floor(t);
		return `T+${Math.floor(s / 60)
			.toString()
			.padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
	};

	onMount(() => {
		const text = loadDraft();
		if (text === null) {
			problem = 'No design to launch. Build one in the VAB first.';
			return;
		}
		const parsed = parseDesign(text, partLookup(loadCatalog()));
		if (!parsed.ok) {
			problem = `The saved design is invalid: ${parsed.errors.join('; ')}`;
			return;
		}
		designName = parsed.design.name;
		source = loadScript(designName) ?? '';
		const started: Flight = startFlight({
			canvas,
			design: parsed.design,
			onHud: (h) => (hud = h),
			onScript: (v) => {
				script = v;
				// Keep the newest output in view once the DOM has the new lines.
				queueMicrotask(() => logEl && (logEl.scrollTop = logEl.scrollHeight));
			}
		});
		flight = started;
		return () => {
			flight = null;
			started.dispose();
		};
	});

	/** Edits and "Load sample" both go through here so the text is saved per design. */
	function setSource(text: string): void {
		source = text;
		if (designName) saveScript(designName, text);
	}

	const t = $derived(hud?.telemetry ?? null);
	const running = $derived(scriptIsActive(script.status));
	const warpUsable = $derived(canWarp(t, hud?.warp ?? 1));
	const canRun = $derived(hud?.status === 'flying' && source.trim() !== '' && !running);
</script>

<svelte:head><title>Flight · Orbital</title></svelte:head>

<div class="stage">
	<canvas bind:this={canvas}></canvas>

	<nav class="top">
		<a href="/vab">VAB</a>
		<span>{hud?.vesselName ?? ''}</span>
		<button type="button" onclick={() => (panelOpen = !panelOpen)} aria-expanded={panelOpen}>
			Script{running ? ' (running)' : ''}
		</button>
	</nav>

	{#if panelOpen}
		<section class="script" aria-label="Script">
			<textarea
				value={source}
				oninput={(e) => setSource(e.currentTarget.value)}
				spellcheck="false"
				rows="12"
				placeholder="Script body (async function): ship.throttle = 1; stage(); await wait(5); print(ship.altitude)"
				aria-label="Script source"></textarea>
			<div class="buttons">
				<button type="button" disabled={!canRun} onclick={() => flight?.runScript(source)}>
					Run
				</button>
				<button type="button" disabled={!running} onclick={() => flight?.stopScript()}>
					Stop
				</button>
				<button type="button" onclick={() => setSource(ascentScript)}>Load sample</button>
				<span
					class="status"
					class:error={script.status === 'failed' || script.status === 'terminated'}
					data-testid="script-status"
				>
					{script.status}
				</span>
			</div>
			{#if script.status !== 'idle'}
				<p class="timing">
					last tick {script.lastMs.toFixed(1)} ms · worst {script.maxMs.toFixed(1)} ms
				</p>
			{/if}
			{#if script.error}
				<pre class="err">{script.error}</pre>
			{/if}
			<pre class="log" bind:this={logEl} aria-label="Script output">{script.log.join('\n')}</pre>
		</section>
	{/if}

	{#if problem}
		<p class="banner">{problem} <a href="/vab">Open the VAB</a></p>
	{:else if hud}
		{#if hud.status !== 'flying' || hud.message}
			<p class="banner" class:error={hud.status === 'error' || hud.status === 'lost'}>
				{hud.message || hud.status}
			</p>
		{/if}
		<section class="hud" aria-label="Flight data">
			<dl>
				<dt>Time</dt>
				<dd>{t ? clock(t.t) : '-'}</dd>
				<dt>Altitude</dt>
				<dd>{t ? formatDistance(t.altitude) : '-'}</dd>
				<dt>Speed</dt>
				<dd>{t ? formatSpeed(t.speed) : '-'}</dd>
				<dt>Apoapsis</dt>
				<dd>
					{t?.apoapsis !== undefined ? formatDistance(t.apoapsis) : t?.escape ? 'escape' : '-'}
				</dd>
				<dt>Periapsis</dt>
				<dd>{t?.periapsis !== undefined ? formatDistance(t.periapsis) : '-'}</dd>
				<dt>Status</dt>
				<dd data-testid="hud-phase">{t?.phase ?? '-'}</dd>
				<dt>Mode</dt>
				<dd>{t?.mode ?? '-'}</dd>
				<dt>Throttle</dt>
				<dd>
					<meter min="0" max="1" value={hud.throttle}></meter>
					{Math.round(hud.throttle * 100)}%
				</dd>
				<dt>Stage</dt>
				<dd>{hud.stagesDone} / {hud.stagesTotal} fired</dd>
				<dt>Warp</dt>
				<dd>
					<button
						type="button"
						class="warp"
						aria-label="Slower time warp"
						disabled={!warpUsable}
						onclick={() => flight?.stepWarp(-1)}>-</button
					>
					<span data-testid="hud-warp">{hud.warp}x</span>
					<button
						type="button"
						class="warp"
						aria-label="Faster time warp"
						disabled={!warpUsable}
						onclick={() => flight?.stepWarp(1)}>+</button
					>
				</dd>
				<dt>View</dt>
				<dd>{hud.map ? 'map' : 'vessel'}</dd>
				{#if hud.autopilot}
					<dt>Autopilot</dt>
					<dd>{hud.autopilot}</dd>
				{/if}
			</dl>
		</section>
	{/if}

	<aside class="help">
		<b>Keys</b> Shift/Ctrl throttle up/down · Z full · X cut · W/S pitch · A/D yaw · Q/E roll ·
		Space stage · M map · , / . warp down/up · drag + wheel camera{#if import.meta.env.DEV}
			· P autopilot (dev){/if}
	</aside>
</div>

<style>
	:global(body) {
		margin: 0;
		background: #05070c;
		color: #e8eef5;
		font-family: ui-monospace, 'SF Mono', Menlo, monospace;
	}
	.stage {
		position: fixed;
		inset: 0;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		touch-action: none;
	}
	.top {
		position: absolute;
		top: 8px;
		right: 12px;
		display: flex;
		gap: 12px;
		font-size: 13px;
	}
	a {
		color: #8ecbff;
	}
	button {
		font: inherit;
		color: inherit;
		background: #172131;
		border: 1px solid #263244;
		border-radius: 4px;
		padding: 2px 10px;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.script {
		position: absolute;
		top: 34px;
		right: 12px;
		width: min(440px, 46vw);
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background: rgba(5, 7, 12, 0.85);
		border: 1px solid #263244;
		border-radius: 6px;
		font-size: 12px;
	}
	.script textarea {
		box-sizing: border-box;
		width: 100%;
		resize: vertical;
		font: inherit;
		color: #e8eef5;
		background: #0b1018;
		border: 1px solid #263244;
		border-radius: 4px;
		padding: 6px;
	}
	.buttons {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.status {
		margin-left: auto;
		color: #8ecbff;
	}
	.status.error,
	.err {
		color: #ffb4b0;
	}
	.timing {
		margin: 0;
		color: #7f8da3;
	}
	.script pre {
		margin: 0;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.log {
		max-height: 160px;
		overflow-y: auto;
		min-height: 3em;
		background: #0b1018;
		border: 1px solid #263244;
		border-radius: 4px;
		padding: 4px 6px;
	}
	.err {
		max-height: 80px;
		overflow-y: auto;
	}
	.hud {
		position: absolute;
		top: 8px;
		left: 8px;
		padding: 8px 12px;
		background: rgba(5, 7, 12, 0.7);
		border: 1px solid #263244;
		border-radius: 6px;
		font-size: 13px;
	}
	dl {
		display: grid;
		grid-template-columns: auto auto;
		gap: 2px 14px;
		margin: 0;
	}
	dt {
		color: #7f8da3;
	}
	dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.warp {
		padding: 0 7px;
		line-height: 1.3;
	}
	meter {
		width: 70px;
		vertical-align: middle;
	}
	.banner {
		position: absolute;
		top: 40%;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 8px 14px;
		background: rgba(5, 7, 12, 0.8);
		border: 1px solid #263244;
		border-radius: 6px;
	}
	.banner.error {
		border-color: #c0504d;
		color: #ffb4b0;
	}
	.help {
		position: absolute;
		bottom: 8px;
		left: 8px;
		right: 8px;
		font-size: 12px;
		color: #9fb0c5;
		background: rgba(5, 7, 12, 0.6);
		padding: 6px 10px;
		border-radius: 6px;
	}
</style>
