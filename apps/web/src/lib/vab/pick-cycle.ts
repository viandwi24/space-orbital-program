/**
 * Pick-through (plan 378, ADR 0315 point 5): a click again on the same spot selects the next part
 * behind, front to back, and wraps; a click elsewhere, or later, starts over at the front. Pure.
 */

/** How close (CSS pixels) and how soon (ms) a click counts as "again at the same spot". */
export const AGAIN_PX = 6;
export const AGAIN_MS = 1500;

export interface PickCycle {
	x: number;
	y: number;
	/** Time of the last click, ms. */
	at: number;
	/** Part keys under the pointer, nearest first (the first is what a plain click picks). */
	keys: readonly string[];
	/** The one selected now. */
	i: number;
}

export function nextPick(
	prev: PickCycle | null,
	click: { x: number; y: number; at: number },
	keys: readonly string[]
): PickCycle | null {
	if (keys.length === 0) return null;
	const again =
		prev !== null &&
		Math.hypot(click.x - prev.x, click.y - prev.y) <= AGAIN_PX &&
		click.at - prev.at <= AGAIN_MS &&
		prev.keys.length === keys.length &&
		prev.keys.every((k) => keys.includes(k));
	return {
		x: click.x,
		y: click.y,
		at: click.at,
		keys: again ? prev!.keys : keys,
		i: again ? (prev!.i + 1) % prev!.keys.length : 0
	};
}

/** `keys` with `first` moved to the front (the controller's own pick may reach through a shell). */
export function frontFirst(keys: readonly string[], first: string): string[] {
	return [first, ...keys.filter((k) => k !== first)];
}
