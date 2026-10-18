/** Challenges on the page (plan 131): import, the world, a finished run scored on each axis. */
import { describe, expect, it } from 'vitest';
import {
	bookStore,
	challengeOf,
	challengeWorldInput,
	finishRun,
	importChallenge,
	markWorld
} from './challenge-model';

const FILE = JSON.stringify({
	format: 'orbital-challenge',
	formatVersion: 1,
	id: 'acme.cheap-orbit',
	title: 'Cheap orbit',
	preset: 'stock.career',
	rules: { 'stock.starting-funds': 50000 },
	goal: 'orbit:stock.home',
	axes: ['cost', 'mass', 'time', 'dv-margin']
});

describe('challenges (plan 131)', () => {
	it('importing a challenge and finishing it records a score on each axis', () => {
		const store = bookStore();
		const imported = importChallenge(store, FILE);
		if (!imported.ok) throw new Error(imported.reason);
		const input = challengeWorldInput(imported.challenge, 'w-1', 7, '0.0.0');
		expect(input).toMatchObject({
			preset: 'stock.career',
			rules: { 'stock.starting-funds': 50000 },
			systemId: 'stock'
		});
		markWorld(store, 'w-1', imported.challenge.id);
		expect(challengeOf(store, 'w-1')?.title).toBe('Cheap orbit');

		// another milestone does not finish it
		expect(
			finishRun(store, 'w-1', 'launch', { cost: 1, mass: 1, time: 1, dvMargin: 1 })
		).toBeNull();
		const first = finishRun(store, 'w-1', 'orbit:stock.home', {
			cost: 26_000,
			mass: 9_800,
			time: 230,
			dvMargin: 410
		})!;
		expect(first.scores).toEqual([
			{ axis: 'cost', value: 26_000 },
			{ axis: 'mass', value: 9_800 },
			{ axis: 'time', value: 230 },
			{ axis: 'dv-margin', value: 410 }
		]);
		const second = finishRun(store, 'w-1', 'orbit:stock.home', {
			cost: 24_000,
			mass: 10_100,
			time: 250,
			dvMargin: 500
		})!;
		// lower is better, except the Δv margin
		expect(second.best).toEqual({ cost: 24_000, mass: 9_800, time: 230, 'dv-margin': 500 });
		expect(store.read().runs['acme.cheap-orbit']).toHaveLength(2);
	});

	it('a file that is not a challenge is refused with the reason', () => {
		expect(importChallenge(bookStore(), '{"format":"orbital-replay"}')).toEqual({
			ok: false,
			reason: 'not a challenge file'
		});
	});
});
