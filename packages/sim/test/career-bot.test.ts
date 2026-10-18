/** Plan 095 / ADR 0098 guardrail: ten game years of launches and recoveries stay in the band. */
import { expect, test } from 'bun:test';
import { legacyWorldInfo } from '@orbital/core';
import { runCareerBot } from './helpers/career-bot.ts';

/** 120 missions of 30 days; the band is the plan's (25 000 to 500 000 funds every day). */
const BAND = { min: 25_000, max: 500_000 };

test('career bot: 3 600 game days with only launches and recoveries keep funds in the band', async () => {
	const started = performance.now();
	const bot = await runCareerBot({
		world: { ...legacyWorldInfo(7), id: 'career-bot', preset: 'stock.career' },
		days: 3_600
	});
	const seconds = (performance.now() - started) / 1000;
	const causes = new Map<string, number>();
	for (const e of bot.entries) causes.set(e.cause, (causes.get(e.cause) ?? 0) + e.amount);
	console.log(
		`career bot: ${bot.missions} missions, ${bot.daily.length} days, funds min ${Math.round(bot.min)} max ${Math.round(bot.max)} end ${Math.round(bot.daily.at(-1)!)}, ${seconds.toFixed(1)} s;`,
		Object.fromEntries([...causes].map(([k, v]) => [k, Math.round(v)]))
	);
	expect(bot.missions).toBe(120);
	expect(bot.daily).toHaveLength(3_600);
	expect(bot.min).toBeGreaterThanOrEqual(BAND.min);
	expect(bot.max).toBeLessThanOrEqual(BAND.max);
	// about 9 s alone on an M5 since plan 122 (7.4 s before the Sun: home's orbit is propagated at
	// every comms sample); 45 s leaves room for the parallel full suite and still catches a 5x regression
	expect(seconds).toBeLessThan(45);
	bot.sim.dispose();
}, 60_000);

test('career bot with markets: 10 years of launches buying fuel, a propellant plant from year 2, sales above base', async () => {
	const started = performance.now();
	const bot = await runCareerBot({
		world: { ...legacyWorldInfo(7), id: 'career-bot-markets', preset: 'stock.career' },
		days: 3_600,
		markets: true
	});
	const seconds = (performance.now() - started) / 1000;
	const income = new Map<string, number>();
	for (const e of bot.entries)
		if (e.amount > 0 && e.currency === 'funds')
			income.set(e.cause, (income.get(e.cause) ?? 0) + e.amount);
	const total = [...income.values()].reduce((a, b) => a + b, 0);
	const shares = Object.fromEntries(
		[...income].map(([k, v]) => [k, Math.round((v / total) * 1000) / 10])
	);
	console.log(
		`career bot with markets: funds min ${Math.round(bot.min)} max ${Math.round(bot.max)} end ${Math.round(bot.daily.at(-1)!)}, ${seconds.toFixed(1)} s; income shares %`,
		shares
	);
	expect(bot.missions).toBe(120);
	expect(bot.min).toBeGreaterThanOrEqual(BAND.min);
	expect(bot.max).toBeLessThanOrEqual(BAND.max);
	expect(income.get('stock.market-sell') ?? 0).toBeGreaterThan(0);
	for (const v of income.values()) expect(v / total).toBeLessThanOrEqual(0.8);
	expect(seconds).toBeLessThan(45);
	bot.sim.dispose();
}, 60_000);

test('career bot with contracts (plan 099): 3 600 days with an altitude job a mission keep funds in the band', async () => {
	const started = performance.now();
	const bot = await runCareerBot({
		world: { ...legacyWorldInfo(7), id: 'career-bot-contracts', preset: 'stock.career' },
		days: 3_600,
		contracts: true
	});
	const seconds = (performance.now() - started) / 1000;
	const causes = new Map<string, number>();
	for (const e of bot.entries) {
		const cause = e.cause.startsWith('gen.') ? 'contract.reward-or-penalty' : e.cause;
		if (e.currency === 'funds') causes.set(cause, (causes.get(cause) ?? 0) + e.amount);
	}
	console.log(
		`career bot with contracts: ${bot.missions} missions, ${bot.completed} contracts, funds min ${Math.round(bot.min)} max ${Math.round(bot.max)} end ${Math.round(bot.daily.at(-1)!)}, ${seconds.toFixed(1)} s;`,
		Object.fromEntries([...causes].map(([k, v]) => [k, Math.round(v)]))
	);
	expect(bot.missions).toBe(120);
	expect(bot.completed).toBeGreaterThan(100);
	expect(causes.get('contract.advance')!).toBeGreaterThan(0);
	expect(causes.get('contract.reward-or-penalty')!).toBeGreaterThan(0);
	expect(bot.min).toBeGreaterThanOrEqual(BAND.min);
	expect(bot.max).toBeLessThanOrEqual(BAND.max);
	expect(seconds).toBeLessThan(45);
	bot.sim.dispose();
}, 60_000);
