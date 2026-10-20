/**
 * The camera when the vessel it follows is gone (plan 257): a crash removes the vessel, and the view
 * used to fall back to the render origin with the world axes, which can sit below the ground and show
 * only the sky shader's noise. It holds the last place it looked at instead.
 */
export interface Held<T> {
	/** What the view follows now: the live vessel, else the last one it followed. */
	subject: T | undefined;
	/** The memory to keep for the next frame. */
	last: T | undefined;
}

/** `active` while it exists; else the last one seen (flight view only); the map holds nothing. */
export function holdSubject<T>(active: T | undefined, last: T | undefined, map: boolean): Held<T> {
	if (active !== undefined) return { subject: active, last: active };
	if (map) return { subject: undefined, last };
	return { subject: last, last };
}
