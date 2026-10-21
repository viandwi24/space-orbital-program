/**
 * Small-screen layout as numbers (plan 055, ADR 0091). Pure: the viewport and the measured
 * instrument deck in, the clearances the flight screen's panels keep out. The flight page measures
 * and paints; the rules live here so they can be tested without a browser.
 */
import { MIN_VIEWPORT } from '../touch/touch-model';

export interface Viewport {
	width: number;
	height: number;
}

/** Margin between the screen edge and a panel: the refs HUD margin (`--margin-hud`, 24 px; plan 088). */
export const EDGE = 24;
/** Gap between a column and the deck under it (`--panel-gap`). */
export const GAP = 12;

/** The deck's height before it is measured: the v3 navball module (V3 §2.4, plan 272). */
export const DECK_FALLBACK = 232;

/** The script panel's width: 420 px, never more than 46 % of the screen (CSS had `min(420px, 46vw)`). */
export function scriptPanelWidth(viewportWidth: number): number {
	return Math.min(420, Math.max(0, viewportWidth) * 0.46);
}

/**
 * The height a column may take above the instrument deck: the screen minus the deck, the top margin
 * and a gap. Anything taller scrolls inside its own box instead of sliding under the deck.
 */
export function aboveDeckHeight(viewportHeight: number, deckHeight: number): number {
	if (!Number.isFinite(viewportHeight) || !Number.isFinite(deckHeight)) return 0;
	return Math.max(0, viewportHeight - Math.max(0, deckHeight) - 2 * EDGE - GAP);
}

/**
 * Where the touch throttle sits. Its left edge clears the script panel when that is open. Its
 * vertical centre is the middle of the free span at the left edge: below the top-left stack (the
 * menu bar and the first-flight guide, `leftStackBottom`) when the script panel is closed, below the
 * top margin when it is open and the throttle stands beside it, and always above the deck.
 */
/** The shortest track the touch throttle draws, px (`TouchControls`: 72 to 150). */
export const MIN_THROTTLE_ROOM = 72;

export function throttleAnchor(
	viewport: Viewport,
	deckHeight: number,
	scriptOpen: boolean,
	leftStackBottom: number,
	/** Right edge of the open dock panel (plan 112), px; 0 when no panel is open. */
	dockRight = 0,
	/**
	 * The staging stack when it stands in the left column (narrow screens), px; absent when it does
	 * not (plan 215): the throttle goes above it, or beside it when the room above is too short.
	 */
	staging?: { top: number; right: number }
): { left: number; centre: number; room: number } {
	// beside an open panel the throttle has the full height; otherwise it sits under the left stack
	const beside = dockRight > 0 || scriptOpen;
	let left =
		dockRight > 0
			? dockRight + EDGE
			: scriptOpen
				? EDGE + scriptPanelWidth(viewport.width) + EDGE
				: EDGE - 4;
	const spanTop = beside ? EDGE : Math.max(EDGE, leftStackBottom + EDGE);
	const floor = viewport.height - Math.max(0, deckHeight) - EDGE;
	let spanBottom = floor;
	if (staging && staging.top > 0 && left < staging.right) {
		// the staging stack stands in the left column (narrow screens): above it when there is room,
		// else beside it, still under the left stack and down to the deck
		if (staging.top - EDGE - spanTop >= MIN_THROTTLE_ROOM) spanBottom = staging.top - EDGE;
		else left = staging.right + EDGE;
	}
	spanBottom = Math.max(spanTop, spanBottom);
	// `room`: the free height, so the throttle can shorten its track where the span is short
	return { left, centre: (spanTop + spanBottom) / 2, room: spanBottom - spanTop };
}

/** What kind of small screen this is, for the wording of the notice. `ok` shows no notice. */
export type ScreenClass =
	'ok' | 'phone-portrait' | 'phone-landscape' | 'tablet-portrait' | 'small-window';

/** Shorter side under this is a phone; a tablet's shorter side is 600 CSS px or more. */
export const PHONE_SHORT_SIDE = 600;

export function classifyScreen(viewport: Viewport): ScreenClass {
	const { width, height } = viewport;
	const small = width < MIN_VIEWPORT.width || height < MIN_VIEWPORT.height;
	if (!small) return 'ok';
	const portrait = height > width;
	if (Math.min(width, height) < PHONE_SHORT_SIDE)
		return portrait ? 'phone-portrait' : 'phone-landscape';
	return portrait ? 'tablet-portrait' : 'small-window';
}

/** The notice text per class: what is wrong, what to do, and what is not promised. */
export function smallScreenAdvice(cls: ScreenClass): string {
	const need = `A tablet in landscape or a computer, at least ${MIN_VIEWPORT.width} × ${MIN_VIEWPORT.height} pixels, is what the game is made for.`;
	switch (cls) {
		case 'ok':
			return '';
		case 'phone-portrait':
			return `Turn the phone to landscape first. ${need} Phones are not supported: the flight screen may not fit.`;
		case 'phone-landscape':
			return `${need} Phones are not supported: panels may overlap and the on-screen controls are made for a larger screen.`;
		case 'tablet-portrait':
			return `Turn the tablet to landscape. ${need}`;
		case 'small-window':
			return `Make the window larger. ${need}`;
	}
}

/** A measured box in the flight page's frame, px. */
export interface MeasuredBox {
	left: number;
	right: number;
	top: number;
	bottom: number;
	width: number;
	height: number;
}

const shown = (b: MeasuredBox | undefined): b is MeasuredBox =>
	b !== undefined && b.width > 0 && b.height > 0;

/**
 * The clearances the camera keeps when it centres the vessel in the free area (plan 215, plan 256):
 * the time bar's foot at the top, the instrument deck's top at the bottom, the side panels when the
 * player asked to centre in the free area. A panel that is hidden (the navball module takes its
 * deck out with `display: none`, so it measures as an empty box at the origin) leaves no clearance:
 * hiding it frees its space and the vessel moves down into it, not up.
 */
export function viewInsets(args: {
	frame: Viewport;
	/** The time bar. */
	bar?: MeasuredBox;
	/** The instrument deck. */
	deck?: MeasuredBox;
	/** The side panel on the right. */
	right?: MeasuredBox;
	/** Right edge of the left stack and open dock panel, 0 for none. */
	dockRight: number;
	/** Centre the vessel in the area the side panels leave free (`settings.ui.centreVessel`). */
	centre: boolean;
}): { top: number; right: number; bottom: number; left: number } {
	const { frame, bar, deck, right, dockRight, centre } = args;
	const top = shown(bar) ? bar.bottom + 8 : 0;
	const bottom = shown(deck) ? Math.max(0, frame.height - deck.top + 8) : 0;
	const side = shown(right) ? Math.max(0, frame.width - right.left + 8) : 0;
	return { top, right: centre ? side : 0, bottom, left: centre ? dockRight : 0 };
}
