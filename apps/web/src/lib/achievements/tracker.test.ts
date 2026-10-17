/** Unlocking during a flight (plan 102, ADR 0147 point 6). */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { toastForSimEvent, type ToastContext } from '../toasts';
import { memoryProfileStore } from './store';
import { createAchievementTracker } from './tracker';

const achievements = loadPlugins([Stock]).registries.achievements.list();

describe('achievement tracker', () => {
	it('unlocks once per achievement, in order, across repeated and caught-up records', async () => {
		const store = memoryProfileStore();
		const unlocked: string[] = [];
		const t = createAchievementTracker({
			store,
			achievements,
			home: 'stock.home',
			world: 'w-1',
			now: () => '2026-10-18T10:00:00.000Z',
			onUnlock: (a) => unlocked.push(a.id)
		});
		void t.check([{ kind: 'launch', crewed: false }]);
		void t.check([{ kind: 'launch', crewed: false }]);
		await t.check([
			{ kind: 'launch', crewed: false },
			{ kind: 'orbit', body: 'stock.home', crewed: false }
		]);
		expect(unlocked).toEqual(['stock.liftoff', 'stock.orbit']);
		expect(Object.keys((await store.get()).unlocked).sort()).toEqual([
			'stock.liftoff',
			'stock.orbit'
		]);
	});

	it('a profile that cannot be written does not throw into the flight', async () => {
		const t = createAchievementTracker({
			store: {
				get: async () => ({ format: 'orbital-profile', version: 1, unlocked: {} }),
				put: async () => {
					throw new Error('quota');
				}
			},
			achievements,
			home: 'stock.home',
			world: 'w',
			onUnlock: () => {}
		});
		await expect(t.check([{ kind: 'launch', crewed: false }])).resolves.toBeUndefined();
	});

	it('a first gets a ceremony toast for any vessel', () => {
		const ctx: ToastContext = {
			isActivePart: () => false,
			isActiveVessel: () => false,
			partTitle: (d) => d,
			definitionOf: () => undefined,
			home: 'stock.home'
		};
		const toast = toastForSimEvent(
			{
				type: 'milestone',
				id: 'crewed-landing:stock.cinder',
				kind: 'landing',
				body: 'stock.cinder',
				vessel: 9,
				crewed: true,
				time: 1
			},
			ctx
		);
		expect(toast).toMatchObject({ kind: 'success', title: 'First crewed landing on Cinder' });
	});
});
