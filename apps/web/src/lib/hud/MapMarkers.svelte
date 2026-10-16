<script lang="ts">
	import { formatDistance, formatDuration } from '../format';
	import type { Point } from '../hud-controller';
	import type { OrbitInfo } from '../orbit-info';

	let { orbit }: { orbit: OrbitInfo | null } = $props();
	let ap = $state<HTMLElement>();
	let pe = $state<HTMLElement>();
	let ship = $state<HTMLElement>();

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

	/** Moves the markers; called every frame from the render loop, not through reactivity. */
	export function place(
		m: { apoapsis: Point | null; periapsis: Point | null; vessel: Point | null } | null
	): void {
		put(ap, m?.apoapsis);
		put(pe, m?.periapsis);
		put(ship, m?.vessel);
	}
</script>

<div class="layer" aria-hidden="true">
	<div class="m ap" bind:this={ap}>
		<span class="dot"></span>
		<span class="label"
			>Ap {orbit?.apoapsis !== undefined ? formatDistance(orbit.apoapsis) : ''}
			<small
				>{orbit?.timeToApoapsis !== undefined ? formatDuration(orbit.timeToApoapsis) : ''}</small
			></span
		>
	</div>
	<div class="m pe" bind:this={pe}>
		<span class="dot"></span>
		<span class="label"
			>Pe {orbit ? formatDistance(orbit.periapsis) : ''}
			<small
				>{orbit?.timeToPeriapsis !== undefined ? formatDuration(orbit.timeToPeriapsis) : ''}</small
			></span
		>
	</div>
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
	.ship {
		--tone: var(--c-positive);
	}
	.ship .dot {
		background: var(--c-positive);
	}
</style>
