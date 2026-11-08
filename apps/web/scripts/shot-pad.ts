/**
 * A screenshot of the pad at High, for before and after comparisons of a rendering change that must not
 * change the look (plan 418). Headed, against any build:
 *
 *   SHOT_URL=http://localhost:5294 OUT=/tmp/pad-a.png bun scripts/shot-pad.ts
 */
import { chromium } from './lib/chromium';

const base = process.env.SHOT_URL ?? 'http://localhost:5294';
const out = process.env.OUT ?? 'pad.png';
const browser = await chromium.launch({
	headless: false,
	args: [
		`--use-angle=${process.platform === 'darwin' ? 'metal' : 'vulkan'}`,
		'--enable-gpu',
		'--ignore-gpu-blocklist',
		'--enable-unsafe-webgpu'
	]
});
try {
	const context = await browser.newContext({
		viewport: { width: 1512, height: 945 },
		deviceScaleFactor: 2,
		baseURL: base
	});
	await context.addInitScript(() => {
		localStorage.setItem('orbital.vab.hideStart', '1');
		localStorage.setItem('orbital.onboarding.off', '1');
		localStorage.setItem('orbital.graphics.renderer', 'webgpu');
		localStorage.setItem('orbital.graphics', 'high');
		localStorage.setItem('orbital.graphics.auto', 'off');
	});
	const setup = await context.newPage();
	await setup.goto('/vab');
	await setup.waitForFunction(
		() => typeof (window as any).__orbitalVab?.loadBooster === 'function'
	);
	await setup.evaluate(() => (window as any).__orbitalVab.loadBooster());
	await setup.waitForTimeout(1500);
	await setup.close();
	const page = await context.newPage();
	await page.goto('/flight');
	await page.getByTestId('world-loading').waitFor({ state: 'detached', timeout: 300_000 });
	await page.waitForTimeout(15000);
	await page.screenshot({ path: out });
} finally {
	await browser.close();
}
