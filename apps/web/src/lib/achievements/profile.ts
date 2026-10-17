/**
 * The local achievements profile (plan 102, ADR 0147 points 6 and 7): achievements as data, unlocked
 * across worlds from the firsts the worlds record, kept on this machine and exported as a file.
 */
import {
	achievementMatches,
	type AchievementDefinition,
	type MilestoneRecord
} from '@orbital/core';

export const PROFILE_FORMAT = 'orbital-profile';
export const PROFILE_VERSION = 1;

export interface Unlock {
	/** ISO date-time of the unlock. */
	at: string;
	/** The world it happened in. */
	world: string;
}

export interface Profile {
	format: typeof PROFILE_FORMAT;
	version: typeof PROFILE_VERSION;
	unlocked: Record<string, Unlock>;
}

export const emptyProfile = (): Profile => ({
	format: PROFILE_FORMAT,
	version: PROFILE_VERSION,
	unlocked: {}
});

/**
 * Unlocks every achievement the records match that the profile does not hold yet. Returns the new
 * profile and the newly unlocked achievements, in registration order.
 */
export function unlockFrom(
	profile: Profile,
	achievements: readonly AchievementDefinition[],
	records: readonly Pick<MilestoneRecord, 'kind' | 'body' | 'crewed'>[],
	context: { home: string; world: string; at: string }
): { profile: Profile; unlocked: AchievementDefinition[] } {
	const unlocked = achievements.filter(
		(a) =>
			profile.unlocked[a.id] === undefined &&
			records.some((r) => achievementMatches(a, r, context.home))
	);
	if (unlocked.length === 0) return { profile, unlocked };
	const next: Profile = { ...profile, unlocked: { ...profile.unlocked } };
	for (const a of unlocked) next.unlocked[a.id] = { at: context.at, world: context.world };
	return { profile: next, unlocked };
}

/** An import merges (ADR 0147 point 7): every unlock of both, the earliest where both have one. */
export function mergeProfiles(a: Profile, b: Profile): Profile {
	const unlocked: Record<string, Unlock> = { ...a.unlocked };
	for (const [id, u] of Object.entries(b.unlocked)) {
		const mine = unlocked[id];
		if (!mine || u.at < mine.at) unlocked[id] = { ...u };
	}
	return { ...emptyProfile(), unlocked };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Reads a profile file; throws an Error with a sentence when it is not one. */
export function parseProfile(text: string): Profile {
	let raw: unknown;
	try {
		raw = JSON.parse(text);
	} catch {
		throw new Error('This file is not a profile: it is not JSON.');
	}
	if (!isRecord(raw) || raw.format !== PROFILE_FORMAT)
		throw new Error('This file is not an achievements profile.');
	if (raw.version !== PROFILE_VERSION)
		throw new Error(`This profile has version ${String(raw.version)}; this game reads version 1.`);
	if (!isRecord(raw.unlocked)) throw new Error('This profile has no list of unlocks.');
	const unlocked: Record<string, Unlock> = {};
	for (const [id, u] of Object.entries(raw.unlocked)) {
		if (!isRecord(u) || typeof u.at !== 'string' || typeof u.world !== 'string')
			throw new Error(`The unlock of "${id}" is damaged.`);
		unlocked[id] = { at: u.at, world: u.world };
	}
	return { ...emptyProfile(), unlocked };
}

export const serializeProfile = (p: Profile): string => JSON.stringify(p, null, '\t');
