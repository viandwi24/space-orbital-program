/**
 * Stop the warp for an event the player must see (plan 247): to 1×, with the reason. The frame in
 * progress plays out at the old rate (a stop is not a rewind). Nothing happens at 1× already, so a caller can
 * report every event without checking.
 */
import type { SimCore } from './core.ts';

export function stopWarp(core: SimCore, reason: string): void {
	if (core.warp <= 1 && core.warpTarget === null) return;
	core.warp = 1;
	core.warpTarget = null;
	core.events.emit('warp:stopped', { reason });
}
