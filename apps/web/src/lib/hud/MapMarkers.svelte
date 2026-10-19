<script lang="ts">
	import { formatDistance, formatDuration } from '../format';
	import type { NavNodeFrame, Point } from '../hud-controller';
	import type { PlannedApsisDraw } from '../maneuver-controller';
	import type { OrbitInfo } from '../orbit-info';
	import type { NavMark } from '../nav-markers';

	let {
		orbit,
		now = 0,
		onwarp,
		onalarm
	}: {
		orbit: OrbitInfo | null;
		/** Sim time, for the countdowns of the node and planned markers. */
		now?: number;
		onwarp?: (mark: NavMark) => void;
		onalarm?: (mark: NavMark) => void;
	} = $props();
	let ap = $state<HTMLElement>();
	let pe = $state<HTMLElement>();
	let ship = $state<HTMLElement>();

	/** The node and planned markers there are: changes rarely, so Svelte renders the list. */
	let extra = $state.raw<
		Array<{ key: string; kind: NavMark['kind']; planned: boolean; text: string; time: number }>
	>([]);
	let extraKey = '';
	let open = $state<string | null>(null);
	const els = new Map<string, HTMLElement>();

	function reg(node: HTMLElement, name: string) {
		els.set(name, node);
		return {
			destroy() {
				els.delete(name);
			}
		};
	}

	const put = (el: HTMLElement | undefined, p: Point | null | undefined): void => {
		if (!el) return;
		if (!p) {
			el.style.visibility = 'hidden';
			return;
		}
		el.style.visibility = 'visible';
		el.style.opacity = p.hidden ? '0.4' : '1';
		el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
	};

	const NODE_TEXT = { ascending: 'AN', descending: 'DN' } as const;

	/** Moves the markers; called every frame from the render loop, not through reactivity. */
	export function place(
		m: {
			apoapsis: Point | null;
			periapsis: Point | null;
			vessel: Point | null;
			nodes?: NavNodeFrame[];
		} | null,
		apsides: readonly PlannedApsisDraw[] = []
	): void {
		put(ap, m?.apoapsis);
		put(pe, m?.periapsis);
		put(ship, m?.vessel);
		const nodes = m?.nodes ?? [];
		const list = [
			...nodes.map((n) => ({
				key: n.kind,
				kind: n.kind,
				planned: false,
				text: `${NODE_TEXT[n.kind]}${n.relativeTo === 'target' ? ' (target)' : ''}`,
				time: n.time,
				point: n.point
			})),
			...apsides.map((a) => ({
				key: `p${a.key}`,
				kind: a.kind,
				planned: true,
				text: `${a.kind === 'apoapsis' ? 'Ap' : 'Pe'} ${formatDistance(Math.max(0, a.altitude))}`,
				time: a.time,
				point: a.point
			}))
		];
		// times drift by fractions of a second between frames: the list is keyed by whole seconds
		const k = list.map((x) => `${x.key}|${x.text}|${Math.round(x.time)}`).join(',');
		if (k !== extraKey) {
			extraKey = k;
			extra = list.map(({ point: _point, ...rest }) => rest);
		}
		for (const x of list) put(els.get(x.key), x.point);
	}

	/** Times of the current apsides, for the menu. */
	const apsisTimes = $derived({
		apoapsis: orbit?.timeToApoapsis !== undefined ? now + orbit.timeToApoapsis : 0,
		periapsis: orbit?.timeToPeriapsis !== undefined ? now + orbit.timeToPeriapsis : 0
	});

	const LABEL: Record<NavMark['kind'], string> = {
		apoapsis: 'Apoapsis',
		periapsis: 'Periapsis',
		ascending: 'Ascending node',
		descending: 'Descending node'
	};

	function act(e: MouseEvent, what: 'warp' | 'alarm', mark: Omit<NavMark, 'label'>): void {
		e.stopPropagation();
		open = null;
		const full = { ...mark, label: `${mark.planned ? 'Planned ' : ''}${LABEL[mark.kind]}` };
		(what === 'warp' ? onwarp : onalarm)?.(full);
	}

	function toggle(e: MouseEvent, key: string): void {
		e.stopPropagation();
		open = open === key ? null : key;
	}
</script>

