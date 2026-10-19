<script lang="ts">
	/**
	 * The page's one tooltip (plan 228): any element with `data-tip` shows it on hover (after a
	 * delay), on keyboard focus and on a touch long-press; `data-tip-term` adds a link to the glossary.
	 * Placed inside the viewport and off the navball (`data-tip-avoid`); Escape closes it. The target
	 * points at it with `aria-describedby` while it shows.
	 */
	import { resolve } from '$app/paths';
	import { onMount, tick } from 'svelte';
	import { TIP_IDLE, placeTip, tipReducer, type TipEvent, type TipState } from './tooltip';

	const TIP_ID = 'orbital-tooltip';
	let tipState: TipState = TIP_IDLE;
	let text = $state('');
	let term = $state<string | null>(null);
	let shown = $state(false);
	let pos = $state({ x: -9999, y: -9999 });
	let box = $state<HTMLDivElement | null>(null);

	const ids = new WeakMap<Element, string>();
	const elements = new Map<string, WeakRef<HTMLElement>>();
	let next = 0;
	function idOf(el: HTMLElement): string {
		let id = ids.get(el);
		if (!id) {
			id = `t${next++}`;
			ids.set(el, id);
		}
		elements.set(id, new WeakRef(el));
		return id;
	}
	const tipTarget = (node: EventTarget | null): HTMLElement | null =>
		node instanceof Element ? node.closest<HTMLElement>('[data-tip]') : null;

	let current: HTMLElement | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;

	function dispatch(e: TipEvent): void {
		tipState = tipReducer(tipState, e);
		void sync();
		clearTimeout(timer);
		const due = tipState.pending?.at ?? tipState.closing;
		if (due !== null && due !== undefined)
			timer = setTimeout(
				() => dispatch({ type: 'tick', now: performance.now() }),
				Math.max(0, due - performance.now()) + 5
			);
	}

	async function sync(): Promise<void> {
		const el = tipState.open ? (elements.get(tipState.open)?.deref() ?? null) : null;
		if (el === current) return;
		current?.removeAttribute('aria-describedby');
		current = el;
		if (!el || !el.isConnected) {
			current = null;
			shown = false;
			return;
		}
		text = el.dataset.tip ?? '';
		term = el.dataset.tipTerm ?? null;
		el.setAttribute('aria-describedby', TIP_ID);
		shown = true;
		await tick();
		if (!box || current !== el) return;
		const r = el.getBoundingClientRect();
		const avoid = [...document.querySelectorAll<HTMLElement>('[data-tip-avoid]')].map((a) => {
			const b = a.getBoundingClientRect();
			return { x: b.x, y: b.y, width: b.width, height: b.height };
		});
		pos = placeTip(
			{ x: r.x, y: r.y, width: r.width, height: r.height },
			{ width: box.offsetWidth, height: box.offsetHeight },
			{ width: window.innerWidth, height: window.innerHeight },
			avoid
		);
	}

	onMount(() => {
		const now = () => performance.now();
		const over = (e: PointerEvent) => {
			if (e.pointerType === 'touch') return;
			const el = tipTarget(e.target);
			if (el) dispatch({ type: 'hover', id: idOf(el), now: now() });
		};
		const out = (e: PointerEvent) => {
			const el = tipTarget(e.target);
			if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return;
			dispatch({ type: 'leave', id: idOf(el), now: now() });
		};
		const focusIn = (e: FocusEvent) => {
			const el = tipTarget(e.target);
			// keyboard focus only: a click that focuses a button is the hover's business
			if (el && el.matches(':focus-visible')) dispatch({ type: 'focus', id: idOf(el) });
		};
		const focusOut = (e: FocusEvent) => {
			const el = tipTarget(e.target);
			if (el) dispatch({ type: 'leave', id: idOf(el), now: now() });
		};
		const down = (e: PointerEvent) => {
			if (e.pointerType !== 'touch') return;
			const el = tipTarget(e.target);
			if (el) dispatch({ type: 'press', id: idOf(el), now: now() });
		};
		const up = () => dispatch({ type: 'release' });
		const key = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && tipState.open) dispatch({ type: 'escape' });
		};
		const opts = { capture: true, passive: true } as const;
		document.addEventListener('pointerover', over, opts);
		document.addEventListener('pointerout', out, opts);
		document.addEventListener('focusin', focusIn, true);
		document.addEventListener('focusout', focusOut, true);
		document.addEventListener('pointerdown', down, opts);
		document.addEventListener('pointerup', up, opts);
		document.addEventListener('pointercancel', up, opts);
		document.addEventListener('keydown', key, true);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('pointerover', over, true);
			document.removeEventListener('pointerout', out, true);
			document.removeEventListener('focusin', focusIn, true);
			document.removeEventListener('focusout', focusOut, true);
			document.removeEventListener('pointerdown', down, true);
			document.removeEventListener('pointerup', up, true);
			document.removeEventListener('pointercancel', up, true);
			document.removeEventListener('keydown', key, true);
		};
	});
</script>

{#if shown}
	<div
		bind:this={box}
		id={TIP_ID}
		class="tip"
		role="tooltip"
		data-testid="tooltip"
		style:left="{pos.x}px"
		style:top="{pos.y}px"
		onpointerenter={() => dispatch({ type: 'enter-tip' })}
		onpointerleave={() => dispatch({ type: 'leave-tip', now: performance.now() })}
		onfocusin={() => dispatch({ type: 'enter-tip' })}
		onfocusout={() => dispatch({ type: 'leave-tip', now: performance.now() })}
	>
		<span>{text}</span>
		{#if term}<a href="{resolve('/glossary')}#{term}" data-testid="tooltip-more"
				>More in the glossary</a
			>{/if}
	</div>
{/if}

<style>
	.tip {
		position: fixed;
		z-index: 1000;
		max-width: 18rem;
		padding: 0.5rem 0.625rem;
		border-radius: var(--radius-tile, 0.5rem);
		border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
		background: var(--surface-solid, #16171a);
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
		color: var(--text, #fff);
		/* never under the 10 px text floor (ADR 0205), whatever the UI scale */
		font-size: max(10px, var(--t-xs, 0.75rem));
		line-height: 1.35;
		pointer-events: auto;
	}
	.tip a {
		display: block;
		margin-top: 0.25rem;
		color: var(--accent-text, #9ec5ff);
		font-weight: 600;
	}
</style>
