/** Plan 097 / ADR 0124 point 3: the market model, against a table worked out by hand. */
import { describe, expect, test } from 'bun:test';
import { freshMarket, marketTick, rawPrice, type CommodityDefinition, type MarketParams } from '../src/index.ts';

const m: MarketParams = { target: 50_000, elasticity: 0.5, cap: 0.05, floor: 0.4, ceiling: 2.5, relaxDays: 30 };
const fuel = { id: 't.fuel', label: 'Fuel', unit: 'u', basePrice: 0.8, market: m } as CommodityDefinition & {
	market: MarketParams;
};
const k = 1 - Math.exp(-1 / 30); // 0.032780…

describe('the market model', () => {
	test('selling 10 000 units a day: at most 5 % a tick, down to the floor of 0.4 × base', () => {
		let s = freshMarket(fuel);
		// day 1 by hand: stock 60 000 → relaxed 60 000 − 10 000 k = 59 672.2; raw 0.8 √(50 000 / 59 672.2)
		// = 0.73230; the cap allows 0.76, so the price is 0.76
		s = { ...s, stock: s.stock + 10_000 };
		s = marketTick(s, 0.8, m);
		expect(s.stock).toBeCloseTo(60_000 - 10_000 * k, 6);
		expect(s.price).toBeCloseTo(0.76, 12);
		const table = [0.76];
		for (let day = 2; day <= 10; day++) {
			const before = s.price;
			s = marketTick({ ...s, stock: s.stock + 10_000 }, 0.8, m);
			expect(s.price).toBeGreaterThanOrEqual(before * 0.95 - 1e-12);
			table.push(s.price);
		}
		// days 1 to 4 fall by the cap (0.8 × 0.95^n); from day 5 the raw price is above the capped one
		for (let n = 1; n <= 4; n++) expect(table[n - 1]).toBeCloseTo(0.8 * 0.95 ** n, 12);
		expect(s.history).toEqual(table);
		for (let day = 11; day <= 400; day++) s = marketTick({ ...s, stock: s.stock + 10_000 }, 0.8, m);
		// the stock settles where relaxation takes the day's 10 000 back: (s + 10 000 − 50 000) k = 10 000,
		// s = 40 000 + 10 000 / k ≈ 345 000, far below the floor's price
		expect(s.stock).toBeCloseTo(40_000 + 10_000 / k, -1);
		expect(s.price).toBeCloseTo(0.4 * 0.8, 12);
		expect(s.history).toHaveLength(90);
	});

	test('when the sales stop the price climbs back toward base as the stock relaxes', () => {
		let s = { price: 0.32, stock: 355_000, history: [] as number[] };
		const prices: number[] = [];
		for (let day = 1; day <= 120; day++) {
			s = marketTick(s, 0.8, m);
			prices.push(s.price);
		}
		for (let i = 1; i < prices.length; i++) expect(prices[i]!).toBeGreaterThanOrEqual(prices[i - 1]!);
		// the stock relaxes: 50 000 + 305 000 e^(−120/30)
		expect(s.stock).toBeCloseTo(50_000 + 305_000 * Math.exp(-4), 0);
		expect(s.price).toBeCloseTo(rawPrice(0.8, m, s.stock), 12);
		expect(s.price).toBeGreaterThan(0.65);
		expect(s.price).toBeLessThan(0.8);
	});

	test('the raw price is clamped to the floor and the ceiling', () => {
		expect(rawPrice(0.8, m, 1e9)).toBeCloseTo(0.32, 12);
		expect(rawPrice(0.8, m, 0)).toBeCloseTo(2, 12);
		expect(rawPrice(0.8, m, 50_000)).toBeCloseTo(0.8, 12);
	});
});
