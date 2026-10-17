/** The achievements profile (plan 102, ADR 0147): across worlds, export and import. */
import { loadPlugins } from '@orbital/core';
import Stock from '@orbital/mod-stock';
import { describe, expect, it } from 'vitest';
import { emptyProfile, mergeProfiles, parseProfile, serializeProfile, unlockFrom } from './profile';
import { memoryProfileStore } from './store';

const achievements = loadPlugins([Stock]).registries.achievements.list();
const home = 'stock.home';
const orbit = { kind: 'orbit', body: home, crewed: false } as const;

describe('achievements profile', () => {
	it('an achievement unlocked in one world stays unlocked in another', async () => {
		const store = memoryProfileStore();
		const first = unlockFrom(await store.get(), achievements, [orbit], {
			home,
			world: 'w-1',
			at: '2026-10-18T10:00:00.000Z'
		});
		expect(first.unlocked.map((a) => a.id)).toEqual(['stock.orbit']);
		await store.put(first.profile);
		// another world records the same first: nothing new, the unlock keeps its world and time
		const second = unlockFrom(await store.get(), achievements, [orbit], {
			home,
			world: 'w-2',
			at: '2026-10-19T10:00:00.000Z'
		});
		expect(second.unlocked).toEqual([]);
		expect((await store.get()).unlocked['stock.orbit']).toEqual({
			at: '2026-10-18T10:00:00.000Z',
			world: 'w-1'
		});
	});

	it('export then import restores the profile', () => {
		const { profile } = unlockFrom(
			emptyProfile(),
			achievements,
			[orbit, { kind: 'launch', crewed: false }],
			{
				home,
				world: 'w-1',
				at: '2026-10-18T10:00:00.000Z'
			}
		);
		expect(parseProfile(serializeProfile(profile))).toEqual(profile);
	});

	it('an import merges, keeping the earliest unlock', () => {
		const a = {
			...emptyProfile(),
			unlocked: { 'stock.orbit': { at: '2026-10-19T00:00:00.000Z', world: 'a' } }
		};
		const b = {
			...emptyProfile(),
			unlocked: {
				'stock.orbit': { at: '2026-10-18T00:00:00.000Z', world: 'b' },
				'stock.liftoff': { at: '2026-10-20T00:00:00.000Z', world: 'b' }
			}
		};
		expect(mergeProfiles(a, b).unlocked).toEqual(b.unlocked);
	});

	it('a file that is not a profile is refused with a sentence', () => {
		expect(() => parseProfile('nope')).toThrow('not JSON');
		expect(() => parseProfile('{"format":"orbital-sim-save"}')).toThrow(
			'not an achievements profile'
		);
		expect(() => parseProfile('{"format":"orbital-profile","version":2,"unlocked":{}}')).toThrow(
			'version 2'
		);
	});
});