{#snippet menu(key: string, mark: Omit<NavMark, 'label'>)}
	{#if onwarp || onalarm}
		<button
			type="button"
			class="hit"
			aria-label={`${LABEL[mark.kind]} actions`}
			aria-expanded={open === key}
			data-testid={`mark-${key}`}
			onpointerdown={(e) => e.stopPropagation()}
			onclick={(e) => toggle(e, key)}
		></button>
		{#if open === key}
			<div class="menu" role="menu">
				{#if onwarp}
					<button
						type="button"
						role="menuitem"
						data-testid={`mark-${key}-warp`}
						onpointerdown={(e) => e.stopPropagation()}
						onclick={(e) => act(e, 'warp', mark)}>Warp here</button
					>
				{/if}
				{#if onalarm}
					<button
						type="button"
						role="menuitem"
						data-testid={`mark-${key}-alarm`}
						onpointerdown={(e) => e.stopPropagation()}
						onclick={(e) => act(e, 'alarm', mark)}>Add alarm</button
					>
				{/if}
			</div>
		{/if}
	{/if}
{/snippet}

<div class="layer">
	<div class="m ap" bind:this={ap}>
		<span class="dot"></span>
		<span class="label"
			>Ap {orbit?.apoapsis !== undefined ? formatDistance(orbit.apoapsis) : ''}
			<small
				>{orbit?.timeToApoapsis !== undefined ? formatDuration(orbit.timeToApoapsis) : ''}</small
			></span
		>
		{@render menu('ap', { kind: 'apoapsis', planned: false, time: apsisTimes.apoapsis })}
	</div>
	<div class="m pe" bind:this={pe}>
		<span class="dot"></span>
		<span class="label"
			>Pe {orbit ? formatDistance(orbit.periapsis) : ''}
			<small
				>{orbit?.timeToPeriapsis !== undefined ? formatDuration(orbit.timeToPeriapsis) : ''}</small
			></span
		>
		{@render menu('pe', { kind: 'periapsis', planned: false, time: apsisTimes.periapsis })}
	</div>
	{#each extra as x (x.key)}
		<div
			class="m"
			class:node={!x.planned}
			class:planned={x.planned}
			data-testid={`marker-${x.key}`}
			data-time={x.time}
			use:reg={x.key}
		>
			<span class="dot"></span>
			<span class="label">{x.text} <small>{formatDuration(Math.max(0, x.time - now))}</small></span>
			{@render menu(x.key, { kind: x.kind, planned: x.planned, time: x.time })}
		</div>
	{/each}
	<div class="m ship" bind:this={ship}>
		<span class="dot"></span>
	</div>
</div>

<style>
	.layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.m {
		position: absolute;
		left: 0;
		top: 0;
		visibility: hidden;
		will-change: transform;
	}
	.dot {
		position: absolute;
		left: -6px;
		top: -6px;
		width: 12px;
		height: 12px;
		box-sizing: border-box;
		border-radius: 50%;
		border: 2px solid var(--tone);
		background: var(--bg-void);
	}
	.hit {
		position: absolute;
		left: -11px;
		top: -11px;
		width: 22px;
		height: 22px;
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: transparent;
		cursor: pointer;
		pointer-events: auto;
	}
	.hit:focus-visible {
		outline: 2px solid var(--tone);
	}
	.menu {
		position: absolute;
		left: 12px;
		top: 12px;
		display: grid;
		min-width: 8rem;
		padding: 2px;
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
		pointer-events: auto;
		z-index: 1;
	}
	.menu button {
		padding: 4px var(--s-2);
		font: inherit;
		font-size: var(--t-xs);
		text-align: left;
		color: var(--text);
		background: transparent;
		border: 0;
		border-radius: var(--r-control);
		cursor: pointer;
	}
	.menu button:hover,
	.menu button:focus-visible {
		background: var(--surface-hover);
	}
	.label {
		position: absolute;
		left: 12px;
		top: -11px;
		white-space: nowrap;
		padding: 1px var(--s-2);
		font-family: var(--font-num);
		font-size: var(--t-xs);
		color: var(--text);
		background: var(--panel-raised);
		border: 1px solid var(--line-strong);
		border-radius: var(--r-control);
	}
	small {
		margin-left: 4px;
		color: var(--text-dim);
	}
	.ap {
		--tone: var(--c-accent);
	}
	.pe {
		--tone: var(--c-warning);
	}
	.node {
		--tone: var(--mnv-normal);
	}
	.planned {
		--tone: var(--mnv-prograde);
	}
	.planned .dot {
		border-style: dashed;
	}
	.ship {
		--tone: var(--c-positive);
	}
	.ship .dot {
		background: var(--c-positive);
	}
</style>
