/**
 * The flight HUD's region table (plan 215, ADR 0205 points 5 and 6): sizes in px at 100 % UI scale
 * (min – default – max), the caps, and the breakpoints. Pure: `layoutFor` says which side panels may
 * be open for a viewport, a UI scale and what the player asked for. Plans 214 (panel width), 218
 * (Hangar columns) and 228 (tooltip placement) read the same numbers.
 */

export interface Span {
	min: number;
	default: number;
	max: number;
}

export const REGIONS = {
	/** The left dock's panel. */
	dock: { min: 260, default: 280, max: 400 } satisfies Span,
	/** The vessel panel (ADR 0205 point 1). */
	vessel: { min: 300, default: 340, max: 440 } satisfies Span,
	/** The navball module, fixed (ADR 0144). */
	navball: { width: 390, height: 262 },
	/** The staging stack: its height is capped and it scrolls inside. */
	staging: { min: 200, default: 220, max: 280 } satisfies Span,
	/** Rows of the crew panel before it scrolls. */
	crewRows: 3,
	/** Toasts on screen at once. */
	toasts: 4,
	/** The touch target floor in drawer mode, px. */
	touchTarget: 44
} as const;

/** Viewport widths in CSS px at 100 % UI scale (ADR 0205 point 6). */
export const BREAKPOINTS = {
	/** At and above: both side panels may be open (and from 1280 to 1439 too, as before plan 215). */
	twoPanels: 1440,
	/** Below: one side panel at a time; opening one closes the other. */
	onePanel: 1280,
	/** At and below: side panels are drawers with 44 px targets. */
	drawers: 1024
} as const;

export type LayoutMode = 'two' | 'one' | 'drawer';
export type SidePanel = 'dock' | 'vessel';

export interface Layout {
	mode: LayoutMode;
	/** The viewport width the breakpoints were read at: CSS px over the UI scale. */
	width: number;
	/** The side panels open after the rule. */
	open: Record<SidePanel, boolean>;
}

/**
 * The layout for a viewport `width` (CSS px) at UI `scale`. Regions are sized in rem, so the scaled
 * width decides: at 125 % a 1440 px window holds what 1152 px holds at 100 % (one panel). With one
 * panel allowed and both asked for, the one opened `last` stays.
 */
export function layoutFor(
	width: number,
	scale: number,
	asked: Record<SidePanel, boolean>,
	last: SidePanel = 'vessel'
): Layout {
	const w = width / (scale > 0 ? scale : 1);
	const mode: LayoutMode =
		w <= BREAKPOINTS.drawers ? 'drawer' : w < BREAKPOINTS.onePanel ? 'one' : 'two';
	const open = { ...asked };
	if (mode !== 'two' && open.dock && open.vessel) {
		if (last === 'dock') open.vessel = false;
		else open.dock = false;
	}
	return { mode, width: w, open };
}

/** Clamp a requested width (px at 100 %) to a region's span. */
export const clampSpan = (span: Span, px: number): number =>
	Math.min(span.max, Math.max(span.min, Number.isFinite(px) ? px : span.default));
