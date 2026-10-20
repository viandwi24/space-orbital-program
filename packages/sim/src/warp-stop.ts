/**
 * Stop the warp for an event the player must see (plan 247): to 1×, with the reason, and the time
 * still to be played at the old rate is dropped. Nothing happens at 1× already, so a caller can
 * report every event without checking.
 */
import type { SimCore } from './core.ts';

export function stopWarp(core: SimCore, reason: string): void {
	if (core.warp <= 1 && core.warpTarget === null) return;
	if (core.warp > 1) core.warpStopped = true;
	core.warp = 1;
	core.warpTarget = null;
	core.events.emit('warp:stopped', { reason });
}
