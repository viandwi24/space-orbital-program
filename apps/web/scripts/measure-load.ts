/**
 * Load time and bytes of the main menu and of the flight page, cold cache, in Playwright's
 * Chromium against the build served with the production headers (plan 023, journal 023):
 *
 *   bun scripts/serve.ts 5214 &  SHOT_URL=http://localhost:5214 bun scripts/measure-load.ts
 *
 * WebGL is software-rendered here, so the flight time is an upper bound for a machine with a GPU.
 * The page's own marks are read: `orbital:flight-booted` (the sim Worker has the vessel) and
 * `orbital:flight-playable` (the first HUD model, which needs a drawn frame).
 */
import { chromium, type Page } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5214';
const browser = await chromium.launch({
	args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});

async function bytes(
	page: Page
): Promise<{ requests: number; transferKB: number; decodedKB: number }> {
	return page.evaluate(() => {
		const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
		const doc = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
		const all = [...res, doc];
		return {
			requests: all.length,
			transferKB: Math.round(all.reduce((a, r) => a + r.transferSize, 0) / 1024),
			decodedKB: Math.round(all.reduce((a, r) => a + r.decodedBodySize, 0) / 1024)
		};
	});
}

// 1. A profile with a vessel in it.
const seed = await browser.newContext({ viewport: { width: 1920, height: 1080 }, baseURL: base });
const sp = await seed.newPage();
await sp.goto('/vab');
await sp.getByRole('button', { name: 'Load the two-stage example' }).click();
await sp.waitForTimeout(1500);
const state = await seed.storageState();
await seed.close();

for (let run = 1; run <= 3; run++) {
	const ctx = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		baseURL: base,
		storageState: state
	});
	const page = await ctx.newPage();
	await page.goto('/', { waitUntil: 'load' });
	await page.getByRole('navigation', { name: 'Main menu' }).waitFor();
	const menu = await page.evaluate(() => ({
		fcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1),
		loadMs: Math.round(
			(performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).loadEventEnd
		)
	}));
	console.log(`run ${run} menu`, JSON.stringify({ ...menu, ...(await bytes(page)) }));
	await ctx.close();

	const ctx2 = await browser.newContext({
		viewport: { width: 1920, height: 1080 },
		baseURL: base,
		storageState: state
	});
	const p2 = await ctx2.newPage();
	await p2.goto('/flight', { waitUntil: 'load' });
	await p2.waitForFunction(
		() => performance.getEntriesByName('orbital:flight-playable').length > 0,
		null,
		{
			timeout: 120_000
		}
	);
	const flight = await p2.evaluate(() => ({
		fcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1),
		bootedMs: Math.round(performance.getEntriesByName('orbital:flight-booted')[0]!.startTime),
		playableMs: Math.round(performance.getEntriesByName('orbital:flight-playable')[0]!.startTime)
	}));
	console.log(`run ${run} flight`, JSON.stringify({ ...flight, ...(await bytes(p2)) }));
	await ctx2.close();
}
await browser.close();
