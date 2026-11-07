/**
 * Prints what the renderer says about the orbit view of plan 416: each look's relevance level at
 * 400 km (is the cloud march or the shell drawn there at all?).
 *
 *   SHOT_URL=http://localhost:5230 SHOT_PRESET=low bun scripts/probe-416.ts
 */
import { chromium } from './lib/chromium';
import { setupVessel, waitForFlight } from './lib/frame-matrix';

const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({
	viewport: { width: 1600, height: 900 },
	baseURL: process.env.SHOT_URL ?? 'http://localhost:5230'
});
await context.addInitScript(
	([b, p]) => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', b!);
		localStorage.setItem('orbital.graphics', p!);
		localStorage.setItem('orbital.graphics.auto', 'off');
	},
	[process.env.SHOT_BACKEND ?? 'webgpu', process.env.SHOT_PRESET ?? 'low']
);
const hangar = await context.newPage();
await setupVessel(hangar);
await hangar.close();
const page = await context.newPage();
await page.goto('/flight');
await waitForFlight(page, 300_000);
await page.waitForTimeout(5000);
console.log(
	'backend',
	await page.evaluate(() => {
		const r = (window as any).__orbital.renderer();
		return {
			compiles: r.compiles ? r.compiles.pipelines.length : null,
			gpu: !!(navigator as any).gpu,
			keys: Object.keys(r).slice(0, 40)
		};
	})
);
for (const alt of [400_000, 100_000, 30_000]) {
	await page.evaluate(
		(a) =>
			(window as any).__orbitalDebug.setLocation({
				kind: 'air',
				body: 'stock.home',
				latitude: 0.35,
				longitude: -0.4,
				altitude: a,
				speed: 0,
				climb: 0
			}),
		alt
	);
	await page.waitForTimeout(4000);
	const costs = await page.evaluate(() => (window as any).__orbital.renderer().debug.lookCosts());
	console.log(alt, JSON.stringify(costs));
}
await browser.close();
