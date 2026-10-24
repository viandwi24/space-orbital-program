<script lang="ts">
	import { compilesInPlay, lookCostLines, lookCostTotal, playCompilesText } from './compile-play';
	/**
	 * The Debug panel (plan 203, ADR 0200): cheats, set orbit, set location, resources, the log, the
	 * overlay stub and the Info tab. Every change goes through the debug API, so it is a sim command.
	 * The sim keeps running while it is open.
	 */
	import {
		DEBUG_CHEATS,
		type DebugCheat,
		type DebugSnapshot,
		type Snapshot,
		type VesselDesign
	} from '@orbital/core';
	import { resolve } from '$app/paths';
	import Dialog from '../ui/Dialog.svelte';
	import Button from '../ui/Button.svelte';
	import Switch from '../ui/Switch.svelte';
	import { downloadText } from '../download';
	import { logBuffer, LOG_LEVELS, type LogLevel } from '../log-buffer';
	import type { DebugInfo } from '../flight-loop';
	import { worldRenderer } from '../world-renderer.svelte';
	import { LongFrameLog, describeLongFrame, observeLongFrames } from './long-frames';
	import { createDebugApi, type DebugHost } from './api';
	import {
		uniqueDesigns,
		DEBUG_TABS,
		DEG,
		TAB_LABELS,
		filterLog,
		formatLogLine,
		logFileName,
		logText,
		orbitPresets,
		title,
		type DebugTab
	} from './model';

	let {
		open,
		onclose,
		host,
		info,
		resetFrames,
		world,
		designs
	}: {
		open: boolean;
		onclose: () => void;
		host: DebugHost | null;
		info: () => DebugInfo | null;
		/** Empties the frame-interval histogram (plan 251). */
		resetFrames: () => void;
		/** The world's name, for the log file. */
		world: string;
		/** Designs Set orbit can spawn: the vessel library's and the flight's own. */
		designs: () => Promise<Array<{ name: string; design: VesselDesign }>>;
	} = $props();

	const api = $derived(host ? createDebugApi(host) : null);
	let tab = $state<DebugTab>('cheats');
	let snap = $state.raw<Snapshot | null>(null);
	let note = $state('');
	let noteBad = $state(false);

	// a fresh snapshot four times a second while open; the panel needs no more
	$effect(() => {
		if (!open || !host) return;
		snap = host.snapshot();
		let last = 0;
		return host.onSnapshot((s) => {
			const now = performance.now();
			if (now - last < 250) return;
			last = now;
			snap = s;
		});
	});

	const debug = $derived<DebugSnapshot | null>(snap?.debug ?? null);
	const vessel = $derived(snap?.vessels.find((v) => v.id === host?.vessel()) ?? null);
	const bodies = $derived(host?.bodies() ?? []);

	async function run(
		what: string,
		call: () => Promise<{ ok: true } | { ok: false; reason: string }>
	) {
		const r = await call();
		noteBad = !r.ok;
		note = r.ok ? `${what}: done` : `${what}: ${r.reason}`;
	}

	// ---- cheats
	const CHEAT_LABELS: Record<DebugCheat, string> = {
		'infinite-fuel': 'Infinite fuel',
		'infinite-electricity': 'Infinite electric charge',
		'infinite-monopropellant': 'Infinite monopropellant and EVA propellant',
		'no-crash-damage': 'No crash damage',
		'ignore-temperature': 'Ignore maximum temperature',
		'unbreakable-joints': 'Unbreakable joints',
		'comms-without-signal': 'Comms without signal',
		'infinite-life-support': 'Life support never runs out',
		'instant-construction': 'Instant construction'
	};
	let grantFunds = $state(100_000);
	let grantScience = $state(1000);
	let grantReputation = $state(100);

	// ---- set orbit
	let orbitBody = $state('');
	let orbitMode = $state<'apsides' | 'elements'>('apsides');
	let apKm = $state(100);
	let peKm = $state(100);
	let aKm = $state(700);
	let ecc = $state(0);
	let incDeg = $state(0);
	let raanDeg = $state(0);
	let argpDeg = $state(0);
	let meanDeg = $state(0);
	let spawn = $state('');
	let designList = $state.raw<Array<{ name: string; design: VesselDesign }>>([]);
	$effect(() => {
		if (open && tab === 'orbit') void designs().then((list) => (designList = uniqueDesigns(list)));
	});
	$effect(() => {
		if (orbitBody === '' && host) orbitBody = vessel?.soi ?? host.home();
	});
	const presets = $derived(host ? orbitPresets(bodies, host.home()) : []);
	function usePreset(id: string): void {
		const p = presets.find((x) => x.id === id);
		if (!p) return;
		const body = bodies.find((b) => b.id === p.orbit.body);
		orbitBody = p.orbit.body;
		orbitMode = 'apsides';
		const r = body?.radius ?? 0;
		apKm = Math.round((p.orbit.a * (1 + p.orbit.e) - r) / 1000);
		peKm = Math.round((p.orbit.a * (1 - p.orbit.e) - r) / 1000);
		incDeg = raanDeg = argpDeg = meanDeg = 0;
	}
	function applyOrbit(): void {
		if (!api) return;
		const angles = { i: incDeg * DEG, raan: raanDeg * DEG, argp: argpDeg * DEG, m0: meanDeg * DEG };
		const spec =
			orbitMode === 'apsides'
				? { body: orbitBody, apoapsis: apKm * 1000, periapsis: peKm * 1000, ...angles }
				: { body: orbitBody, a: aKm * 1000, e: ecc, ...angles };
		const design = designList.find((d) => d.name === spawn)?.design;
		void run(design ? 'Spawn in orbit' : 'Set orbit', () =>
			api!.setOrbit(spec, design ? { design } : {})
		);
	}

	// ---- set location
	let where = $state<'site' | 'surface' | 'air'>('site');
	let latDeg = $state(0);
	let lonDeg = $state(0);
	let altKm = $state(5);
	let speed = $state(200);
	let headingDeg = $state(90);
	let climbDeg = $state(0);
	let site = $state('');
	const sites = $derived(snap?.sites?.map((s) => s.id) ?? []);
	function applyLocation(): void {
		if (!api) return;
		const body = vessel?.soi;
		const location =
			where === 'site'
				? { kind: 'site' as const, site: site || sites[0] || 'legacy' }
				: where === 'surface'
					? { kind: 'surface' as const, body, latitude: latDeg * DEG, longitude: lonDeg * DEG }
					: {
							kind: 'air' as const,
							body,
							latitude: latDeg * DEG,
							longitude: lonDeg * DEG,
							altitude: altKm * 1000,
							speed,
							heading: headingDeg * DEG,
							climb: climbDeg * DEG
						};
		void run('Set location', () => api!.setLocation(location));
	}

	// ---- resources
	let resPart = $state('');
	let resName = $state('');
	let resAmount = $state(0);
	let tempK = $state(300);
	let crewMember = $state('');
	let crewLevel = $state(1);
	const partChoices = $derived(
		vessel?.parts.map((p) => ({ id: p.id, label: `${p.definition} #${p.id}` })) ?? []
	);
	const resourceIds = $derived.by(() => {
		const out = new Set<string>();
		for (const p of vessel?.parts ?? []) {
			const amounts = (
				p.modules['stock.resource-container'] as { amounts?: Record<string, number> } | undefined
			)?.amounts;
			for (const k of Object.keys(amounts ?? {})) out.add(k);
		}
		return [...out].sort();
	});
	const partArg = () => (resPart === '' ? {} : { part: Number(resPart) as never });
	const resArg = () => (resName === '' ? {} : { resource: resName });

	// ---- log
	let levels = $state<LogLevel[]>(['info', 'warn', 'error']);
	let logFilter = $state('');
	let logVersion = $state(0);
	$effect(() => {
		if (!open) return;
		return logBuffer.subscribe(() => (logVersion += 1));
	});
	const visible = $derived.by(() => {
		void logVersion;
		return filterLog(logBuffer.entries(), { levels, text: logFilter });
	});
	function toggleLevel(level: LogLevel, on: boolean): void {
		levels = on ? [...levels, level] : levels.filter((l) => l !== level);
	}
	async function copyLog(): Promise<void> {
		try {
			await navigator.clipboard.writeText(logText(visible));
			note = `Copied ${visible.length} lines`;
			noteBad = false;
		} catch {
			note = 'The browser did not allow copying';
			noteBad = true;
		}
	}

	// ---- the world's load report (plan 370, ADR 0308)
	async function copyLoadReport(): Promise<void> {
		const text = worldRenderer.report()?.text;
		if (!text) {
			note = 'No world renderer yet';
			noteBad = true;
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
			note = 'Copied the load report';
			noteBad = false;
		} catch {
			note = 'The browser did not allow copying';
			noteBad = true;
		}
	}
	const playCompiles = $derived.by(() => {
		void infoNow;
		return playCompilesText(compilesInPlay(worldRenderer.compiledPipelines()));
	});
	const lookCostsNow = $derived.by(() => {
		void infoNow;
		return worldRenderer.lookCosts();
	});
	const lookCosts = $derived(lookCostLines(lookCostsNow));
	const loadLine = $derived.by(() => {
		void infoNow;
		const d = worldRenderer.report()?.data;
		if (!d) return 'no world renderer';
		const c = d.compile;
		const total = d.totalMs === null ? 'loading' : `${(d.totalMs / 1000).toFixed(1)} s`;
		return `${total}, ${d.cache === 'first' ? 'first load of these shaders' : 'shaders seen before'} · ${c.pipelines} pipelines (${c.pending} compiling) · ${Math.round(c.moduleBytes / 1024)} KB of shaders`;
	});

	// ---- info
	let fps = $state(0);
	/** Long animation frames and the scripts in them (plan 396); empty where the browser reports none. */
	const longFrames = new LongFrameLog();
	let longFrameLines = $state.raw<string[]>([]);
	let longFrameTotal = $state(0);
	$effect(() => {
		if (!open || tab !== 'info') return;
		const stop = observeLongFrames(longFrames);
		const refresh = setInterval(() => {
			longFrameLines = longFrames.recent().map(describeLongFrame);
			longFrameTotal = longFrames.total;
		}, 1000);
		return () => {
			stop?.();
			clearInterval(refresh);
		};
	});
	let infoNow = $state.raw<DebugInfo | null>(null);
	$effect(() => {
		if (!open || tab !== 'info') return;
		let frames = 0;
		let start = performance.now();
		let raf = requestAnimationFrame(function count(now) {
			frames += 1;
			if (now - start >= 1000) {
				fps = Math.round((frames * 1000) / (now - start));
				frames = 0;
				start = now;
				infoNow = info();
			}
			raf = requestAnimationFrame(count);
		});
		infoNow = info();
		return () => cancelAnimationFrame(raf);
	});
	const memory = $derived.by(() => {
		void infoNow;
		const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
		return m ? `${Math.round(m.usedJSHeapSize / 1048576)} MB` : 'not shown by this browser';
	});
