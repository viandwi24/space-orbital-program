/**
 * The console errors and warnings of a flight page's first seconds (plan 410): a failed pipeline (a
 * layout over a device limit, a shader that does not validate) leaves a look missing without any test
 * failing. Against a development build:
 *
 *   SHOT_URL=http://localhost:5241 bun scripts/check-console.ts
 *
 * Options (environment): SECONDS after the loading screen (15), PAGE (flight), PRESET (high).
 */
import { chromium } from '@playwright/test';

const base = process.env.SHOT_URL ?? 'http://localhost:5241';
const seconds = Number(process.env.SECONDS ?? 15);
const page0 = process.env.PAGE ?? 'flight';
const preset = process.env.PRESET ?? 'high';
const browser = await chromium.launch({
	headless: false,
	args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu']
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, baseURL: base });
await context.addInitScript((p) => {
	localStorage.setItem('orbital.vab.hideStart', '1');
	localStorage.setItem('orbital.onboarding.off', '1');
	localStorage.setItem('orbital.graphics.renderer', 'webgpu');
	localStorage.setItem('orbital.graphics', p);
	localStorage.setItem('orbital.graphics.auto', 'off');
}, preset);
const setup = await context.newPage();
await setup.goto('/vab');
await setup.waitForFunction(() => typeof (window as any).__orbitalVab?.loadBooster === 'function');
await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
await setup.waitForTimeout(1500);
await setup.close();
const page = await context.newPage();
const seen = new Map<string, number>();
page.on('console', (m) => {
	if (m.type() !== 'error' && m.type() !== 'warning') return;
	const text = m
		.text()
		.replace(/_\d+\b/g, '_N')
		.slice(0, 260);
	seen.set(text, (seen.get(text) ?? 0) + 1);
});
page.on('pageerror', (e) => seen.set(`pageerror: ${e.message}`.slice(0, 260), 1));
await page.goto(`/${page0}`);
if (page0 === 'flight')
	await page.waitForFunction(
		() => (window as any).__orbital?.snapshot?.()?.vessels?.length > 0,
		null,
		{
			timeout: 300_000
		}
	);
await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
await page.waitForTimeout(seconds * 1000);
console.log(seen.size === 0 ? 'no console errors or warnings' : `${seen.size} distinct messages:`);
for (const [text, n] of seen) console.log(`  ${n}x ${text}`);
await browser.close();
