/**
 * Tooltips (plan 228): one tooltip per page, shown for any element with `data-tip` (its text) and
 * optionally `data-tip-term` (a glossary entry it links to). This file is the pure part: where the
 * tooltip goes, and when it shows and hides. `TooltipLayer.svelte` wires it to the page.
 *
 * Timing: hover shows after `TIP_DELAY_MS`, keyboard focus at once, a touch long-press after
 * `LONG_PRESS_MS`; leaving hides after `HIDE_GRACE_MS` unless the pointer or focus moved into the
 * tooltip itself (so its glossary link can be clicked); Escape hides at once.
 */

export const TIP_DELAY_MS = 400;
export const LONG_PRESS_MS = 500;
export const HIDE_GRACE_MS = 150;
/** Space kept between the tooltip and the viewport edge, and between it and its element, px. */
export const TIP_MARGIN = 8;
export const TIP_GAP = 6;

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const overlaps = (a: Rect, b: Rect): boolean =>
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where a tooltip of `size` goes for an element at `target`: above it, else below, else beside it;
 * always inside the viewport, and never over an `avoid` rectangle (the navball, plan 215) when a
 * side keeps it clear.
 */
export function placeTip(
	target: Rect,
	size: { width: number; height: number },
	viewport: { width: number; height: number },
	avoid: readonly Rect[] = []
): { x: number; y: number; side: 'above' | 'below' | 'right' | 'left' } {
	const clampX = (x: number) =>
		Math.max(TIP_MARGIN, Math.min(viewport.width - TIP_MARGIN - size.width, x));
	const clampY = (y: number) =>
		Math.max(TIP_MARGIN, Math.min(viewport.height - TIP_MARGIN - size.height, y));
	const centreX = target.x + target.width / 2 - size.width / 2;
	const centreY = target.y + target.height / 2 - size.height / 2;
	const options = [
		{ side: 'above' as const, x: clampX(centreX), y: target.y - TIP_GAP - size.height },
		{ side: 'below' as const, x: clampX(centreX), y: target.y + target.height + TIP_GAP },
		{ side: 'right' as const, x: target.x + target.width + TIP_GAP, y: clampY(centreY) },
		{ side: 'left' as const, x: target.x - TIP_GAP - size.width, y: clampY(centreY) }
	];
	const fits = (o: { x: number; y: number }) =>
		o.x >= TIP_MARGIN - 0.5 &&
		o.y >= TIP_MARGIN - 0.5 &&
		o.x + size.width <= viewport.width - TIP_MARGIN + 0.5 &&
		o.y + size.height <= viewport.height - TIP_MARGIN + 0.5;
	const clear = (o: { x: number; y: number }) =>
		!avoid.some((r) => overlaps({ x: o.x, y: o.y, ...size }, r));
	const best = options.find((o) => fits(o) && clear(o)) ?? options.find(fits) ?? options[0]!;
	return { side: best.side, x: clampX(best.x), y: clampY(best.y) };
}

/** What the page tells the tooltip; `id` names the element (any stable key). */
export type TipEvent =
	| { type: 'hover'; id: string; now: number }
	| { type: 'focus'; id: string }
	| { type: 'press'; id: string; now: number }
	| { type: 'leave'; id: string; now: number }
	| { type: 'enter-tip' }
	| { type: 'leave-tip'; now: number }
	| { type: 'release' }
	| { type: 'escape' }
	| { type: 'tick'; now: number };

export interface TipState {
	/** The element whose tooltip shows, or null. */
	open: string | null;
	/** A pending show: which element and when. */
	pending: { id: string; at: number } | null;
	/** A pending hide, ms. */
	closing: number | null;
	/** The pointer or focus is inside the tooltip. */
	inside: boolean;
}

export const TIP_IDLE: TipState = { open: null, pending: null, closing: null, inside: false };

/** The next tooltip state. Pure: the page calls `tick` from a timer to let pending changes land. */
export function tipReducer(state: TipState, e: TipEvent): TipState {
	switch (e.type) {
		case 'hover':
			if (state.open === e.id) return { ...state, closing: null };
			return { ...state, pending: { id: e.id, at: e.now + TIP_DELAY_MS }, closing: null };
		case 'press':
			return { ...state, pending: { id: e.id, at: e.now + LONG_PRESS_MS }, closing: null };
		case 'focus':
			return { open: e.id, pending: null, closing: null, inside: false };
		case 'leave':
			if (state.pending?.id === e.id) return { ...state, pending: null };
			if (state.open !== e.id || state.inside) return state;
			return { ...state, closing: e.now + HIDE_GRACE_MS };
		case 'enter-tip':
			return { ...state, inside: true, closing: null };
		case 'leave-tip':
			return { ...state, inside: false, closing: state.open ? e.now + HIDE_GRACE_MS : null };
		case 'release':
			// a long-press let go before it showed is a tap
			return { ...state, pending: null };
		case 'escape':
			return TIP_IDLE;
		case 'tick': {
			let next = state;
			if (next.pending && e.now >= next.pending.at)
				next = { open: next.pending.id, pending: null, closing: null, inside: false };
			if (next.closing !== null && e.now >= next.closing && !next.inside)
				next = { ...next, open: null, closing: null };
			return next;
		}
	}
}
