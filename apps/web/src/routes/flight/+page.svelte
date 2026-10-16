<script lang="ts">
	import { onMount } from 'svelte';
	import { formatDistance, formatSpeed } from '../../lib/format';
	import { startFlight, type Flight, type FlightHud } from '../../lib/flight-loop';
	import { loadCatalog, partLookup } from '../../lib/catalog';
	import { parseDesign } from '../../lib/design';
	import { loadDraft } from '../../lib/storage';

	let canvas: HTMLCanvasElement;
	let hud = $state.raw<FlightHud | null>(null);
	let problem = $state<string | null>(null);

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
		const flight: Flight = startFlight({
			canvas,
			design: parsed.design,
			onHud: (h) => (hud = h)
		});
		return () => flight.dispose();
	});

	const t = $derived(hud?.telemetry ?? null);
</script>

<svelte:head><title>Flight · Orbital</title></svelte:head>

<div class="stage">
	<canvas bind:this={canvas}></canvas>

	<nav class="top">
		<a href="/vab">VAB</a>
		<span>{hud?.vesselName ?? ''}</span>
	</nav>

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
				<dd>{hud.warp}x</dd>
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
