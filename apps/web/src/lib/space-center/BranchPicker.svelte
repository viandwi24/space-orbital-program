<script lang="ts">
	/**
	 * Found a branch (plan 236, ADR 0229 point 7): a map of the home planet from its terrain (sea,
	 * coast, land by height), the sites with the ground a new zone may not enter, and the picked spot
	 * with its latitude, terrain, what lies east, the rotation boost, the nearest site, the cost and
	 * the build time. The arrow keys move the spot a degree; Enter founds.
	 */
	import Button from '../ui/Button.svelte';
	import Dialog from '../ui/Dialog.svelte';
	import {
		branchMapPixels,
		branchSpot,
		keepOut,
		latLonText,
		latLonToMap,
		MAP_HEIGHT,
		MAP_WIDTH,
		mapToLatLon,
		type BranchContext
	} from './branch-model';

	let {
		open,
		ctx,
		onfound,
		onclose
	}: {
		open: boolean;
		ctx: BranchContext;
		onfound: (spot: {
			name: string;
			latitude: number;
			longitude: number;
		}) => Promise<string | null>;
		onclose: () => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let picked = $state<{ latitude: number; longitude: number } | null>(null);
	let name = $state('');
	let busy = $state(false);
	let refused = $state<string | null>(null);
	const spot = $derived(picked ? branchSpot(picked.latitude, picked.longitude, ctx) : null);
	const homeSites = $derived(ctx.sites.filter((s) => s.body === ctx.home.id));
	const cost = $derived(ctx.hq?.levels[0]?.cost ?? 0);
	const days = $derived(ctx.hq?.levels[0]?.buildDays ?? 0);

	// the map is drawn once per open: about 65 000 terrain reads
	let drawnFor = '';
	$effect(() => {
		if (!open || !canvas) return;
		const key = `${ctx.terrain.seed}:${ctx.terrain.radius}:${homeSites.length}`;
		if (key === drawnFor) return;
		drawnFor = key;
		const g = canvas.getContext('2d');
		if (!g) return;
		g.putImageData(
			new ImageData(
				branchMapPixels(ctx.terrain, MAP_WIDTH, MAP_HEIGHT, homeSites),
				MAP_WIDTH,
				MAP_HEIGHT
			),
			0,
			0
		);
	});

	const px = (latitude: number, longitude: number) => {
		const p = latLonToMap(latitude, longitude);
		return { left: `${(p.x / MAP_WIDTH) * 100}%`, top: `${(p.y / MAP_HEIGHT) * 100}%` };
	};
	/** A keep-out circle's size on the map: its angle over 2π of the width and π of the height. */
	const ringW = (m: number) => `${((m / ctx.home.radius / Math.PI) * 100).toFixed(2)}%`;
	const ringH = (m: number) => `${((2 * m) / ctx.home.radius / Math.PI) * 100}%`;

	function pick(e: MouseEvent): void {
		// the click's own offset over the canvas's layout size: the dialog may still be scaling in,
		// which a client rect would read
		if (!canvas || canvas.clientWidth === 0) return;
		const x = (e.offsetX / canvas.clientWidth) * MAP_WIDTH;
		const y = (e.offsetY / canvas.clientHeight) * MAP_HEIGHT;
		picked = mapToLatLon(Math.floor(x), Math.floor(y));
		refused = null;
	}
	function nudge(e: KeyboardEvent): void {
		const deg = Math.PI / 180;
		const at = picked ?? { latitude: 0, longitude: 0 };
		const step: Record<string, [number, number]> = {
			ArrowUp: [deg, 0],
			ArrowDown: [-deg, 0],
			ArrowLeft: [0, -deg],
			ArrowRight: [0, deg]
		};
		const s = step[e.key];
		if (s) {
			e.preventDefault();
			picked = {
				latitude: Math.max(-Math.PI / 2 + deg, Math.min(Math.PI / 2 - deg, at.latitude + s[0])),
				longitude: at.longitude + s[1]
			};
			refused = null;
		} else if (e.key === 'Enter' && spot && !spot.problem) {
			e.preventDefault();
			void found();
		}
	}
	async function found(): Promise<void> {
		if (!spot || spot.problem || busy) return;
		busy = true;
		refused = await onfound({
			name: name.trim() || `Branch ${homeSites.length}`,
			latitude: spot.latitude,
			longitude: spot.longitude
		});
		busy = false;
	}
	const km = (m: number) => `${Math.round(m / 1000).toLocaleString('en-US')} km`;
	const GROUND = { sea: 'Sea', coast: 'Coast', land: 'Land' } as const;
	const DOWNRANGE = { sea: 'sea', land: 'land', mixed: 'land and sea' } as const;
</script>

<Dialog {open} title="Found a branch" {onclose}>
	<div class="picker" data-testid="branch-picker">
		<button
			type="button"
			class="map"
			aria-label="Home planet map: click or use the arrow keys to pick a spot"
			data-testid="branch-map"
			onclick={pick}
			onkeydown={nudge}
		>
			<canvas bind:this={canvas} width={MAP_WIDTH} height={MAP_HEIGHT}></canvas>
			{#each homeSites as s (s.id)}
				<span
					class="keep"
					style:left={px(s.latitude, s.longitude).left}
					style:top={px(s.latitude, s.longitude).top}
					style:width={ringW(keepOut(s))}
					style:height={ringH(keepOut(s))}
					title="{s.name}: no new zone within {km(keepOut(s))}"
				></span>
				<span
					class="site"
					style:left={px(s.latitude, s.longitude).left}
					style:top={px(s.latitude, s.longitude).top}
					title={s.name}
				></span>
			{/each}
			{#if spot}
				<span
					class="pin"
					class:bad={spot.problem !== null}
					style:left={px(spot.latitude, spot.longitude).left}
					style:top={px(spot.latitude, spot.longitude).top}
				></span>
			{/if}
		</button>
		{#if spot}
			<dl class="facts" data-testid="branch-spot">
				<dt>Place</dt>
				<dd>{latLonText(spot.latitude, spot.longitude)}</dd>
				<dt>Ground</dt>
				<dd>{GROUND[spot.terrain.ground]}</dd>
				<dt>East of it</dt>
				<dd>{DOWNRANGE[spot.consequences.downrange]}</dd>
				<dt>Rotation boost</dt>
				<dd>{Math.round(spot.consequences.rotationBoost)} m/s</dd>
				<dt>Lowest orbit inclination</dt>
				<dd>{((spot.consequences.minInclination * 180) / Math.PI).toFixed(1)}°</dd>
				<dt>Nearest site</dt>
				<dd>
					{spot.consequences.nearestSite === null ? 'none' : km(spot.consequences.nearestSite)}
				</dd>
				<dt>Cost</dt>
				<dd>
					{ctx.funds === undefined ? 'free (economy off)' : `${cost.toLocaleString('en-US')} funds`}
					· HQ ready in {days} days
				</dd>
			</dl>
			{#if spot.problem}<p class="why" data-testid="branch-why">{spot.problem}</p>{/if}
		{:else}
			<p class="hint">Pick a spot on land, away from the other sites (the rings).</p>
		{/if}
		{#if refused}<p class="why" role="alert">{refused}</p>{/if}
		<label class="name"
			>Name <input
				bind:value={name}
				maxlength="60"
				placeholder="Branch {homeSites.length}"
				data-testid="branch-name"
			/></label
		>
		<div class="row">
			<Button variant="ghost" onclick={onclose}>Cancel</Button>
			<Button
				variant="primary"
				disabled={!spot || spot.problem !== null || busy}
				onclick={() => void found()}
				data-testid="branch-found">{busy ? 'Founding…' : 'Found the branch'}</Button
			>
		</div>
	</div>
</Dialog>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: min(36rem, calc(100vw - 4rem));
	}
	.map {
		display: block;
		width: 100%;
		padding: 0;
		border: 0;
		background: none;
		position: relative;
		aspect-ratio: 2 / 1;
		border-radius: 10px;
		overflow: hidden;
		cursor: crosshair;
		outline-offset: 2px;
	}
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		image-rendering: auto;
	}
	.keep,
	.site,
	.pin {
		position: absolute;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		pointer-events: none;
	}
	.keep {
		border: 1px dashed rgb(255 255 255 / 0.7);
		background: rgb(255 255 255 / 0.08);
	}
	.site {
		width: 8px;
		height: 8px;
		background: #fff;
	}
	.pin {
		width: 12px;
		height: 12px;
		border: 2px solid #fff;
		background: var(--accent);
	}
	.pin.bad {
		background: #ff5a5f;
	}
	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 1rem;
		margin: 0;
		font-size: var(--t-small);
	}
	.facts dt {
		color: var(--text-muted);
	}
	.facts dd {
		margin: 0;
		color: var(--text-primary);
	}
	.why {
		margin: 0;
		color: var(--c-warning);
		font-size: var(--t-small);
	}
	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--t-small);
	}
	.name {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: var(--t-small);
		color: var(--text-secondary);
	}
	.name input {
		flex: 1;
		font: inherit;
		color: var(--text-primary);
		background: var(--surface-tile);
		border: 1px solid var(--border-subtle);
		border-radius: var(--radius-tile);
		padding: 0.4rem 0.6rem;
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
