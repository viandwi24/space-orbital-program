<script lang="ts">
	import type { Point } from '../hud-controller';
	import type { ManeuverController, ManeuverFrame } from '../maneuver-controller';
	import { HANDLES } from '../maneuver';

	let { controller }: { controller: ManeuverController | null } = $props();

	/** Which nodes exist and which one is selected: changes rarely, so Svelte renders the list. */
	let layout = $state.raw<Array<{ id: number; selected: boolean }>>([]);
	let encounters = $state.raw<Array<{ key: number; text: string; impact: boolean }>>([]);
	let encounterKey = '';
	let key = '';
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

	/** Moves the markers and handles; called every frame from the render loop, not through reactivity. */
	export function place(frame: ManeuverFrame | null): void {
		const list = frame?.nodes ?? [];
		const k = list.map((n) => `${n.id}${n.selected ? '*' : ''}`).join(',');
		if (k !== key) {
			key = k;
			layout = list.map((n) => ({ id: n.id, selected: n.selected }));
		}
		const marks = frame?.encounters ?? [];
		const ek = marks.map((m) => `${m.key}${m.text}`).join('|');
		if (ek !== encounterKey) {
			encounterKey = ek;
			encounters = marks.map((m) => ({ key: m.key, text: m.text, impact: m.impact }));
		}
		for (const m of marks) put(els.get(`e${m.key}`), m.point);
		for (const n of list) {
			put(els.get(`n${n.id}`), n.point);
			for (const h of n.handles) put(els.get(`h${n.id}:${h.kind}`), h.point);
		}
	}

	function move(e: PointerEvent): void {
		controller?.drag(e.clientX, e.clientY, { shift: e.shiftKey, alt: e.altKey });
	}
	function up(): void {
		window.removeEventListener('pointermove', move);
		window.removeEventListener('pointerup', up);
		window.removeEventListener('pointercancel', up);
		controller?.endDrag();
	}
	function begin(
		e: PointerEvent,
		id: number,
		handle: (typeof HANDLES)[number]['kind'] | null
	): void {
		if (!controller || e.button !== 0) return;
		e.preventDefault();
		e.stopPropagation();
		controller.beginDrag(id, handle, e.clientX, e.clientY);
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		window.addEventListener('pointercancel', up);
	}
</script>

<div class="layer">
	{#each encounters as e (e.key)}
		<div class="enc" class:impact={e.impact} use:reg={`e${e.key}`} data-testid="encounter">
			<span class="dot"></span>
			<span class="label">{e.text}</span>
		</div>
	{/each}
	{#each layout as n (n.id)}
		<button
			type="button"
			class="node"
			class:sel={n.selected}
			use:reg={`n${n.id}`}
			aria-label="Maneuver node {n.id}: drag along the orbit to change its time"
			title="Maneuver node: drag to move it along the orbit. Delete removes it."
			onpointerdown={(e) => begin(e, n.id, null)}
		>
			<span class="gem"></span>
		</button>
		{#if n.selected}
			{#each HANDLES as h (h.kind)}
				<button
					type="button"
					class="handle {h.kind}"
					use:reg={`h${n.id}:${h.kind}`}
					aria-label="{h.label} handle: drag outward to add"
					title="{h.label}: drag (Shift coarse, Alt fine)"
					onpointerdown={(e) => begin(e, n.id, h.kind)}
				>
					<svg viewBox="-12 -12 24 24" width="22" height="22" aria-hidden="true">
						{#if h.kind === 'prograde'}
							<circle r="5.5" />
							<path d="M0 -5.5v-6M-5.5 0h-6M5.5 0h6" />
							<circle r="1.5" class="fill" />
						{:else if h.kind === 'retrograde'}
							<circle r="6.5" />
							<path d="M-4 -4l8 8M4 -4l-8 8" />
						{:else if h.kind === 'normal'}
							<path d="M0 -9l8 13h-16Z" class="fill" />
						{:else if h.kind === 'anti-normal'}
							<path d="M0 9l8 -13h-16Z" />
						{:else if h.kind === 'radial-out'}
							<path d="M0 -9l9 9l-9 9l-9 -9Z" class="fill" />
						{:else}
							<path d="M0 -9l9 9l-9 9l-9 -9Z" />
						{/if}
					</svg>
				</button>
			{/each}
		{/if}
	{/each}
</div>

<style>
	.layer {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	button {
		position: absolute;
		left: 0;
		top: 0;
		visibility: hidden;
		padding: 0;
		border: 0;
		background: transparent;
		will-change: transform;
		pointer-events: auto;
		touch-action: none;
		cursor: grab;
	}
	button:active {
		cursor: grabbing;
	}
	.enc {
		position: absolute;
		left: 0;
		top: 0;
		visibility: hidden;
		will-change: transform;
		pointer-events: none;
		color: var(--c-warning);
	}
	.enc.impact {
		color: var(--c-danger);
	}
	.enc .dot {
		position: absolute;
		left: -5px;
		top: -5px;
		width: 10px;
		height: 10px;
		box-sizing: border-box;
		border: 2px solid currentColor;
		border-radius: 50%;
		background: var(--bg-void);
	}
	.enc .label {
		position: absolute;
		left: 10px;
		top: -10px;
		white-space: nowrap;
		padding: 1px var(--s-2);
		font-family: var(--font-num);
		font-size: var(--t-xs);
		color: var(--text);
		background: var(--panel-raised);
		border: 1px solid currentColor;
		border-radius: var(--r-control);
	}
	.node {
		width: 30px;
		height: 30px;
		margin: -15px 0 0 -15px;
		color: var(--c-violet);
	}
	.gem {
		position: absolute;
		inset: 6px;
		box-sizing: border-box;
		background: var(--bg-void);
		border: 2px solid currentColor;
		border-radius: 50%;
		box-shadow: 0 0 0 2px rgb(4 7 11 / 0.7);
	}
	.node.sel .gem {
		background: currentColor;
		box-shadow:
			0 0 0 2px rgb(4 7 11 / 0.7),
			0 0 0 5px rgb(185 162 255 / 0.35);
	}
	.node:focus-visible,
	.handle:focus-visible {
		outline: 2px solid var(--c-accent);
		outline-offset: 2px;
	}
	.handle {
		width: 32px;
		height: 32px;
		margin: -16px 0 0 -16px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: rgb(4 7 11 / 0.72);
		border: 1px solid var(--line-strong);
	}
	.handle:hover {
		border-color: var(--c-accent);
	}
	svg {
		fill: none;
		stroke: currentColor;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	svg :global(.fill) {
		fill: currentColor;
	}
	.prograde,
	.retrograde {
		color: var(--c-positive);
	}
	.normal,
	.anti-normal {
		color: var(--c-violet);
	}
	.radial-out,
	.radial-in {
		color: var(--c-accent);
	}
</style>
