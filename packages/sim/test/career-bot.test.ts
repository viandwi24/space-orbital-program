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
	expect(seconds).toBeLessThan(30);
	bot.sim.dispose();
}, 60_000);
