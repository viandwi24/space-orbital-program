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

/** The deck's height before it is measured (the compact deck with a target line, plan 035). */
export const DECK_FALLBACK = 262;

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
export function throttleAnchor(
	viewport: Viewport,
	deckHeight: number,
	scriptOpen: boolean,
	leftStackBottom: number
): { left: number; centre: number } {
	const left = scriptOpen ? EDGE + scriptPanelWidth(viewport.width) + EDGE : EDGE - 4;
	const spanTop = scriptOpen ? EDGE : Math.max(EDGE, leftStackBottom + EDGE);
	const spanBottom = Math.max(spanTop, viewport.height - Math.max(0, deckHeight) - EDGE);
	return { left, centre: (spanTop + spanBottom) / 2 };
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
