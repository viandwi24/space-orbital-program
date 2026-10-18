/**
 * Unlocking during a flight (plan 102, ADR 0147 point 6): each first the worker reports, and the
 * loaded world's records once, are checked against the achievements; writes are queued in order.
 */
import type { AchievementDefinition, MilestoneRecord } from '@orbital/core';
import { unlockFrom } from './profile';
import type { ProfileStore } from './store';

export interface AchievementTracker {
	/** Check these records; resolves when the profile is written. */
	check(records: readonly Pick<MilestoneRecord, 'kind' | 'body' | 'crewed'>[]): Promise<void>;
}

export function createAchievementTracker(options: {
	store: ProfileStore;
	achievements: readonly AchievementDefinition[];
	home: string;
	world: string;
	now?: () => string;
	/** True while the world has used a debug tool (plan 203, ADR 0200 point 8): nothing unlocks. */
	blocked?: () => boolean;
	onUnlock(achievement: AchievementDefinition): void;
}): AchievementTracker {
	let queue: Promise<void> = Promise.resolve();
	const now = options.now ?? (() => new Date().toISOString());
	return {
		check(records) {
			if (records.length === 0 || options.achievements.length === 0) return queue;
			if (options.blocked?.()) return queue;
			queue = queue
				.then(async () => {
					const r = unlockFrom(await options.store.get(), options.achievements, records, {
						home: options.home,
						world: options.world,
						at: now()
					});
					if (r.unlocked.length === 0) return;
					await options.store.put(r.profile);
					for (const a of r.unlocked) options.onUnlock(a);
				})
				// a profile that cannot be written loses this unlock, never the flight
				.catch(() => {});
			return queue;
		}
	};
}
