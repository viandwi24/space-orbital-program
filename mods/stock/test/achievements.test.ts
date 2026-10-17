/** Stock achievements (plan 102, ADR 0147). */
import { describe, expect, test } from 'bun:test';
import { achievementMatches, loadPlugins } from '@orbital/sdk';
import Stock, { STOCK_ACHIEVEMENTS } from '../src/index.ts';

describe('stock achievements', () => {
	test('all register and each matches a first a stock world can make', () => {
		const { registries } = loadPlugins([Stock]);
		expect(registries.achievements.list()).toHaveLength(STOCK_ACHIEVEMENTS.length);
		const home = 'stock.home';
		const away = 'stock.cinder';
		const firsts = [
			{ kind: 'launch', crewed: false },
			{ kind: 'orbit', body: home, crewed: true },
			{ kind: 'return', body: home, crewed: false },
			{ kind: 'flyby', body: away, crewed: false },
			{ kind: 'landing', body: away, crewed: false },
			{ kind: 'return', body: away, crewed: false }
		] as const;
		for (const a of STOCK_ACHIEVEMENTS)
			expect(
				firsts.some((r) => achievementMatches(a, r, home)),
				a.id
			).toBe(true);
	});

	test('body home and away, and crewed, narrow the match', () => {
		const orbit = STOCK_ACHIEVEMENTS.find((a) => a.id === 'stock.orbit')!;
		const crewed = STOCK_ACHIEVEMENTS.find((a) => a.id === 'stock.crewed-orbit')!;
		expect(
			achievementMatches(
				orbit,
				{ kind: 'orbit', body: 'stock.cinder', crewed: false },
				'stock.home'
			)
		).toBe(false);
		expect(
			achievementMatches(crewed, { kind: 'orbit', body: 'stock.home', crewed: false }, 'stock.home')
		).toBe(false);
		expect(
			achievementMatches(
				crewed,
				{ kind: 'orbit', body: 'stock.cinder', crewed: true },
				'stock.home'
			)
		).toBe(true);
	});
});