</script>

<Dialog {open} title="Debug" {onclose}>
	<div class="tabs" role="tablist" aria-label="Debug sections">
		{#each DEBUG_TABS as t (t)}
			<button
				type="button"
				role="tab"
				id="debug-tab-{t}"
				aria-selected={tab === t}
				aria-controls="debug-panel"
				tabindex={tab === t ? 0 : -1}
				class:on={tab === t}
				data-testid="debug-tab-{t}"
				onclick={() => (tab = t)}>{TAB_LABELS[t]}</button
			>
		{/each}
	</div>

	<div class="body" id="debug-panel" role="tabpanel" aria-labelledby="debug-tab-{tab}">
		{#if debug && !debug.allowed && tab !== 'log' && tab !== 'info'}
			<p class="lock" data-testid="debug-locked">
				{debug.access === 'locked'
					? 'Debug tools are locked in this world.'
					: 'Turn on Debug mode in Settings to use the debug tools here. The world is then marked "used cheats".'}
			</p>
		{:else if tab === 'cheats'}
			<div class="grid">
				{#each DEBUG_CHEATS as cheat (cheat)}
					<div class="row">
						<span>{CHEAT_LABELS[cheat]}</span>
						<Switch
							checked={debug?.cheats.includes(cheat) ?? false}
							label={CHEAT_LABELS[cheat]}
							testid="cheat-{cheat}"
							onchange={(on) => void run(CHEAT_LABELS[cheat], () => api!.setCheat(cheat, on))}
						/>
					</div>
				{/each}
			</div>
			<div class="line">
				<label>Funds <input type="number" bind:value={grantFunds} /></label>
				<Button onclick={() => void run('Add funds', () => api!.grant({ funds: grantFunds }))}
					>Add</Button
				>
				<label>Science <input type="number" bind:value={grantScience} /></label>
				<Button onclick={() => void run('Add science', () => api!.grant({ science: grantScience }))}
					>Add</Button
				>
				<label>Reputation <input type="number" bind:value={grantReputation} /></label>
				<Button
					onclick={() =>
						void run('Add reputation', () => api!.grant({ reputation: grantReputation }))}
					>Add</Button
				>
			</div>
			<Button onclick={() => void run('Unlock all tech', () => api!.grant({ tech: true }))}
				>Unlock all tech</Button
			>
		{:else if tab === 'orbit'}
			<div class="line">
				{#each presets as p (p.id)}
					<Button onclick={() => usePreset(p.id)}>{p.label}</Button>
				{/each}
			</div>
			<div class="line">
				<label
					>Body
					<select bind:value={orbitBody} data-testid="orbit-body">
						{#each bodies as b (b.id)}<option value={b.id}>{title(b)}</option>{/each}
					</select></label
				>
				<label
					><input type="radio" bind:group={orbitMode} value="apsides" /> Apoapsis and periapsis</label
				>
				<label><input type="radio" bind:group={orbitMode} value="elements" /> Elements</label>
			</div>
			<div class="line">
				{#if orbitMode === 'apsides'}
					<label>Ap, km <input type="number" bind:value={apKm} data-testid="orbit-ap" /></label>
					<label>Pe, km <input type="number" bind:value={peKm} data-testid="orbit-pe" /></label>
				{:else}
					<label>a, km <input type="number" bind:value={aKm} /></label>
					<label>e <input type="number" step="0.01" min="0" bind:value={ecc} /></label>
				{/if}
				<label>i, ° <input type="number" bind:value={incDeg} /></label>
				<label>Ω, ° <input type="number" bind:value={raanDeg} /></label>
				<label>ω, ° <input type="number" bind:value={argpDeg} /></label>
				<label>M, ° <input type="number" bind:value={meanDeg} /></label>
			</div>
			<div class="line">
				<label
					>Apply to
					<select bind:value={spawn}>
						<option value="">The active vessel</option>
						{#each designList as d (d.name)}<option value={d.name}>New: {d.name}</option>{/each}
					</select></label
				>
				<Button variant="primary" onclick={applyOrbit} data-testid="orbit-apply">Set orbit</Button>
			</div>
		{:else if tab === 'location'}
			<div class="line">
				<label><input type="radio" bind:group={where} value="site" /> At a site</label>
				<label><input type="radio" bind:group={where} value="surface" /> Landed at</label>
				<label><input type="radio" bind:group={where} value="air" /> In the air</label>
			</div>
			<div class="line">
				{#if where === 'site'}
					<label
						>Site
						<select bind:value={site}>
							{#each sites as s (s)}<option value={s}>{s}</option>{/each}
						</select></label
					>
				{:else}
					<label>Latitude, ° <input type="number" bind:value={latDeg} /></label>
					<label>Longitude, ° <input type="number" bind:value={lonDeg} /></label>
				{/if}
				{#if where === 'air'}
					<label>Altitude, km <input type="number" bind:value={altKm} /></label>
					<label>Speed, m/s <input type="number" bind:value={speed} /></label>
					<label>Heading, ° <input type="number" bind:value={headingDeg} /></label>
					<label>Climb, ° <input type="number" bind:value={climbDeg} /></label>
				{/if}
			</div>
			<Button variant="primary" onclick={applyLocation}>Set location</Button>
		{:else if tab === 'resources'}
			<div class="line">
				<label
					>Part
					<select bind:value={resPart}>
						<option value="">Every part</option>
						{#each partChoices as p (p.id)}<option value={String(p.id)}>{p.label}</option>{/each}
					</select></label
				>
				<label
					>Resource
					<select bind:value={resName}>
						<option value="">Every resource</option>
						{#each resourceIds as r (r)}<option value={r}>{r}</option>{/each}
					</select></label
				>
			</div>
			<div class="line">
				<Button
					onclick={() =>
						void run('Fill', () => api!.setResource({ ...partArg(), ...resArg(), fraction: 1 }))}
					>Fill</Button
				>
				<Button
					onclick={() =>
						void run('Empty', () => api!.setResource({ ...partArg(), ...resArg(), fraction: 0 }))}
					>Empty</Button
				>
				<label>Amount <input type="number" min="0" bind:value={resAmount} /></label>
				<Button
					onclick={() =>
						void run('Set amount', () =>
							api!.setResource({ ...partArg(), ...resArg(), amount: resAmount })
						)}>Set</Button
				>
			</div>
			<div class="line">
				<label>Temperature, K <input type="number" min="0" bind:value={tempK} /></label>
				<Button
					onclick={() =>
						void run('Set temperature', () =>
							api!.setTemperature({ ...partArg(), temperature: tempK })
						)}>Set</Button
				>
			</div>
			<div class="line">
				<label
					>Crew
					<select bind:value={crewMember}>
						{#each snap?.crew ?? [] as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
					</select></label
				>
				<label>Level <input type="number" min="0" max="10" bind:value={crewLevel} /></label>
				<Button
					disabled={crewMember === ''}
					onclick={() => void run('Set level', () => api!.setCrewLevel(crewMember, crewLevel))}
					>Set</Button
				>
			</div>
		{:else if tab === 'log'}
			<div class="line">
				{#each LOG_LEVELS as level (level)}
					<label
						><input
							type="checkbox"
							checked={levels.includes(level)}
							onchange={(e) => toggleLevel(level, e.currentTarget.checked)}
						/>
						{level}</label
					>
				{/each}
				<input
					type="search"
					placeholder="Filter"
					aria-label="Filter the log"
					bind:value={logFilter}
				/>
				<Button onclick={() => void copyLog()}>Copy</Button>
				<Button
					onclick={() =>
						downloadText(logText(visible), logFileName(world, new Date()), 'text/plain')}
					>Download</Button
				>
			</div>
			<pre class="log" data-testid="debug-log">{#each visible.slice(-400) as e, i (i)}<span
						class={e.level}>{formatLogLine(e)}</span
					>
				{/each}</pre>
		{:else if tab === 'overlay'}
			<p class="lock">
				Overlays (aero forces, heat, centres of mass, lift and thrust, colliders, physics range)
				come in a later release (P1).
			</p>
		{:else if tab === 'info'}
			<p class="tools">
				<a href={resolve('/developer/parts')} target="_blank" rel="noopener">Part viewer</a> (a new tab:
				every part on its own, its nodes and colliders, no world loaded)
			</p>
			<dl class="info" data-testid="debug-info">
				<dt>Frames per second</dt>
				<dd>{fps}</dd>
				<dt>Frame interval</dt>
				<dd data-testid="debug-frames">
					{#if infoNow && infoNow.frames.count > 0}
						{@const f = infoNow.frames}
						p50 {f.p50.toFixed(1)} · p95 {f.p95.toFixed(1)} · p99 {f.p99.toFixed(1)} ms, over 16.7 ms:
						{(f.over60 * 100).toFixed(1)} %, over 33.3 ms: {(f.over30 * 100).toFixed(1)} % ({f.count}
						frames, {Math.round(f.seconds)} s)
					{:else}
						no frames yet
					{/if}
					<Button
						onclick={() => {
							resetFrames();
							infoNow = info();
						}}
						data-testid="debug-frames-reset">Reset</Button
					>
				</dd>
				<dt>Long frames</dt>
				<dd data-testid="debug-long-frames">
					{#if longFrameLines.length === 0}
						none over 50 ms
					{:else}
						{longFrameTotal} over 50 ms, the last {longFrameLines.length}:
						<ul>
							{#each longFrameLines as line, i (i)}
								<li>{line}</li>
							{/each}
						</ul>
					{/if}
				</dd>
				<dt>Sim step</dt>
				<dd>{infoNow?.stepMs == null ? '–' : `${infoNow.stepMs.toFixed(2)} ms`}</dd>
				<dt>Vessels</dt>
				<dd>{infoNow?.vessels ?? 0}</dd>
				<dt>Memory</dt>
				<dd>{memory}</dd>
				<dt>Graphics</dt>
				<dd>
					{infoNow?.preset ?? '–'} at {Math.round((infoNow?.scale ?? 1) * 100)} %{infoNow?.governor
						? ', adjusted automatically'
						: ''}
				</dd>
				<dt>Renderer</dt>
				<dd data-testid="debug-renderer">
					{#if infoNow?.renderer}
						{@const r = infoNow.renderer}
						{r.backend} · {r.gpu}{r.gpuMs === null ? '' : ` · GPU ${r.gpuMs.toFixed(2)} ms a frame`}
					{:else}
						–
					{/if}
				</dd>
				{#if infoNow?.renderer && infoNow.renderer.backend !== 'webgl'}
					<dt>Not drawn yet</dt>
					<dd data-testid="debug-unported">
						{infoNow.renderer.unported.length
							? infoNow.renderer.unported.join(', ')
							: 'nothing: every mesh is ported'}{infoNow.renderer.patched.length
							? ` · drawn without its patch: ${infoNow.renderer.patched.join(', ')}`
							: ''}
					</dd>
				{/if}
				<dt>World load</dt>
				<dd data-testid="debug-load">
					{loadLine}
					<Button onclick={() => void copyLoadReport()} data-testid="debug-copy-load"
						>Copy load report</Button
					>
				</dd>
				<dt>Compiled in play</dt>
				<dd data-testid="debug-play-compiles">{playCompiles}</dd>
				<dt>Look costs</dt>
				<dd data-testid="debug-look-costs">
					{lookCosts.length
						? `${lookCostTotal(lookCostsNow).toFixed(2)} ms: ${lookCosts.join(' · ')}`
						: 'not reported yet'}
				</dd>
				<dt>Frame pacing</dt>
				<dd data-testid="debug-governor-pacing">
					{infoNow?.governorPacing ?? 'not adjusted automatically'}
				</dd>
				<dt>Graphics changes</dt>
				<dd data-testid="debug-governor-changes">
					{infoNow?.governorChanges.length ? infoNow.governorChanges.join(' · ') : 'none'}
				</dd>
				<dt>Version</dt>
				<dd>{infoNow?.versions ?? '–'}</dd>
				<dt>Used cheats</dt>
				<dd>{debug?.usedCheats ? 'yes' : 'no'}</dd>
			</dl>
		{/if}
		{#if note}<p class="note" class:bad={noteBad} role="status">{note}</p>{/if}
	</div>
</Dialog>

<style>
	.tabs {
		display: flex;
		flex-wrap: wrap;
		gap: var(--s-1);
		margin: 0 0 var(--s-4);
		border-bottom: 1px solid var(--line);
	}
	.tabs button {
		min-height: 34px;
		padding: 0 var(--s-3);
		font-size: var(--t-sm);
		font-weight: 500;
		color: var(--text-dim);
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
	}
	.tabs button:hover {
		color: var(--text);
	}
	.tabs button.on {
		color: var(--c-accent);
		border-bottom-color: var(--c-accent);
	}
	.body {
		min-width: min(560px, calc(100vw - 80px));
		min-height: 260px;
		display: grid;
		align-content: start;
		gap: var(--s-3);
		font-size: var(--t-sm);
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
		gap: var(--s-2) var(--s-5);
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s-3);
	}
	.line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--s-2) var(--s-3);
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: var(--s-1);
		color: var(--text-dim);
	}
	input[type='number'] {
		width: 6rem;
	}
	input,
	select {
		font: inherit;
		color: var(--text);
		background: var(--surface-tile);
		border: 1px solid var(--border-subtle);
		border-radius: 6px;
		padding: 2px 6px;
	}
	input[type='checkbox'],
	input[type='radio'] {
		accent-color: var(--c-accent);
	}
	.log {
		margin: 0;
		max-height: 18rem;
		overflow: auto;
		padding: var(--s-2);
		font-size: 11px;
		line-height: 1.45;
		background: var(--surface-tile);
		border-radius: 8px;
		white-space: pre-wrap;
	}
	.log .warn {
		color: var(--c-warning);
	}
	.log .error {
		color: var(--c-danger);
	}
	.log .debug {
		color: var(--text-dim);
	}
	.info {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: var(--s-1) var(--s-4);
		margin: 0;
	}
	.info dt {
		color: var(--text-dim);
	}
	.info dd {
		margin: 0;
	}
	.lock,
	.note {
		margin: 0;
		color: var(--text-dim);
	}
	.note.bad {
		color: var(--c-danger);
	}
</style>
