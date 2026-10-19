<script lang="ts">
	import { formatDistance } from '../format';
	import type { TargetViewFrame } from '../target-view';

	/** The most other vessels drawn as dots in the map. */
	const POOL = 8;

	let svg = $state<SVGSVGElement>();
	let orbit = $state<SVGPathElement>();
	let pairLine = $state<SVGLineElement>();
	let target = $state<HTMLElement>();
	let targetName = $state<HTMLElement>();
	let caVessel = $state<HTMLElement>();
	let caTarget = $state<HTMLElement>();
	let caLabel = $state<HTMLElement>();
	let flightLabel = $state<HTMLElement>();
	let flightText = $state<HTMLElement>();
	let arrow = $state<HTMLElement>();
	let arrowLabel = $state<HTMLElement>();
	let arrowText = $state<HTMLElement>();
	let dots = $state<HTMLElement[]>([]);

	const hide = (el: HTMLElement | SVGElement | undefined): void => {
		if (el) el.style.visibility = 'hidden';
	};
	const putAt = (el: HTMLElement | undefined, x: number, y: number, hidden = false): void => {
		if (!el) return;
		el.style.visibility = 'visible';
		el.style.opacity = hidden ? '0.4' : '1';
		el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
	};

	/** Moves everything; called every frame from the render loop, not through reactivity (ADR 0026). */
	export function place(f: TargetViewFrame | null): void {
		const map = f?.map ?? null;
		const flight = f?.flight ?? null;

		// Map: the target's marker and name.
		if (map?.target) {
			putAt(target, map.target.point.x, map.target.point.y, map.target.point.hidden);
			if (targetName && targetName.textContent !== map.target.name)
				targetName.textContent = map.target.name;
		} else hide(target);

		// Map: the target's orbit as one path with a subpath per visible run.
		if (orbit && svg) {
			if (map && map.orbit.length > 0) {
				orbit.setAttribute(
					'd',
					map.orbit
						.map((run) =>
							run
								.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
								.join(' ')
						)
						.join(' ')
				);
				orbit.style.visibility = 'visible';
			} else orbit.style.visibility = 'hidden';
		}

		// Map: the vessel and the target at the closest approach, joined by a line.
		const pair = map?.approach ?? null;
		if (pair?.vessel && pair.target) {
			putAt(caVessel, pair.vessel.x, pair.vessel.y, pair.vessel.hidden);
			putAt(caTarget, pair.target.x, pair.target.y, pair.target.hidden);
			putAt(caLabel, (pair.vessel.x + pair.target.x) / 2, (pair.vessel.y + pair.target.y) / 2);
			if (caLabel && caLabel.textContent !== pair.text) caLabel.textContent = pair.text;
			if (pairLine) {
				pairLine.setAttribute('x1', pair.vessel.x.toFixed(1));
				pairLine.setAttribute('y1', pair.vessel.y.toFixed(1));
				pairLine.setAttribute('x2', pair.target.x.toFixed(1));
				pairLine.setAttribute('y2', pair.target.y.toFixed(1));
				pairLine.style.visibility = 'visible';
			}
		} else {
			hide(caVessel);
			hide(caTarget);
			hide(caLabel);
			hide(pairLine);
		}

		// Map: other vessels as dots.
		dots.forEach((dot, i) => {
			const o = map?.others[i];
			if (o) {
				putAt(dot, o.point.x, o.point.y, o.point.hidden);
				dot.dataset.tip = o.name;
			} else hide(dot);
		});

		// Flight view: a label at the target, or an arrow on the edge.
		if (flight && flight.indicator.kind === 'label') {
			putAt(flightLabel, flight.indicator.x, flight.indicator.y, flight.indicator.hidden);
			const text = `${flight.name} ${formatDistance(flight.distance)}`;
			if (flightText && flightText.textContent !== text) flightText.textContent = text;
		} else hide(flightLabel);
		if (flight && flight.indicator.kind === 'arrow' && arrow) {
			const a = flight.indicator;
			arrow.style.visibility = 'visible';
			arrow.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px) rotate(${a.angle}rad)`;
			const text = `${flight.name} ${formatDistance(flight.distance)}`;
			// The text sits just inside the arrow, towards the middle of the view.
			putAt(arrowLabel, a.x - Math.cos(a.angle) * 24, a.y - Math.sin(a.angle) * 24);
			if (arrowText && arrowText.textContent !== text) arrowText.textContent = text;
		} else {
			hide(arrow);
			hide(arrowLabel);
		}
	}
</script>

<div class="layer" aria-hidden="true">
	<svg bind:this={svg} class="svg">
		<path bind:this={orbit} class="orbit" fill="none" />
		<line bind:this={pairLine} class="pair" />
	</svg>
	{#each { length: POOL } as _, i (i)}
		<div class="m other" bind:this={dots[i]}><span class="dot small"></span></div>
	{/each}
	<div class="m ca" bind:this={caVessel}><span class="dot diamond own"></span></div>
	<div class="m ca" bind:this={caTarget}><span class="dot diamond"></span></div>
	<div class="m" bind:this={caLabel}>
		<span class="label ca-label" data-testid="ca-label"></span>
	</div>
	<div class="m tgt" bind:this={target}>
		<span class="dot ring"></span>
		<span class="label" bind:this={targetName} data-testid="target-marker"></span>
	</div>
	<div class="m" bind:this={flightLabel}>
		<span class="dot ring"></span>
		<span class="label" bind:this={flightText} data-testid="target-flight-label"></span>
	</div>
	<div class="m arrow" bind:this={arrow} data-testid="target-arrow"><span class="head"></span></div>
	<div class="m" bind:this={arrowLabel}>
		<span class="label centred" bind:this={arrowText} data-testid="target-arrow-label"></span>
	</div>
</div>

<style>
	.layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
		--tone: var(--c-danger);
	}
	.svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.orbit {
		stroke: var(--tone);
		stroke-width: 1.5;
		stroke-dasharray: 6 5;
		opacity: 0.85;
		visibility: hidden;
	}
	.pair {
		stroke: var(--tone);
		stroke-width: 1;
		stroke-dasharray: 2 3;
		visibility: hidden;
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
		border: 2px solid var(--tone);
		background: var(--bg-void);
	}
	.ring {
		border-radius: 50%;
	}
	.small {
		left: -3px;
		top: -3px;
		width: 6px;
		height: 6px;
		border-radius: 50%;
		border-color: var(--text-dim);
	}
	.diamond {
		transform: rotate(45deg);
		width: 10px;
		height: 10px;
		left: -5px;
		top: -5px;
	}
	.own {
		border-color: var(--c-positive);
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
		border: 1px solid var(--tone);
		border-radius: var(--r-control);
	}
	.centred {
		left: auto;
		right: 0;
		top: -9px;
	}
	.ca-label {
		left: -40px;
		top: 6px;
	}
	.head {
		position: absolute;
		left: -9px;
		top: -9px;
		width: 0;
		height: 0;
		border-top: 9px solid transparent;
		border-bottom: 9px solid transparent;
		border-left: 16px solid var(--tone);
		filter: drop-shadow(0 0 3px rgb(0 0 0 / 0.7));
	}
</style>
