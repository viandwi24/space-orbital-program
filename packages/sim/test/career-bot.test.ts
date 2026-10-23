/** Plan 095 / ADR 0098 guardrail: ten game years of launches and recoveries stay in the band. */
import { expect, test } from 'bun:test';
import { legacyWorldInfo } from '@orbital/core';
import { STOCK_STRATEGIES } from '@orbital/mod-stock';
import { runCareerBot } from './helpers/career-bot.ts';

/** 120 missions of 30 days; the band is the plan's (25 000 to 500 000 funds every day). */
const BAND = { min: 25_000, max: 500_000 };

test('career bot: 3 600 game days with only launches and recoveries (and three rival agencies) keep funds in the band', async () => {
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
	// the career preset runs three rival agencies (plan 126, ADR 0190): they flew, within their caps
	const agencies = bot.sim.snapshot().agencies!;
	expect(agencies.agencies).toHaveLength(3);
	for (const a of agencies.agencies) expect(a.objects.length).toBeLessThanOrEqual(2);
	expect(agencies.news.length).toBeGreaterThan(10);
	expect(bot.min).toBeGreaterThanOrEqual(BAND.min);
	expect(bot.max).toBeLessThanOrEqual(BAND.max);
	// about 13 s alone on an M5 (9 s at plan 122); the parallel full suite on a slow runner takes
	// 47 s or more, which failed CI at 45 s: 120 s still catches a 9x regression
	expect(seconds).toBeLessThan(120);
	bot.sim.dispose();
}, 180_000);

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
	expect(seconds).toBeLessThan(120);
	bot.sim.dispose();
}, 180_000);

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
	expect(seconds).toBeLessThan(120);
	bot.sim.dispose();
}, 180_000);

// Plan 101 (ADR 0187 point 8): each stock strategy active for ten years. Strategies offered to a
// government run there with a launch a month; the others run in a hybrid world, whose grant pays
// for a launch a quarter (a company has no budget: the bot's launches alone cannot run one).
for (const s of STOCK_STRATEGIES) {
	const agency = !s.agencyTypes || s.agencyTypes.includes('government') ? 'government' : 'hybrid';
	const everyDays = agency === 'government' ? 30 : 90;
	test(`career bot with ${s.label} (${agency}, plan 101): 3 600 days stay in the band`, async () => {
		const base = legacyWorldInfo(7);
		const bot = await runCareerBot({
			world: {
				...base,
				id: `career-bot-${s.id}`,
				preset: 'stock.career',
				rules: { ...base.rules, 'stock.agency-type': agency }
			},
			days: 3_600,
			everyDays,
			strategy: s.id
		});
		console.log(
			`career bot with ${s.label} (${agency}): funds min ${Math.round(bot.min)} max ${Math.round(bot.max)} end ${Math.round(bot.daily.at(-1)!)}`
		);
		expect(bot.missions).toBe(3_600 / everyDays);
		expect(bot.min).toBeGreaterThanOrEqual(BAND.min);
		expect(bot.max).toBeLessThanOrEqual(BAND.max);
		bot.sim.dispose();
	}, 90_000);
}
