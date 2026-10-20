/**
 * A refused throttle is sent again when the warp changes (plan 257): the sim refuses one during rails
 * warp or without a free physics frame, and the page had already counted it as sent, so after the warp
 * dropped to 1x the engine stayed cold until the throttle was cut and raised.
 */
export interface ThrottleLink {
	/** The warp when the sim last refused a throttle, or null while none is waiting. */
	refusedAtWarp: number | null;
}

export const fresh = (): ThrottleLink => ({ refusedAtWarp: null });

/** The sim refused the throttle sent at `warp`. */
export const refused = (link: ThrottleLink, warp: number): void => {
	link.refusedAtWarp = warp;
};

/** True once, when the warp is no longer what it was at the refusal: send the throttle again. */
export function shouldResend(link: ThrottleLink, warp: number): boolean {
	if (link.refusedAtWarp === null || warp === link.refusedAtWarp) return false;
	link.refusedAtWarp = null;
	return true;
}
