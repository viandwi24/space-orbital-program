/** Time-warp levels the HUD steps through (plan 206, ADR 0202 point 1): 1×–10× physics, 50×–10k× rails. */
import { SOL_WARP_LEVEL, WARP_LEVELS } from '@orbital/core';

export const WARP_STEPS: readonly number[] = WARP_LEVELS;

/** The levels of a world: a Sol world adds 100k× (default per owner review, rancangan §15 #5). */
export const warpStepsFor = (systemId: string | undefined): readonly number[] =>
	systemId === 'sol' ? [...WARP_LEVELS, SOL_WARP_LEVEL] : WARP_LEVELS;
