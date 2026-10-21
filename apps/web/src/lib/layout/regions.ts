/**
 * The flight HUD's region table (plan 215, ADR 0205 points 5 and 6): sizes in px at 100 % UI scale
 * (min – default – max), the caps, and the breakpoints. Pure: `layoutFor` says which side panels may
 * be open for a viewport and a UI scale (one side panel since v3, ADR 0253). Plans 214 (panel width), 218
 * (Hangar columns) and 228 (tooltip placement) read the same numbers.
 */

export interface Span {
	min: number;
	default: number;
	max: number;
}

export const REGIONS = {
	/** The dock's open panel (V3 §2.3: 272 by default; ADR 0253 point 1). */
	dock: { min: 260, default: 272, max: 400 } satisfies Span,
	/** The navball module, fixed (V3 §2.4, ADR 0253 point 6). */
	navball: { width: 552, height: 232 },
	/** The staging box at the bottom right (V3 §2.5): fixed width, its list scrolls inside. */
	staging: { width: 260 },
	/** Toasts on screen at once (V3 §2.2). */
	toasts: 2,
	/** The touch target floor in drawer mode, px. */
	touchTarget: 44
} as const;

/** Viewport widths in CSS px at 100 % UI scale (ADR 0205 point 6, revised by ADR 0253 point 8). */
export const BREAKPOINTS = {
	/** At and above: staging at the bottom right, the dock down to the status bar. */
	twoPanels: 1440,
	/** Below: staging stands above the navball module, and the dock stops above it too. */
	onePanel: 1280,
	/** At and below: the dock's targets grow to 44 px (drawers). */
	drawers: 1024
} as const;

export type LayoutMode = 'two' | 'one' | 'drawer';

export interface Layout {
	mode: LayoutMode;
	/** The viewport width the breakpoints were read at: CSS px over the UI scale. */
	width: number;
}

/**
 * The layout for a viewport `width` (CSS px) at UI `scale`. Regions are sized in rem, so the scaled
 * width decides: at 125 % a 1440 px window holds what 1152 px holds at 100 %. Since v3 (ADR 0253)
 * there is one side panel, the dock, so the mode only says where staging and the dock's foot stand.
 */
export function layoutFor(width: number, scale: number): Layout {
	const w = width / (scale > 0 ? scale : 1);
	const mode: LayoutMode =
		w <= BREAKPOINTS.drawers ? 'drawer' : w < BREAKPOINTS.onePanel ? 'one' : 'two';
	return { mode, width: w };
}

/** Clamp a requested width (px at 100 %) to a region's span. */
export const clampSpan = (span: Span, px: number): number =>
	Math.min(span.max, Math.max(span.min, Number.isFinite(px) ? px : span.default));

/** A box in the flight view's own px (left/right/top/bottom from its top-left corner). */
export interface Box {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * The highest the right column (the maneuver card on staging, ADR 0267) may reach: `top` (the
 * safe area's), unless the map toolbar at the top centre reaches into the column's width (a narrow
 * window or a large UI scale); then `gap` px under the toolbar. `column` gives the column's left edge.
 */
export function cornerTop(
	top: number,
	column: Pick<Box, 'left'> | undefined,
	tools: Box | undefined,
	gap = 8
): number {
	if (!column || !tools || tools.bottom <= tools.top) return top;
	if (tools.right + gap <= column.left || tools.bottom + gap <= top) return top;
	return Math.max(top, Math.round(tools.bottom + gap));
}
