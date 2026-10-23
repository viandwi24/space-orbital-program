/**
 * A mod's post-processing profile (plan 405, ADR 0345) as the knobs the two renderers' post chains
 * have: bloom's strength, radius and threshold, and a factor on the exposure. Pure.
 */
import type { PostProfileDefinition } from '@orbital/core';

/** The stock bloom of both renderers. */
export const STOCK_BLOOM = { strength: 0.32, radius: 0.55, threshold: 3.0 } as const;

export interface PostLook {
	bloom: { strength: number; radius: number; threshold: number };
	exposure: number;
}

/** The look a profile asks for: its values, the stock ones where it names none; none is the stock look. */
export function postLook(
	profile: Pick<PostProfileDefinition, 'bloom' | 'exposure'> | undefined
): PostLook {
	return {
		bloom: { ...STOCK_BLOOM, ...profile?.bloom },
		exposure: profile?.exposure ?? 1
	};
}

/** The profile the world draws: the last one registered (the mods load after the stock content). */
export function activeProfile<T>(profiles: readonly T[] | undefined): T | undefined {
	return profiles && profiles.length > 0 ? profiles[profiles.length - 1] : undefined;
}
